#!/usr/bin/env node
// Starlight recipe of the cms-to-astro migration kit. Run in a project scaffolded from the Starlight
// template (or the npm-only fallback) after install-kit.mjs; it wires the kit into Starlight:
// docs collection with the migration fields, old URLs as page ids, hreflang and language switcher
// by translationKey, Starlight's fallback copies removed, the kit's placeholders, 404, status page
// and sitemap filter in Starlight's frame. Idempotent; --check reports drift. Node built-ins only.
//
//   node <skill-dir>/assets/themes/starlight/adapt.mjs [--into <dir>] [--check | --dry-run]

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: node adapt.mjs [options]   (run from the project folder or pass --into)

Wires the migration kit into a Starlight project (recipe: references/themes/starlight.md).
Order: scaffold Starlight → install-kit.mjs → adapt.mjs. Settings come from the kit's
src/migration/site.config.ts (old origin, locales, URL style, site name).

  --into <dir>          Project folder (default: .)
  --check               Change nothing; report what differs from the recipe (exit 1 if anything does)
  --dry-run             Change nothing; print what would be done
  --old-origin <url>    Kit options: if the kit is not installed yet, run install-kit.mjs with
  --locales <list>      these first; if it is, they must match site.config.ts
  --url-style <style>
  --prefix-default
  --site-name <text>
  --help                Show this help

