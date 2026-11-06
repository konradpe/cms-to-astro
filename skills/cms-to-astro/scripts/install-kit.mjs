#!/usr/bin/env node
// Install the migration kit (assets/kit) into an Astro project: routes at the old URLs, languages,
// head tags, wireframes, placeholders, status page, sitemap filter. Copies without overwriting,
// writes src/migration/site.config.ts and prints the astro.config.mjs lines and package installs.
// No dependencies; Node >= 22.
//
//   node install-kit.mjs --old-origin https://www.example.com --locales de,en --url-style preserve

import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: node install-kit.mjs --old-origin <url> [options]   (run from the project folder or pass --into)

  --old-origin <url>    The old website (https://www.example.com). Also the Astro \`site\` until go-live.
  --locales <list>      Language codes, default first (de,en). Each code is also that language's URL
                        prefix (/en/…). Default: en (a single-language site).
  --prefix-default      The default language has a prefix too (/de/…), not just the others.
  --url-style <style>   How the old URLs look (keep them; see references/astro-setup.md §6):
                          directory  /about/          (WordPress)        default
                          preserve   /kontakt, /en/   (TYPO3, Joomla, Drupal)
                          file       /about.html      (static HTML)
  --site-name <text>    Site name for <title> and the default header (default: the domain)
  --into <dir>          Project folder (default: .)
  --dry-run             Only report what would be copied
  --help                Show this help

Copies assets/kit into the project without overwriting existing files (skipped files are listed),
writes src/migration/site.config.ts from the options, creates src/content/pages and news, and prints
the astro.config.mjs additions, the packages to install, and existing pages that shadow kit routes.
Documentation of the kit: src/migration/KIT.md after installing.`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const fail = (msg) => {
  console.error(`${msg} See --help.`);
  process.exit(1);
};

let origin;
try {
  origin = new URL(opt('old-origin', '')).origin;
} catch {
  fail('Need --old-origin with a full URL (https://www.example.com).');
}
const locales = opt('locales', 'en').split(',').map((l) => l.trim().toLowerCase()).filter(Boolean);
if (!locales.length || locales.some((l) => !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(l))) fail('--locales takes language codes like de,en or pt-br.');
const STYLES = { directory: ['directory', 'always'], preserve: ['preserve', 'ignore'], file: ['file', 'never'] };
const style = opt('url-style', 'directory');
if (!STYLES[style]) fail('--url-style must be directory, preserve or file.');
const prefixDefault = args.includes('--prefix-default');
const siteName = opt('site-name', new URL(origin).hostname.replace(/^www\./, ''));
const into = path.resolve(opt('into', '.'));
const dryRun = args.includes('--dry-run');

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/kit');
const exists = async (f) => !!(await stat(f).catch(() => null));
const rel = (f) => path.relative(into, f).split(path.sep).join('/');

if (!(await exists(path.join(into, 'package.json')))) fail(`No package.json in ${into}: scaffold the Astro project first.`);
const pkg = JSON.parse(await readFile(path.join(into, 'package.json'), 'utf8'));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

// 1. Copy the kit. KIT.md goes to src/migration/; site.config.ts is written from the options below.
const files = [];
const walk = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) await walk(f);
    else files.push(path.relative(KIT, f));
  }
};
await walk(KIT);
const copied = [];
const skipped = [];
for (const file of files.sort()) {
  const target = path.join(into, file === 'KIT.md' ? 'src/migration/KIT.md' : file);
  if (file.split(path.sep).join('/') === 'src/migration/site.config.ts') continue;
  if (await exists(target)) {
    skipped.push(rel(target));
    continue;
  }
  if (!dryRun) {
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(KIT, file), target);
  }
  copied.push(rel(target));
}

// 2. site.config.ts
const configFile = path.join(into, 'src/migration/site.config.ts');
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
if (await exists(configFile)) {
  skipped.push(`${rel(configFile)} (check its values against these options)`);
} else {
  const template = await readFile(path.join(KIT, 'src/migration/site.config.ts'), 'utf8');
  // Only the values: the interface above them mentions the same names.
  const at = template.indexOf('export const site');
  const config = template.slice(0, at) + template.slice(at)
    .replace(/oldOrigin: '[^']*'/, `oldOrigin: ${q(origin)}`)
    .replace(/name: '[^']*'/, `name: ${q(siteName)}`)
    .replace(/locales: \[[^\]]*\]/, `locales: [${locales.map(q).join(', ')}]`)
    .replace(/prefixDefaultLocale: (true|false)/, `prefixDefaultLocale: ${prefixDefault}`)
    .replace(/urlStyle: '[^']*'/, `urlStyle: ${q(style)}`);
  if (!dryRun) {
    await mkdir(path.dirname(configFile), { recursive: true });
    await writeFile(configFile, config);
  }
  copied.push(`${rel(configFile)} (written from the options)`);
}

// 3. Content folders (the loader warns about missing ones on every build)
for (const name of ['pages', 'news']) {
  const d = path.join(into, 'src/content', name);
  if (!dryRun && !(await exists(d))) await mkdir(d, { recursive: true });
}

// 4. Report
console.log(`${dryRun ? 'Would copy' : 'Copied'} ${copied.length} file(s) into ${into}`);
if (skipped.length) console.log(`\nSkipped (already there, not overwritten):\n${skipped.map((s) => `  ${s}`).join('\n')}`);

const notes = [];
if (skipped.includes('src/content.config.ts') && !(await readFile(path.join(into, 'src/content.config.ts'), 'utf8')).includes('migrationCollection')) {
  notes.push(`src/content.config.ts exists: add the kit's collections there:
    import { migrationCollection } from './migration/schema';
    // in collections:
    pages: migrationCollection('pages'),
    news: migrationCollection('news'),`);
}
if (await exists(path.join(into, 'src/content/config.ts'))) notes.push('src/content/config.ts is the pre-Astro-5 location; Astro 7 reads src/content.config.ts. Move its collections there.');
const shadowing = [];
for (const f of ['src/pages/index.astro', 'src/pages/index.md', ...locales.map((l) => `src/pages/${l}/index.astro`)]) {
  if (await exists(path.join(into, f))) shadowing.push(f);
}
if (shadowing.length) {
  notes.push(`These page files take their URL from the kit's catch-all route (home page or "not moved yet" page):
${shadowing.map((f) => `    ${f}`).join('\n')}
  Delete them if they are scaffold/theme demo pages; keep them if they are the designed home page (it can
  read its content with entryAt('/') from src/migration/content.ts).`);
}
if (skipped.includes('src/pages/404.astro')) notes.push("src/pages/404.astro exists (theme): it stays the default language's 404 page; other languages use the kit's.");
if (await exists(path.join(into, 'src/middleware.ts')) || await exists(path.join(into, 'src/middleware.js'))) notes.push('src/middleware exists: the kit needs none; check it does not rewrite or redirect the old paths.');
const astroMajor = Number(String(deps.astro ?? '').match(/\d+/)?.[0]);
if (!astroMajor) notes.push('astro is not in package.json.');
else if (astroMajor < 7) notes.push(`astro ${deps.astro} found; the kit is written for Astro 7.`);
if (notes.length) console.log(`\nCheck:\n${notes.map((n) => `- ${n}`).join('\n')}`);

const [format, trailingSlash] = STYLES[style];
const needs404 = style === 'directory' && locales.some((l, i) => i > 0 || prefixDefault);
console.log(`
Add to astro.config.mjs (merge with what the file already has; no Astro i18n routing needed, the kit routes by old paths):

import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { sitemapOptions } from './src/migration/sitemap.mjs';
import pendingPages from './integrations/pending-pages.mjs';${needs404 ? "\nimport locale404 from './src/migration/locale-404.mjs';" : ''}

export default defineConfig({
  site: '${origin}',
  build: { format: '${format}' },
  trailingSlash: '${trailingSlash}',
  integrations: [
    sitemap(sitemapOptions()),
    pendingPages({ oldOrigin: '${origin}' }), // migration only: remove at go-live${needs404 ? '\n    locale404(),' : ''}
  ],
});`);

const missing = ['astro', '@astrojs/sitemap'].filter((p) => !deps[p]);
console.log(missing.length ? `\nInstall: npm i ${missing.join(' ')}` : '\nPackages: astro and @astrojs/sitemap are installed.');
console.log(`\nThen: content into src/content/pages and src/content/news (content-to-md.mjs), npm run build, and plug in the
theme via src/migration/theme/index.ts (src/migration/KIT.md).`);
