#!/usr/bin/env node
// Install the default UI libraries and the skill's ready-made components into an Astro project:
// icons (astro-icon + Iconify sets), navigation (React + shadcn/ui on Base UI + SiteNav), lightbox
// (PhotoSwipe), carousel (Embla), scroll effects (motion). Copies without overwriting. Node >= 22.
// Defaults and their pitfalls: references/libraries.md.
//
//   node install-ui.mjs                       everything
//   node install-ui.mjs --only lightbox,motion

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `Usage: node install-ui.mjs [options]   (run from the project folder, after the scaffold and the kit)

  --only <list>     Features to install (default: all): icons, nav, lightbox, carousel, motion
                    (carousel needs icons and adds them)
  --preset <name>   shadcn style preset for nav (default: nova); the site's tokens replace its colours later
  --force           Overwrite components that already exist in src/components/site/
  --dry-run         Only report what would happen
  --help            Show this help

What each feature does:
  icons     npx astro add astro-icon; @iconify-json/lucide + simple-icons; icon({ iconDir: 'src/assets/icons' })
  nav       npx astro add react; @/* path alias; shadcn init --base base (Base UI); shadcn add
            navigation-menu sheet button; drops shadcn's Geist font; copies SiteNav.tsx
  lightbox  photoswipe; copies Lightbox.astro and image-size.ts
  carousel  embla-carousel + autoplay plugin; copies Carousel.astro
  motion    motion; copies Motion.astro

Components land in src/components/site/ (shadcn's own in src/components/ui/). Usage and pitfalls:
references/libraries.md in the skill.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

const ALL = ['icons', 'nav', 'lightbox', 'carousel', 'motion'];
const only = opt('only', ALL.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const unknown = only.filter((f) => !ALL.includes(f));
if (unknown.length) fail(`Unknown feature(s): ${unknown.join(', ')}. Choose from ${ALL.join(', ')}.`);
const features = new Set(only);
if (features.has('carousel')) features.add('icons');
const preset = opt('preset', 'nova');
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

// Tested majors (references/libraries.md, "Tested with").
const PKG = {
  icons: ['@iconify-json/lucide@^1', '@iconify-json/simple-icons@^1'],
  lightbox: ['photoswipe@^5'],
  carousel: ['embla-carousel@^8', 'embla-carousel-autoplay@^8'],
  motion: ['motion@^14'],
};
const SHADCN = 'shadcn@4';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.resolve(HERE, '../assets/ui');
const root = process.cwd();
const exists = (p) => stat(path.join(root, p)).then(() => true, () => false);

const pkgJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8').catch(() => fail('No package.json here: run from the project folder.')));
const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
if (!deps.astro) fail('This is not an Astro project (no astro dependency).');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) fail(`Node ${process.versions.node} is too old; use the version in .nvmrc.`);

const log = (line) => console.log(line);
function run(label, cmd, cmdArgs) {
  log(`${dryRun ? 'Would run' : '·'} ${label}`);
  if (dryRun) return '';
  const res = spawnSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error(`${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n'));
    fail(`Step failed: ${cmd} ${cmdArgs.join(' ')}`);
  }
  return res.stdout;
}
async function edit(file, label, change) {
  const p = path.join(root, file);
  const before = await readFile(p, 'utf8').catch(() => null);
  if (before === null) return log(`! ${file} not found; ${label} skipped`);
  const after = change(before);
  if (after === before) return;
  log(`${dryRun ? 'Would edit' : '·'} ${file}: ${label}`);
  if (!dryRun) await writeFile(p, after);
}
const copied = [];
const skipped = [];
async function copy(name) {
  const to = path.join('src/components/site', name);
  if (!force && (await exists(to))) return skipped.push(to);
  copied.push(to);
  if (dryRun) return;
  await mkdir(path.join(root, 'src/components/site'), { recursive: true });
  await cp(path.join(UI, name), path.join(root, to));
}
const npmInstall = (list) => run(`npm install ${list.join(' ')}`, 'npm', ['install', ...list]);