What it does: replaces the template's astro.config.mjs and src/content.config.ts (exact match
required, else it stops and prints what to merge), removes the kit's catch-all route files and the
template's demo pages (only if unchanged), copies the recipe's files (src/migration/starlight/,
StarlightShell, alias routes, placeholder templates, integrations/starlight-migration.mjs,
src/styles/theme.css) without overwriting, points the kit Shell at Starlight, and prints the
remaining manual steps.`;

const PINNED = { '@astrojs/starlight': '0.42.9', astro: '7.4.7', '@astrojs/sitemap': '3.7.4' };

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const CHECK = args.includes('--check');
const DRY = args.includes('--dry-run') || CHECK;
const into = path.resolve(opt('into') ?? '.');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '../../..');
const KIT = path.join(SKILL, 'assets/kit');
const OVERLAY = path.join(HERE, 'overlay');

const exists = async (f) => !!(await stat(f).catch(() => null));
const read = (f) => readFile(f, 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n');
const sha = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');
const at = (rel) => path.join(into, rel);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(2);
};

const report = { changed: [], ok: [], drift: [], notes: [] };
const did = (line) => report.changed.push(`${DRY ? '(would) ' : ''}${line}`);
const drift = (line) => report.drift.push(line);

// ---------------------------------------------------------------------------------------------
// 0. Preconditions: Starlight project, kit installed (or installed now from the flags)

if (!(await exists(at('package.json')))) fail(`No package.json in ${into}: scaffold the Starlight project first (references/themes/starlight.md).`);
const pkg = JSON.parse(await read(at('package.json')));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
if (!deps['@astrojs/starlight']) fail('@astrojs/starlight is not in package.json: this is not a Starlight project. Scaffold it first (references/themes/starlight.md).');

const kitFlags = ['old-origin', 'locales', 'url-style', 'site-name'].filter((f) => opt(f) !== undefined);
if (args.includes('--prefix-default')) kitFlags.push('prefix-default');
if (!(await exists(at('src/migration/site.config.ts')))) {
  if (!opt('old-origin')) fail('The migration kit is not installed. Run install-kit.mjs first, or pass --old-origin, --locales and --url-style here.');
  if (DRY) fail('The migration kit is not installed; --check/--dry-run need it.');
  const forward = kitFlags.flatMap((f) => (f === 'prefix-default' ? ['--prefix-default'] : [`--${f}`, opt(f)]));
  console.log(`Installing the migration kit: install-kit.mjs ${forward.join(' ')}\n(ignore its astro.config.mjs lines: this script writes astro.config.mjs)\n`);
  const run = spawnSync(process.execPath, [path.join(SKILL, 'scripts/install-kit.mjs'), ...forward, '--into', into], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (run.status !== 0) fail('install-kit.mjs failed.');
  console.log(run.stdout.split('\nAdd to astro.config.mjs')[0].trim() + '\n');
}

const siteConfigText = await read(at('src/migration/site.config.ts'));
const cfg = parseSiteConfig(siteConfigText);
if (opt('old-origin') && new URL(opt('old-origin')).origin !== cfg.oldOrigin) fail(`--old-origin differs from site.config.ts (${cfg.oldOrigin}).`);
if (opt('locales') && opt('locales').split(',').map((l) => l.trim().toLowerCase()).join(',') !== cfg.locales.join(',')) fail(`--locales differs from site.config.ts (${cfg.locales.join(',')}).`);
if (opt('url-style') && opt('url-style') !== cfg.urlStyle) fail(`--url-style differs from site.config.ts (${cfg.urlStyle}).`);
if (args.includes('--prefix-default') !== cfg.prefixDefaultLocale && kitFlags.length) fail(`--prefix-default differs from site.config.ts (prefixDefaultLocale: ${cfg.prefixDefaultLocale}).`);

function parseSiteConfig(text) {
  const body = text.slice(text.indexOf('export const site'));
  if (!body.startsWith('export const site')) fail('src/migration/site.config.ts: `export const site` not found.');
  const str = (name) => body.match(new RegExp(`\\n\\s*${name}: '((?:[^'\\\\]|\\\\.)*)'`))?.[1]?.replace(/\\(.)/g, '$1');
  const locales = body.match(/\n\s*locales: \[([^\]]*)\]/)?.[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const prefix = body.match(/\n\s*prefixDefaultLocale: (true|false)/)?.[1];
  const parsed = { oldOrigin: str('oldOrigin'), name: str('name'), locales, prefixDefaultLocale: prefix === 'true', urlStyle: str('urlStyle') };
  for (const [k, v] of Object.entries(parsed)) if (v === undefined || (Array.isArray(v) && !v.length)) fail(`src/migration/site.config.ts: could not read \`${k}\`.`);
  if (!['directory', 'preserve', 'file'].includes(parsed.urlStyle)) fail(`src/migration/site.config.ts: unknown urlStyle '${parsed.urlStyle}'.`);
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// Known starting points (exact text): the Starlight template (examples/basics, create-astro 5.3.1,
// November 2026), the npm-only fallback of references/astro-setup.md §1, the kit's own content.config.ts.

const TEMPLATE_ASTRO_CONFIG = `// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'My Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
			],
		}),
	],
});
`;
const MINIMAL_ASTRO_CONFIG = `import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n`;
const TEMPLATE_CONTENT_CONFIG = `import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
`;
const TEMPLATE_DEMO = {
  'src/content/docs/index.mdx': '893cf90c89201a3e9125a8b26aef80fa07b228143c605aa8006d74583dd24d10',
  'src/content/docs/guides/example.md': '515d9abd750ee638417af4bd384e0da8a506fb0b8dfe495c0d7bfc4ea7bb71e0',
  'src/content/docs/reference/example.md': 'f8934524ab1ed892e08c8b462c9965554a04f04634ea3992de134a2d0027b162',
  'src/assets/houston.webp': '1bcfcd2abfb0d8abd362df7eabc56b775a1cc62ab27fa1a4f973822d3dfb5240',
};
// Kit files the recipe replaces: Starlight routes the docs pages, so the catch-all and its views go.
const KIT_REPLACED = [
  'src/pages/[...path].astro',
  'src/pages/[...path]/index.astro',
  'src/migration/Route.astro',
  'src/migration/EntryView.astro',
  'src/migration/content.ts',
  'src/migration/Wireframe.astro',
  'src/pages/migration-pending/[...locale].astro',
  'src/migration/theme/PageTemplate.astro',
];

// ---------------------------------------------------------------------------------------------
// 1. astro.config.mjs

const STYLES = { directory: ['directory', 'always'], preserve: ['preserve', 'ignore'], file: ['file', 'never'] };
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const bcp47 = (l) => l.replace(/-([a-z]{2})$/, (_, r) => `-${r.toUpperCase()}`);
const labelOf = (l) => {
  const name = new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l;
  return name.charAt(0).toLocaleUpperCase(l) + name.slice(1);
};
const prefixOf = (l) => (l === cfg.locales[0] && !cfg.prefixDefaultLocale ? '' : l);

function astroConfig() {
  const [format, trailingSlash] = STYLES[cfg.urlStyle];
  const prefixed = cfg.locales.filter(prefixOf);
  const needs404 = format === 'directory' && prefixed.length > 0;
  const home = (l) => (cfg.urlStyle === 'file' ? `/${l}.html` : `/${l}/`);
  const localeLines = cfg.locales.map((l) => `\t\t\t\t${prefixOf(l) ? (/^[a-z]+$/.test(l) ? l : q(l)) : 'root'}: { label: ${q(labelOf(l))}, lang: ${q(bcp47(l))} },`);
  const templates = prefixed.map((l) => `${q(`/${l}/`)}: ${q(`/${l}/migration-pending/`)}`).join(', ');
  return `// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { sitemapOptions } from './src/migration/sitemap.mjs';
import pendingPages from './integrations/pending-pages.mjs';
import starlightMigration, { withoutRemovedPages } from './integrations/starlight-migration.mjs';${needs404 ? "\nimport locale404 from './src/migration/locale-404.mjs';" : ''}

// Starlight + migration kit (cms-to-astro skill: references/themes/starlight.md).
// site, build.format, trailingSlash and the locales follow src/migration/site.config.ts: change both.
export default defineConfig({
	site: ${q(cfg.oldOrigin)},
	build: { format: '${format}' },
	trailingSlash: '${trailingSlash}',${cfg.prefixDefaultLocale ? `\n\tredirects: { '/': ${q(home(cfg.locales[0]))} }, // no root language: / leads to the default language` : ''}
	integrations: [
		starlight({
			title: ${q(cfg.name)},
			locales: {
${localeLines.join('\n')}
			},${cfg.prefixDefaultLocale ? `\n\t\t\tdefaultLocale: ${q(cfg.locales[0])},` : ''}
			// No \`sidebar\`: generated per language from the folders in src/content/docs.
			// The kit's 404 pages (404.html${prefixed.length ? `, ${prefixed[0]}/404.html` : ''}) replace Starlight's.
			disable404Route: true,
			// Old URLs, hreflang by translationKey, sidebar links, fallback pages.
			routeMiddleware: './src/migration/starlight/route-data.ts',
			components: {
				LanguageSelect: './src/migration/starlight/LanguageSelect.astro',
				MarkdownContent: './src/migration/starlight/MarkdownContent.astro',
				PageTitle: './src/migration/starlight/PageTitle.astro',
			},
			customCss: ['./src/styles/theme.css'],
		}),
		sitemap(withoutRemovedPages(sitemapOptions())),
		starlightMigration(),
		pendingPages({ oldOrigin: ${q(cfg.oldOrigin)}${templates ? `, localeTemplates: { ${templates} }` : ''} }), // migration only: remove at go-live${needs404 ? '\n\t\tlocale404(),' : ''}
	],
});
`;
}

/** What an adapted astro.config.mjs must still contain (it is the project's file after adapting). */
function configProblems(text) {
  const [format, trailingSlash] = STYLES[cfg.urlStyle];
  const required = [
    ["routeMiddleware: './src/migration/starlight/route-data.ts'", 'route middleware'],
    ["LanguageSelect: './src/migration/starlight/LanguageSelect.astro'", 'LanguageSelect override'],
    ["MarkdownContent: './src/migration/starlight/MarkdownContent.astro'", 'MarkdownContent override'],
    ["PageTitle: './src/migration/starlight/PageTitle.astro'", 'PageTitle override'],
    ['disable404Route: true', "disable404Route (the kit's 404 pages)"],
    ['withoutRemovedPages(sitemapOptions())', 'sitemap filter'],
    ['starlightMigration()', 'starlight-migration integration'],
    [`format: '${format}'`, `build.format '${format}' (urlStyle ${cfg.urlStyle})`],
    [`trailingSlash: '${trailingSlash}'`, `trailingSlash '${trailingSlash}'`],
  ];
  const problems = required.filter(([needle]) => !text.includes(needle)).map(([, what]) => `missing ${what}`);
  for (const l of cfg.locales) if (!text.includes(`lang: ${q(bcp47(l))}`)) problems.push(`locale ${l} not in Starlight's locales`);
  return problems;
}