// `astro add` reformats astro.config.mjs and detaches comments (the kit's "remove at go-live" note
// ends up on the wrong line), so integrations are added here with a minimal text edit instead.
const CONFIG = (await exists('astro.config.ts')) ? 'astro.config.ts' : 'astro.config.mjs';
async function addIntegration(importLine, call, marker) {
  await edit(CONFIG, `add ${call}`, (s) => {
    if (s.includes(marker)) return s;
    const imports = [...s.matchAll(/^import .*;$/gm)];
    const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : 0;
    s = `${s.slice(0, at)}\n${importLine}${s.slice(at)}`;
    if (/integrations:\s*\[/.test(s)) return s.replace(/integrations:\s*\[/, (m) => `${m}\n    ${call},`);
    if (/defineConfig\(\{/.test(s)) return s.replace(/defineConfig\(\{/, (m) => `${m}\n  integrations: [${call}],`);
    fail(`Could not find defineConfig({ … }) in ${CONFIG}: add ${call} to integrations by hand, then rerun.`);
  });
}
async function editTsconfig(label, change) {
  await edit('tsconfig.json', label, (s) => {
    let json;
    try {
      json = JSON.parse(s);
    } catch {
      fail(`tsconfig.json has comments or is not plain JSON: ${label} by hand (references/libraries.md §Setup), then rerun.`);
    }
    const co = (json.compilerOptions ??= {});
    return change(co) ? `${JSON.stringify(json, null, 2)}\n` : s;
  });
}

// ---------------------------------------------------------------------------------------------
if (features.has('icons')) {
  npmInstall(['astro-icon@^1', ...PKG.icons]);
  await addIntegration("import icon from 'astro-icon';", "icon({ iconDir: 'src/assets/icons' })", "from 'astro-icon'");
  if (!dryRun) await mkdir(path.join(root, 'src/assets/icons'), { recursive: true });
}

if (features.has('nav')) {
  if (!deps['@astrojs/react']) npmInstall(['@astrojs/react', 'react', 'react-dom', '@types/react', '@types/react-dom']);
  await addIntegration("import react from '@astrojs/react';", 'react()', "from '@astrojs/react'");
  await editTsconfig('JSX settings for React and the path alias @/* for shadcn', (co) => {
    if (co.jsx && co.paths?.['@/*']) return false;
    co.jsx ??= 'react-jsx';
    co.jsxImportSource ??= 'react';
    co.baseUrl ??= '.';
    co.paths = { ...co.paths, '@/*': ['./src/*'] };
    return true;
  });
  if (!(await exists('components.json'))) {
    run(`shadcn init (Base UI, preset ${preset})`, 'npx', ['-y', SHADCN, 'init', '--base', 'base', '--preset', preset, '-y']);
  }
  // shadcn's preset brings a Geist web font; fonts come from the Fonts API (references/libraries.md §Fonts).
  await edit('src/styles/global.css', "remove the preset's Geist font import", (s) =>
    s
      .replace(/@import\s+["']@fontsource(-variable)?\/geist[^"']*["'];\n?/g, '')
      .replace(/--font-sans:\s*['"]Geist[^;]*;/, '--font-sans: ui-sans-serif, system-ui, sans-serif;'),
  );
  const pj = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (pj.dependencies?.['@fontsource-variable/geist']) run('npm uninstall @fontsource-variable/geist', 'npm', ['uninstall', '@fontsource-variable/geist']);
  // Only components that aren't there yet: shadcn components belong to the site once added.
  const missing = [];
  for (const c of ['navigation-menu', 'sheet', 'button']) if (!(await exists(`src/components/ui/${c}.tsx`))) missing.push(c);
  if (missing.length) run(`shadcn add ${missing.join(' ')}`, 'npx', ['-y', SHADCN, 'add', ...missing, '-y']);
  await copy('SiteNav.tsx');
}

if (features.has('lightbox')) {
  npmInstall(PKG.lightbox);
  await copy('Lightbox.astro');
  await copy('image-size.ts');
}
if (features.has('carousel')) {
  npmInstall(PKG.carousel);
  await copy('Carousel.astro');
}
if (features.has('motion')) {
  npmInstall(PKG.motion);
  await copy('Motion.astro');
}

log(`\n${dryRun ? 'Would copy' : 'Copied'} ${copied.length} component(s)${copied.length ? `:\n${copied.map((c) => `  ${c}`).join('\n')}` : ''}`);
if (skipped.length) log(`Skipped (already there; --force overwrites):\n${skipped.map((s) => `  ${s}`).join('\n')}`);

const next = [];
if (features.has('nav'))
  next.push(
    "Header: <SiteNav client:load items={navigation.main} current={Astro.url.pathname} labels={…} /> (import SiteNav from '@/components/site/SiteNav')",
    'Tokens: put the site\'s colours, radius and fonts into the shadcn variables in src/styles/global.css (libraries.md §Tokens)',
  );
if (features.has('motion')) next.push('Base layout: <Motion /> once before </body>; mark elements with data-reveal, data-reveal-stagger, data-parallax');
if (features.has('lightbox')) next.push('Galleries and Markdown bodies: wrap in <Lightbox>…</Lightbox>; kit gallery block: libraries.md §Lightbox');
if (features.has('carousel')) next.push('<Carousel label="…" perView={{ base: 1, md: 3 }}>…slides…</Carousel>');
if (features.has('icons')) next.push('Icons: <Icon name="lucide:mail" /> (astro-icon/components); own SVGs in src/assets/icons/ as <Icon name="<file>" />');
next.push('Fonts: fonts: [...] in astro.config.mjs + <Font cssVariable=… /> (libraries.md §Fonts)', 'Then: npm run build');
log(`\nNext:\n${next.map((n) => `- ${n}`).join('\n')}`);