{
  const file = 'astro.config.mjs';
  const wanted = astroConfig();
  const current = (await exists(at(file))) ? lf(await read(at(file))) : undefined;
  if (current === wanted) report.ok.push(file);
  else if (current === undefined || current === TEMPLATE_ASTRO_CONFIG || current.trim() === MINIMAL_ASTRO_CONFIG.trim()) {
    if (CHECK) drift(`${file}: not adapted yet`);
    else {
      if (!DRY) await writeFile(at(file), wanted);
      did(`~ ${file} (written from site.config.ts)`);
    }
  } else if (current.includes('src/migration/starlight/route-data.ts')) {
    const problems = configProblems(current);
    if (problems.length) drift(`${file}: ${problems.join('; ')}`);
    else report.ok.push(`${file} (edited since, recipe parts present)`);
  } else {
    fail(`${file} is neither the Starlight template nor adapted. Merge this by hand, then run again:\n\n${wanted}`);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Files the recipe owns whole: src/content.config.ts (docs collection with the migration fields)
//    and src/migration/theme/index.ts (the kit's integration points). Written when they are one of
//    the known starting texts; left alone once adapted (they are the project's files then).

const OWNED = {
  'src/content.config.ts': { starts: [TEMPLATE_CONTENT_CONFIG, lf(await read(path.join(KIT, 'src/content.config.ts')))], marker: 'generateId: docsId', what: 'docs collection with the migration fields' },
  'src/migration/theme/index.ts': { starts: [lf(await read(path.join(KIT, 'src/migration/theme/index.ts')))], marker: "from './StarlightShell.astro'", what: 'Shell = StarlightShell' },
};
for (const [file, { starts, marker, what }] of Object.entries(OWNED)) {
  const wanted = lf(await read(path.join(OVERLAY, file)));
  const current = (await exists(at(file))) ? lf(await read(at(file))) : undefined;
  if (current === wanted) report.ok.push(file);
  else if (current === undefined || starts.includes(current)) {
    if (CHECK) drift(`${file}: not adapted yet`);
    else {
      if (!DRY) await writeFile(at(file), wanted);
      did(`~ ${file} (${what})`);
    }
  } else if (current.includes(marker)) report.ok.push(`${file} (edited since, recipe part present)`);
  else fail(`${file} differs from the template and the kit. Merge the recipe's version by hand (${what}), then run again:\n\n${wanted}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Kit files the recipe replaces, template demo files, empty kit content folders

for (const rel of KIT_REPLACED) {
  if (!(await exists(at(rel)))) {
    report.ok.push(`${rel} (removed)`);
    continue;
  }
  if (lf(await read(at(rel))) !== lf(await read(path.join(KIT, rel)))) {
    if (CHECK) drift(`${rel}: still there and changed from the kit's version`);
    else fail(`${rel} was changed after installing the kit. The Starlight recipe replaces it (Starlight routes the docs pages); move your changes elsewhere and delete it, then run again.`);
    continue;
  }
  if (CHECK) drift(`${rel}: kit file the recipe replaces is still there`);
  else {
    if (!DRY) {
      await rm(at(rel));
      await removeEmptyDirs(path.dirname(at(rel)));
    }
    did(`- ${rel} (replaced by Starlight's routing)`);
  }
}

for (const [rel, hash] of Object.entries(TEMPLATE_DEMO)) {
  if (!(await exists(at(rel)))) continue;
  if ((await sha(at(rel))) !== hash) {
    // An edited demo page still links Starlight's docs; anything else is the project's own content.
    if (rel.endsWith('.md') || rel.endsWith('.mdx')) {
      if ((await read(at(rel))).includes('starlight.astro.build')) report.notes.push(`${rel} looks like an edited template demo page: kept, delete it if it is not content.`);
    }
    continue;
  }
  if (CHECK) drift(`${rel}: template demo file still there`);
  else {
    if (!DRY) {
      await rm(at(rel));
      await removeEmptyDirs(path.dirname(at(rel)));
    }
    did(`- ${rel} (template demo)`);
  }
}

for (const rel of ['src/content/pages', 'src/content/news']) {
  const d = at(rel);
  if (!(await exists(d)) || (await readdir(d)).length) {
    if (await exists(d)) report.notes.push(`${rel}/ has files: Starlight reads src/content/docs only; move them (references/themes/starlight.md).`);
    continue;
  }
  if (CHECK) drift(`${rel}/: empty kit folder (content goes to src/content/docs)`);
  else {
    if (!DRY) await rmdir(d);
    did(`- ${rel}/ (empty; content goes to src/content/docs)`);
  }
}

async function removeEmptyDirs(dir) {
  for (let d = dir; d.startsWith(into) && d !== into && d !== at('src'); d = path.dirname(d)) {
    if (!(await rmdir(d).then(() => true, () => false))) break;
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Recipe files (copied without overwriting)

const overlayFiles = [];
const walk = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) await walk(f);
    else overlayFiles.push(path.relative(OVERLAY, f).split(path.sep).join('/'));
  }
};
await walk(OVERLAY);
for (const rel of overlayFiles.sort()) {
  if (OWNED[rel]) continue; // step 2
  const source = await read(path.join(OVERLAY, rel));
  if (!(await exists(at(rel)))) {
    if (CHECK) drift(`${rel}: missing`);
    else {
      if (!DRY) {
        await mkdir(path.dirname(at(rel)), { recursive: true });
        await writeFile(at(rel), source);
      }
      did(`+ ${rel}`);
    }
  } else if (lf(await read(at(rel))) === lf(source)) report.ok.push(rel);
  else if (CHECK) drift(`${rel}: differs from the recipe's version (fine if changed on purpose)`);
  else report.notes.push(`${rel} exists and differs from the recipe's version: kept (compare with ${path.join(OVERLAY, rel)}).`);
}

// ---------------------------------------------------------------------------------------------
// 5. Report and manual steps

const steps = [];
const installs = Object.entries(PINNED)
  .filter(([name, version]) => deps[name] !== version)
  .map(([name, version]) => `${name}@${version}`);
if (installs.length) steps.push(`Pin the tested versions: npm i --save-exact ${installs.join(' ')}`);
if (!(await exists(at('src/content/docs'))) || !(await readdir(at('src/content/docs'), { recursive: true })).some((f) => /\.mdx?$/.test(f))) {
  steps.push('Content into src/content/docs, mirroring the old URL paths: content-to-md.mjs … --out src/content/docs --full-paths');
}
steps.push(
  'Home page: src/content/docs/index.md (and <prefix>/index.md per language): `template: splash` + `hero` for a landing page, MDX components for sections.',
  'Sidebar order: `sidebar: { order: n }` per page, or an explicit `sidebar` in astro.config.mjs (references/themes/starlight.md).',
  'Look: design plan → src/styles/theme.css (tokens), logo file in src/assets/ (starlight `logo`), favicon in public/.',
  'Do not merge the astro.config.mjs lines install-kit.mjs printed: astro.config.mjs is written here.',
  'npm run build && npx astro check, then npx astro preview (placeholders exist only in the build).',
);

const print = (title, lines) => lines.length && console.log(`${title}\n${lines.map((l) => `  ${l}`).join('\n')}`);
console.log(`Starlight recipe in ${into} (${cfg.locales.join(', ')}; ${cfg.urlStyle}${cfg.prefixDefaultLocale ? ', default language prefixed' : ''})\n`);
if (CHECK) {
  print('Drift:', report.drift);
  if (report.notes.length) print('\nNotes:', report.notes);
  console.log(report.drift.length ? `\n${report.drift.length} difference(s) from the recipe.` : `All ${report.ok.length} recipe parts in place.`);
  process.exit(report.drift.length ? 1 : 0);
}
print(DRY ? 'Would change:' : 'Changed:', report.changed);
if (!report.changed.length) console.log(`Nothing to change: ${report.ok.length} recipe parts in place.`);
if (report.notes.length) print('\nNotes:', report.notes);
console.log('');
print('Next steps:', steps.map((s, i) => `${i + 1}. ${s}`));
