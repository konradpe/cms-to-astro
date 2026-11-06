#!/usr/bin/env node
// Adapt the ScrewFast theme to the migration kit: run from a project folder that holds ScrewFast
// scaffolded at the pinned commit, with the kit installed (scripts/install-kit.mjs). Removes what a
// migration doesn't need, wires the theme into the kit's integration points, writes astro.config.mjs.
// Recipe: references/themes/screwfast.md. No dependencies; Node >= 22.
//
//   node adapt.mjs            adapt (idempotent: a second run changes nothing)
//   node adapt.mjs --check    compare every file it touches with the pinned commit

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THEME = 'ScrewFast';
const REPO = 'mearashadowfax/ScrewFast';
const COMMIT = '42a435599bee7a326020a9dc03f548392fac1307';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = path.join(HERE, 'overlay');
const KIT = path.resolve(HERE, '../../kit');
const STATE = '.migration/theme-adapter.json';

const HELP = `Usage: node adapt.mjs [--check] [--dry-run] [--force] [--into <dir>]

Adapts ${THEME} (github.com/${REPO} at ${COMMIT.slice(0, 7)}) to the migration kit. Run it in the
project folder after scaffolding the theme at that commit and installing the kit:

  npx -y giget@3 gh:${REPO}#${COMMIT} my-site
  cd my-site && node <skill-dir>/scripts/install-kit.mjs --old-origin https://www.example.com --locales de,en --url-style preserve
  node <skill-dir>/assets/themes/screwfast/adapt.mjs && npm install && npm run build

  --check      Compare every file the adapter touches with the pinned commit (or its adapted form)
               and list the differences. Exit code 1 on drift. Changes nothing.
  --dry-run    Show what would change.
  --force      Adapt even though files differ from the pinned commit (patches still need their anchors).
  --into <dir> Project folder (default: .)
  --record <dir>  Maintainers: print the upstream hashes of a clean checkout (for a new pinned commit).`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`\n${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------------------------
// What the adapter does, in order. Paths are relative to the project; a path ending in / is a folder.

/** Upstream files and folders that go. */
const REMOVE = [
  // Repository files about the theme itself, other hosts and pnpm (dependencies change; npm install writes a lockfile)
  'AI_GUIDE.md', 'CODE_OF_CONDUCT.md', 'CONTEXT.md', 'README.md', 'vercel.json', 'pnpm-lock.yaml', '.github/', 'scripts/',
  // HTML minifier after the build: it collapses line breaks inside text (white-space: pre-line in
  // addresses, opening hours, the kit's map and contact blocks); Astro's compressHTML already
  // removes the whitespace between tags
  'process-html.mjs',
  // Starlight docs
  'src/content/docs/', 'src/components/ui/starlight/', 'src/images/starlight/',
  'src/assets/styles/starlight.css', 'src/assets/styles/starlight_main.css',
  // Smooth scrolling (Lenis), demo form script
  'src/assets/scripts/', 'src/assets/styles/lenis.css',
  // Demo pages, views and content in en + fr (the kit's catch-all serves every old URL, incl. / and /en/)
  'src/pages/index.astro', 'src/pages/services.astro', 'src/pages/contact.astro',
  'src/pages/blog/', 'src/pages/products/', 'src/pages/insights/', 'src/pages/fr/', 'src/views/',
  'src/content/blog/', 'src/content/insights/', 'src/content/products/',
  'src/data_files/faqs.json', 'src/data_files/features.json', 'src/data_files/pricing.json', 'src/data_files/fr/',
  'src/data_files/mega_link.ts', 'src/data_files/constants.ts',
  'src/images/blog/', 'src/images/insights/', 'src/images/social.png',
  ...[
    'aerial-view', 'automated-tools', 'before-after', 'blueprint-1', 'blueprint-2', 'blueprints-image',
    'construction-image', 'construction-workers', 'dashboard-image', 'features-image', 'hero-image',
    'person-working', 'product-image-1', 'product-image-2', 'product-image-3', 'product-image-4',
    'product-image-main-1', 'product-image-main-2', 'product-image-main-3', 'product-image-main-4',
    'progress-building', 'under-construction', 'using-tools',
  ].map((n) => `src/images/${n}.avif`),
  'public/banner-pattern.svg',
  // The theme's locale, copy-table and metadata machinery (the kit owns languages, routes and head tags)
  'src/middleware.ts', 'src/copy/', 'src/utils/', 'src/components/Meta.astro',
  // Dark mode toggle, sign-in, forms, blog/product widgets, mega menu, language picker
  'src/components/ThemeIcon.astro', 'src/components/sections/insights/', 'src/components/sections/products/',
  'src/components/sections/misc/Authentication.astro', 'src/components/sections/misc/ContactSection.astro',
  'src/components/sections/landing/HeroSectionAlt.astro', 'src/components/sections/features/FeaturesStatsAlt.astro',
  'src/components/sections/navbar&footer/NavbarMegaMenu.astro', 'src/components/ui/LanguagePicker.astro',
  'src/components/ui/banners/', 'src/components/ui/cards/', 'src/components/ui/feedback/', 'src/components/ui/forms/',
  'src/components/ui/links/MegaMenuLink.astro', 'src/components/ui/links/NavLink.astro',
  'src/components/ui/avatars/AvatarBlog.astro', 'src/components/ui/avatars/AvatarBlogLarge.astro',
  ...['AuthBtn', 'Bookmark', 'GithubBtn', 'GoogleBtn', 'LoginBtn', 'NavbarToggle', 'ProductTabBtn', 'SocialShare'].map(
    (n) => `src/components/ui/buttons/${n}.astro`,
  ),
];

/** Overlay files for paths that don't exist upstream (added; a changed copy in the project is kept). */
const ADD = [
  'src/assets/logo.svg',
  ...['menu', 'close', 'chevron-down', 'arrow-right', 'map-pin', 'mail', 'phone', 'clock', 'facebook', 'instagram', 'linkedin', 'x', 'youtube'].map(
    (n) => `src/assets/icons/${n}.svg`,
  ),
  'src/types/preline.d.ts',
  'src/migration/theme/ProseTemplate.astro',
  'src/migration/theme/kit.css',
  ...['Hero', 'Text', 'ImageText', 'Cards', 'Contact'].map((n) => `src/migration/theme/blocks/${n}.astro`),
];

/** Whole files replaced: from the overlay, from the kit, or generated from src/migration/site.config.ts. */
const REPLACE = {
  'src/components/BrandLogo.astro': { from: 'overlay' },
  'src/components/sections/navbar&footer/Navbar.astro': { from: 'overlay' },
  'src/components/sections/navbar&footer/FooterSection.astro': { from: 'overlay' },
  'src/content.config.ts': { from: 'kit' },
  'src/pages/404.astro': { from: 'kit' },
  'astro.config.mjs': { generate: astroConfig },
  'src/data_files/navigation.ts': { generate: navigationFile },
  // A kit file, not an upstream one: the integration points
  'src/migration/theme/index.ts': { from: 'overlay', original: 'kit' },
};

/** Anchored patches: [anchor, replacement] or { from, to, replace } (range from..to inclusive). */
const PATCH = {
  'src/layouts/MainLayout.astro': [
    {
      from: "import Meta from '@components/Meta.astro';\n",
      to: '  kind,\n});\n',
      replace: `import Meta from '../migration/Meta.astro';
import Navbar from '@components/sections/navbar&footer/Navbar.astro';
import FooterSection from '@components/sections/navbar&footer/FooterSection.astro';
import { getImage } from 'astro:assets';
import faviconSvgSrc from '@images/icon.svg';
import faviconSrc from '@images/icon.png';
import type { PageMeta } from '../migration/meta';
import { t } from '../migration/strings';
import '@styles/global.css';
import '../migration/theme/kit.css';

/**
 * Site layout, plugged into the migration kit as its Shell (src/migration/theme/index.ts).
 * The kit builds the page meta (title, description, canonical, hreflang, robots, Open Graph)
 * and <Meta> renders it; this layout adds the site-wide head tags (favicons, manifest), then
 * Navbar, the page in <main> and FooterSection, both fed from src/data_files/navigation.ts.
 * Extra head tags for one page: <Fragment slot="head">…</Fragment>.
 */
interface Props {
  meta: PageMeta;
  hideFooter?: boolean;
}

const { meta, hideFooter = false } = Astro.props;
const faviconSvg = await getImage({ src: faviconSvgSrc, format: 'svg' });
const appleTouchIcon = await getImage({
  src: faviconSrc,
  width: 180,
  height: 180,
  format: 'png',
});
`,
    },
    ['<html\n  lang={metadata.lang}\n  class="scrollbar-hide lenis lenis-smooth scroll-pt-16"\n>', '<html lang={meta.lang} class="scrollbar-hide scroll-pt-16">'],
    {
      from: '    <Meta metadata={metadata} />\n',
      to: "      import '@scripts/lenisSmoothScroll.js';\n    </script>\n",
      replace: `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <Meta meta={meta} />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href={faviconSvg.src} type="image/svg+xml" />
    <link rel="apple-touch-icon" href={appleTouchIcon.src} />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#facc15" />
    <slot name="head" />
`,
    },
    ['{t.layout.skipToContent}', '{t(meta.locale).skipToContent}'],
    ['<Navbar />', '<Navbar meta={meta} />'],
    ['<main id="main-content">', '<main id="main-content" data-pagefind-body>'],
    ['{!hideFooter && <FooterSection />}', '{!hideFooter && <FooterSection meta={meta} />}'],
    {
      from: '      // https://preline.co\n',
      to: '      else init();\n',
      replace: `      // Preline (https://preline.co): only the plugins the header uses (menu collapse, submenus),
      // not the whole library (~380 KB). A component that needs another plugin imports it the same
      // way (FAQ: accordion, FeaturesNavs: tabs). Use the -non-auto modules and call autoInit():
      // Preline marks its plugin modules side-effect free, so a bare import 'preline/plugins/x' is dropped.
      import HSCollapse from 'preline/plugins/collapse-non-auto';
      import HSDropdown from 'preline/plugins/dropdown-non-auto';
      HSCollapse.autoInit();
      HSDropdown.autoInit();
`,
    },
  ],
  'src/env.d.ts': [
    {
      from: '\ndeclare namespace App {\n',
      to: "    copy: import('@/copy').Copy;\n  }\n}\n",
      replace: '',
    },
  ],
  // These two relied on the full Preline bundle in the layout; now they load their own plugin.
  'src/components/sections/misc/FAQ.astro': [
    [
      '</section>\n',
      "</section>\n\n<script>\n  import HSAccordion from 'preline/plugins/accordion-non-auto';\n  HSAccordion.autoInit();\n</script>\n",
    ],
  ],
  'src/components/sections/features/FeaturesNavs.astro': [
    ['</section>\n', "</section>\n\n<script>\n  import HSTabs from 'preline/plugins/tabs-non-auto';\n  HSTabs.autoInit();\n</script>\n"],
  ],
  'src/pages/manifest.json.ts': [
    ["import maskableIcon from '@images/icon-maskable.png';\n", "import maskableIcon from '@images/icon-maskable.png';\nimport { site } from '../migration/site.config';\n"],
    ["    short_name: 'ScrewFast',\n    name: 'ScrewFast',\n", '    short_name: site.name,\n    name: site.name,\n'],
  ],
};

/** package.json: dependencies of removed features (docs, MDX, animations, share button, Starlight transitions, minifier). */
const PACKAGE = {
  dependencies: ['@astrojs/mdx', '@astrojs/starlight', 'clipboard', 'gsap', 'lenis', 'html-minifier-terser'],
  devDependencies: ['astro-vtbot'],
  scripts: ['test:smoke'],
};
/** package.json scripts changed in place: [name, upstream value, new value]. */
const SCRIPTS = [['build', 'astro check && astro build && node process-html.mjs', 'astro check && astro build']];

/**
 * Hashes of the upstream files at COMMIT (sha256 of the file with LF line endings, first 16 hex
 * digits). A folder's hash covers its file list and contents. Regenerate with --record <clean checkout>.
 */
const UPSTREAM = {
  "AI_GUIDE.md": "4ed26de3359e42f0",
  "CODE_OF_CONDUCT.md": "9162271508d2d04a",
  "CONTEXT.md": "c0f208e83e3da11a",
  "README.md": "0b9df8e4b5bebdfb",
  "vercel.json": "0208b94b5d9b2ac2",
  "pnpm-lock.yaml": "1dccfe73d045d91f",
  ".github/": "d17590f5d4e6ac5b:4",
  "scripts/": "c1dc0caeae246ae0:1",
  "process-html.mjs": "b3d1f5990dcfd7f1",
  "src/content/docs/": "864f432726e1027c:35",
  "src/components/ui/starlight/": "92d4dc3b6d91b102:5",
  "src/images/starlight/": "de46fe946cffeff8:5",
  "src/assets/styles/starlight.css": "469cc1bb886cea1d",
  "src/assets/styles/starlight_main.css": "d28e25a36984f401",
  "src/assets/scripts/": "449a215e5ba32036:2",
  "src/assets/styles/lenis.css": "4f999cbe58e8e035",
  "src/pages/index.astro": "b92b4ebe4f36cbef",
  "src/pages/services.astro": "40dc4832d6e42572",
  "src/pages/contact.astro": "794c5cb313ce2a49",
  "src/pages/blog/": "f511c8ea0467dc85:2",
  "src/pages/products/": "960228cc049df7fc:2",
  "src/pages/insights/": "a2035537728f4707:1",
  "src/pages/fr/": "6086c15e91482e9f:9",
  "src/views/": "ab58e9b29233cb8e:9",
  "src/content/blog/": "331ced13659a8138:6",
  "src/content/insights/": "eec2eddb1faafcc3:6",
  "src/content/products/": "560ee49e8c3fb4ca:8",
  "src/data_files/faqs.json": "d73f053400cbc34b",
  "src/data_files/features.json": "7860e95846e2a7e2",
  "src/data_files/pricing.json": "2e08cdf775251377",
  "src/data_files/fr/": "daa9b303044425a8:3",
  "src/data_files/mega_link.ts": "5ef08247277d7fb1",
  "src/data_files/constants.ts": "66cd53bc05cd7613",
  "src/images/blog/": "48578a1724fcfc96:6",
  "src/images/insights/": "22056737ffbf6231:3",
  "src/images/social.png": "ca106c4c0db8fac8",
  "src/images/aerial-view.avif": "820c78388cea726f",
  "src/images/automated-tools.avif": "63aeb42aa4b6f347",
  "src/images/before-after.avif": "bcc0680b2eaeb700",
  "src/images/blueprint-1.avif": "b2ab102f7edeb0a4",
  "src/images/blueprint-2.avif": "0a3134fc51a797d1",
  "src/images/blueprints-image.avif": "0e4379001c324f7b",
  "src/images/construction-image.avif": "9175dda5d757f03d",
  "src/images/construction-workers.avif": "23e2dfc7a1b77e5c",
  "src/images/dashboard-image.avif": "2ec1fde7a8b0ba07",
  "src/images/features-image.avif": "5fd2b824d7b64a11",
  "src/images/hero-image.avif": "f752312bebe19411",
  "src/images/person-working.avif": "325b92123013c093",
  "src/images/product-image-1.avif": "71a6173e37c7e87d",
  "src/images/product-image-2.avif": "54b7a127032956b9",
  "src/images/product-image-3.avif": "3974f43fd7195d72",
  "src/images/product-image-4.avif": "ed2ac88c25e6d2ec",
  "src/images/product-image-main-1.avif": "61f55035656299c8",
  "src/images/product-image-main-2.avif": "6edd1c3fda7ad51e",
  "src/images/product-image-main-3.avif": "94bc6f6ef4fad535",
  "src/images/product-image-main-4.avif": "1895d877e25c1bf4",
  "src/images/progress-building.avif": "db407507fddef980",
  "src/images/under-construction.avif": "ebe16d86a2d40e48",
  "src/images/using-tools.avif": "e3860058ac72d40b",
  "public/banner-pattern.svg": "9c35d820a591a614",
  "src/middleware.ts": "2dc2f9dcc517108f",
  "src/copy/": "5f74c1c67851445a:3",
  "src/utils/": "14ae060829361bd9:4",
  "src/components/Meta.astro": "518cdc347b864aea",
  "src/components/ThemeIcon.astro": "13abbef554a6359c",
  "src/components/sections/insights/": "6c9fd4b6922c64ca:1",
  "src/components/sections/products/": "050a6afef7a4d5b2:1",
  "src/components/sections/misc/Authentication.astro": "a07fbcf049d1606f",
  "src/components/sections/misc/ContactSection.astro": "563c5a0610500035",
  "src/components/sections/landing/HeroSectionAlt.astro": "a334315db1746124",
  "src/components/sections/features/FeaturesStatsAlt.astro": "022fd85e90ce835a",
  "src/components/sections/navbar&footer/NavbarMegaMenu.astro": "4a2fbcdae5f4deab",
  "src/components/ui/LanguagePicker.astro": "df6758ead49ac713",
  "src/components/ui/banners/": "277bc99fc1203b0d:1",
  "src/components/ui/cards/": "5acc6f60b0cdd6d9:5",
  "src/components/ui/feedback/": "fac17e5c4979ee84:1",
  "src/components/ui/forms/": "fc27813a55f69ce6:12",
  "src/components/ui/links/MegaMenuLink.astro": "f659c599ffb2b2cf",
  "src/components/ui/links/NavLink.astro": "1d879ce96e2fca66",
  "src/components/ui/avatars/AvatarBlog.astro": "16b12a5795ce5196",
  "src/components/ui/avatars/AvatarBlogLarge.astro": "26d06b253095954b",
  "src/components/ui/buttons/AuthBtn.astro": "bab452423fd3b735",
  "src/components/ui/buttons/Bookmark.astro": "9d4b522a33f19b69",
  "src/components/ui/buttons/GithubBtn.astro": "3365e45e2b9cf310",
  "src/components/ui/buttons/GoogleBtn.astro": "f8c86cc8e1bad94a",
  "src/components/ui/buttons/LoginBtn.astro": "b53d0adf21c6ca81",
  "src/components/ui/buttons/NavbarToggle.astro": "4d0ffd3f4a96fadf",
  "src/components/ui/buttons/ProductTabBtn.astro": "a3c2e851399f4c0f",
  "src/components/ui/buttons/SocialShare.astro": "7d310002acf80f2f",
  "src/components/BrandLogo.astro": "3f6ac650f66067fa",
  "src/components/sections/navbar&footer/Navbar.astro": "3696792ef9703d8d",
  "src/components/sections/navbar&footer/FooterSection.astro": "5a023aaf273e7734",
  "src/content.config.ts": "b9537481e6767580",
  "src/pages/404.astro": "04e89dd93fa8c241",
  "astro.config.mjs": "5a26e17234975b68",
  "src/data_files/navigation.ts": "971f3efd594367b4",
  "src/layouts/MainLayout.astro": "cd8c75512de523c3",
  "src/env.d.ts": "14779f96465b0af7",
  "src/components/sections/misc/FAQ.astro": "879c4c63a8139a4a",
  "src/components/sections/features/FeaturesNavs.astro": "950a6698b9d039e3",
  "src/pages/manifest.json.ts": "0af2e86e721d271e",
  "package.json": "d938be54f6cd3cd1"
};

// ---------------------------------------------------------------------------------------------

const root = path.resolve(opt('into') ?? '.');
const abs = (p) => path.join(root, p);
const exists = async (f) => !!(await stat(f).catch(() => null));
const read = (f) => readFile(f, 'utf8').catch(() => null);
/** sha256 (first 16 hex digits) of a file's bytes with CRLF read as LF (a Windows checkout hashes the same). */
const hashOf = (data) => {
  const bytes = (Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')).toString('latin1').replace(/\r\n/g, '\n');
  return createHash('sha256').update(bytes, 'latin1').digest('hex').slice(0, 16);
};

async function filesUnder(dir) {
  const out = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else out.push(path.relative(dir, f).split(path.sep).join('/'));
    }
  };
  await walk(dir);
  return out.sort();
}

/** Hash of a file, or of a folder (its relative file names and their hashes); null if missing. */
async function hashPath(base, p) {
  const f = path.join(base, p);
  if (p.endsWith('/')) {
    if (!(await exists(f))) return null;
    const files = await filesUnder(f);
    const lines = [];
    for (const rel of files) lines.push(`${rel}\0${hashOf(await readFile(path.join(f, rel)))}`);
    return `${hashOf(lines.join('\n'))}:${files.length}`;
  }
  const buf = await readFile(f).catch(() => null);
  return buf === null ? null : hashOf(buf);
}

const upstreamPaths = () => [...REMOVE, ...Object.keys(REPLACE).filter((p) => !REPLACE[p].original), ...Object.keys(PATCH), 'package.json'];

// --record: print the UPSTREAM table for a clean checkout
if (args.includes('--record')) {
  const dir = path.resolve(opt('record') ?? '.');
  const table = {};
  for (const p of upstreamPaths()) {
    const h = await hashPath(dir, p);
    if (h === null) fail(`--record: ${p} is missing in ${dir}`);
    table[p] = h;
  }
  console.log(`const UPSTREAM = ${JSON.stringify(table, null, 2)};`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Project settings (from the kit's site.config.ts) and generated files

const STYLES = { directory: ['directory', 'always'], preserve: ['preserve', 'ignore'], file: ['file', 'never'] };

async function siteConfig() {
  const src = await read(abs('src/migration/site.config.ts'));
  if (src === null) return null;
  const body = src.slice(src.indexOf('export const site'));
  const str = (key) => body.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1];
  const cfg = {
    oldOrigin: str('oldOrigin'),
    name: str('name'),
    urlStyle: str('urlStyle'),
    prefixDefaultLocale: body.match(/prefixDefaultLocale:\s*(true|false)/)?.[1] === 'true',
    locales: [...(body.match(/locales:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]),
  };
  if (!cfg.oldOrigin || !STYLES[cfg.urlStyle] || !cfg.locales.length)
    fail('src/migration/site.config.ts: could not read oldOrigin, urlStyle and locales. Check the file (install-kit.mjs writes it).');
  return cfg;
}

function astroConfig(cfg) {
  const [format, trailingSlash] = STYLES[cfg.urlStyle];
  const needs404 = cfg.urlStyle === 'directory' && (cfg.locales.length > 1 || cfg.prefixDefaultLocale);
  return `// The migration kit's settings (src/migration/KIT.md) plus the theme's Tailwind. build.format and
// trailingSlash must match urlStyle in src/migration/site.config.ts. No Astro i18n routing: the kit
// routes by the old paths.
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { sitemapOptions } from './src/migration/sitemap.mjs';
import pendingPages from './integrations/pending-pages.mjs';${needs404 ? "\nimport locale404 from './src/migration/locale-404.mjs';" : ''}

export default defineConfig({
  site: '${cfg.oldOrigin}',
  build: { format: '${format}' },
  trailingSlash: '${trailingSlash}',
  integrations: [
    sitemap(sitemapOptions()),
    pendingPages({ oldOrigin: '${cfg.oldOrigin}' }), // migration only: remove at go-live${needs404 ? '\n    locale404(), // directory style with several languages' : ''}
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
`;
}

const UI = {
  de: { home: 'Startseite', mainNav: 'Hauptmenü', toggleMenu: 'Menü öffnen oder schließen', submenu: 'Untermenü', social: 'Soziale Medien' },
  en: { home: 'Home', mainNav: 'Main menu', toggleMenu: 'Open or close the menu', submenu: 'Submenu', social: 'Social media' },
};

function navigationFile(cfg) {
  const home = (l, i) => {
    if (i === 0 && !cfg.prefixDefaultLocale) return '/';
    return cfg.urlStyle === 'file' ? `/${l}.html` : `/${l}/`;
  };
  const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const entries = cfg.locales.map((l, i) => {
    const ui = UI[l] ?? UI[l.split('-')[0]];
    const strings = ui ?? UI.en;
    return `  ${/^[a-z]+$/.test(l) ? l : q(l)}: {${ui ? '' : ' // TODO: translate the ui texts'}
    main: [{ label: ${q(strings.home)}, href: '${home(l, i)}' }],
    footer: [],
    legal: [],
    social: [],
    ui: {
${Object.entries(strings).map(([k, v]) => `      ${k}: ${q(v)},`).join('\n')}
    },
  },`;
  });
  return `/**
 * Header and footer per language: the old site's menus (.migration/structure.md lists them).
 * Labels and hrefs only. Hrefs are the old site's paths, which the new site keeps (/kontakt,
 * /en/contact, /about/ …). Every language in src/migration/site.config.ts needs an entry; a missing
 * one falls back to the first. Read by src/components/sections/navbar&footer/.
 */
export interface NavItem {
  label: string;
  href: string;
  /** One level of submenu items (dropdown on desktop, nested list on phones). */
  children?: NavItem[];
}

export type SocialIcon = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube';

export interface Navigation {
  /** Header menu. */
  main: NavItem[];
  /** Footer link columns. */
  footer: { title: string; links: NavItem[] }[];
  /** Small links in the footer's bottom row: imprint, privacy policy … */
  legal: NavItem[];
  /** Text under the footer logo, e.g. the postal address; line breaks are kept. */
  address?: string;
  /** Social profiles; without an icon (src/assets/icons/<icon>.svg) the label is shown. */
  social: { label: string; href: string; icon?: SocialIcon }[];
  /** Interface texts of header and footer. */
  ui: { home: string; mainNav: string; toggleMenu: string; submenu: string; social: string };
}

export const navigation: Record<string, Navigation> = {
${entries.join('\n')}
};

export function navigationFor(locale: string): Navigation {
  return navigation[locale] ?? Object.values(navigation)[0];
}
`;
}

// ---------------------------------------------------------------------------------------------
// Plan: one item per touched path, with its state

function applyPatches(text, patches, file) {
  let out = text;
  for (const p of patches) {
    const [anchorDesc, replacement] = Array.isArray(p) ? [p[0], p[1]] : [`${p.from}…${p.to}`, p.replace];
    if (replacement && out.includes(replacement)) continue; // applied already
    if (Array.isArray(p)) {
      const n = out.split(p[0]).length - 1;
      if (n !== 1) throw new Error(`${file}: anchor ${n ? 'found more than once' : 'not found'}:\n  ${JSON.stringify(anchorDesc).slice(0, 160)}`);
      out = out.replace(p[0], () => p[1]);
    } else {
      const a = out.indexOf(p.from);
      const b = out.indexOf(p.to, a + p.from.length);
      if (a < 0 || b < 0 || out.indexOf(p.from, a + 1) >= 0)
        throw new Error(`${file}: range anchor not found exactly once:\n  ${JSON.stringify(a < 0 ? p.from : p.to).slice(0, 160)}`);
      out = out.slice(0, a) + p.replace + out.slice(b + p.to.length);
    }
  }
  return out;
}

const patchApplied = (text, patches) =>
  patches.every((p) => {
    const replacement = Array.isArray(p) ? p[1] : p.replace;
    return replacement ? text.includes(replacement) : !text.includes(Array.isArray(p) ? p[0] : p.from);
  });

function editPackage(json) {
  const pkg = JSON.parse(json);
  for (const [section, names] of Object.entries(PACKAGE)) for (const n of names) if (pkg[section]) delete pkg[section][n];
  for (const [name, from, to] of SCRIPTS) {
    if (pkg.scripts?.[name] === to) continue;
    if (pkg.scripts?.[name] !== from) throw new Error(`package.json: scripts.${name} is not "${from}"`);
    pkg.scripts[name] = to;
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
const packageApplied = (json) => {
  const pkg = JSON.parse(json);
  return (
    Object.entries(PACKAGE).every(([section, names]) => names.every((n) => !pkg[section]?.[n])) &&
    SCRIPTS.every(([name, , to]) => pkg.scripts?.[name] === to)
  );
};

async function plan(cfg, written) {
  const items = [];
  const status = async (p, current, { original, adapted }) => {
    if (current === null) return 'missing';
    if (await original()) return 'pristine';
    if (await adapted()) return 'adapted';
    return written.has(p) ? 'edited' : 'drift';
  };
  for (const p of REMOVE) {
    const h = await hashPath(root, p);
    items.push({ path: p, action: 'remove', state: h === null ? 'adapted' : h === UPSTREAM[p] ? 'pristine' : 'drift' });
  }
  for (const [p, spec] of Object.entries(REPLACE)) {
    if (spec.original === 'kit' && !kitInstalled) continue; // compared once the kit is installed
    const current = await read(abs(p));
    const target = spec.generate ? (cfg ? spec.generate(cfg) : null) : await read(spec.from === 'kit' ? path.join(KIT, p) : path.join(OVERLAY, p));
    if (target === null && !spec.generate) fail(`Recipe file missing: ${spec.from}/${p}`);
    const kitOriginal = spec.original === 'kit' ? await read(path.join(KIT, p)) : null;
    const state = await status(p, current, {
      original: async () => (spec.original === 'kit' ? current === kitOriginal : hashOf(current) === UPSTREAM[p]),
      adapted: async () => current === target,
    });
    items.push({ path: p, action: 'replace', state, target });
  }
  for (const p of ADD) {
    const current = await read(abs(p));
    const target = await read(path.join(OVERLAY, p));
    if (target === null) fail(`Recipe file missing: overlay/${p}`);
    items.push({ path: p, action: 'add', state: current === null ? 'pristine' : current === target ? 'adapted' : 'edited', target });
  }
  for (const [p, patches] of Object.entries(PATCH)) {
    const current = await read(abs(p));
    const state = await status(p, current, {
      original: async () => hashOf(current) === UPSTREAM[p],
      adapted: async () => patchApplied(current, patches),
    });
    items.push({ path: p, action: 'patch', state, patches });
  }
  {
    const p = 'package.json';
    const current = await read(abs(p));
    const state = await status(p, current, {
      original: async () => hashOf(current) === UPSTREAM[p],
      adapted: async () => packageApplied(current),
    });
    items.push({ path: p, action: 'edit', state });
  }
  return items;
}

// ---------------------------------------------------------------------------------------------

if (!(await exists(abs('package.json')))) fail(`No package.json in ${root}. Scaffold the theme first (--help).`);
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const kitInstalled = (await exists(abs('src/migration/site.config.ts'))) && (await exists(abs('src/migration/theme/index.ts')));
if (!kitInstalled && !check)
  fail('The migration kit is not installed (src/migration/site.config.ts, src/migration/theme/index.ts missing).\nRun <skill-dir>/scripts/install-kit.mjs first, then this adapter.');
const cfg = kitInstalled ? await siteConfig() : null;
const state = JSON.parse((await read(abs(STATE))) ?? '{}');
const written = new Set(state.written ?? []);
const items = await plan(cfg, written);

const LABEL = {
  pristine: 'as in the pinned commit',
  adapted: 'adapted',
  edited: 'changed after adapting (left as is)',
  missing: 'missing',
  drift: 'DIFFERS from the pinned commit',
};
const drift = items.filter((i) => i.state === 'drift' || i.state === 'missing');

if (check) {
  const counts = {};
  for (const i of items) counts[i.state] = (counts[i.state] ?? 0) + 1;
  console.log(`${THEME} ${COMMIT.slice(0, 7)}: ${items.length} paths touched by the adapter`);
  for (const [s, n] of Object.entries(counts)) console.log(`  ${String(n).padStart(3)} ${LABEL[s]}`);
  const notable = items.filter((i) => ['drift', 'missing', 'edited'].includes(i.state));
  if (notable.length) console.log(`\n${notable.map((i) => `  ${i.path}: ${LABEL[i.state]}`).join('\n')}`);
  if (!kitInstalled) console.log('\nThe migration kit is not installed yet (install-kit.mjs), so kit files and generated files were not compared.');
  console.log(drift.length ? `\nDrift: ${drift.length} path(s) differ from ${REPO}@${COMMIT.slice(0, 7)}. Scaffold that commit, or review the recipe before adapting with --force.` : '\nNo drift.');
  process.exit(drift.length ? 1 : 0);
}

if (drift.length && !force) {
  fail(
    `These paths differ from ${REPO}@${COMMIT.slice(0, 7)} (or are missing):\n${drift.map((i) => `  ${i.path}`).join('\n')}\n\n` +
      `Nothing was changed. Scaffold the pinned commit (--help), or run with --force to adapt anyway\n` +
      `(patches still need their exact anchors; check the build afterwards).`,
  );
}

const todo = items.filter((i) => i.state === 'pristine' || (force && (i.state === 'drift' || (i.state === 'missing' && i.action === 'replace'))));
if (!todo.length) {
  console.log(`${THEME} adapter: nothing to do, the project is already adapted (${items.length} paths checked).`);
} else {
  // Patches first, in memory: a missing anchor stops everything before any file changes.
  const patched = new Map();
  for (const i of todo) {
    try {
      if (i.action === 'patch') patched.set(i.path, applyPatches(await read(abs(i.path)), i.patches, i.path));
      if (i.action === 'edit') patched.set(i.path, editPackage(await read(abs(i.path))));
    } catch (e) {
      fail(`${e.message}\n\nUpstream changed this file. Nothing was changed; update the recipe's anchors (adapt.mjs PATCH).`);
    }
  }
  const verbs = { remove: 'remove', replace: 'replace', add: 'add', patch: 'patch', edit: 'edit' };
  for (const i of todo) {
    if (dryRun) {
      console.log(`  would ${verbs[i.action]} ${i.path}`);
      continue;
    }
    const f = abs(i.path);
    if (i.action === 'remove') await rm(f, { recursive: true, force: true });
    else {
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, patched.get(i.path) ?? i.target);
      written.add(i.path);
    }
  }
  if (!dryRun) {
    // Folders left empty by the removals
    for (const p of [...new Set(REMOVE.map((r) => path.dirname(r.replace(/\/$/, ''))))].sort((a, b) => b.length - a.length)) {
      let d = abs(p);
      while (d.startsWith(root) && d !== root && (await readdir(d).catch(() => ['x'])).length === 0) {
        await rmdir(d);
        d = path.dirname(d);
      }
    }
    await mkdir(path.dirname(abs(STATE)), { recursive: true });
    await writeFile(abs(STATE), `${JSON.stringify({ theme: THEME, repo: REPO, commit: COMMIT, written: [...written].sort() }, null, 2)}\n`);
    const n = (a) => todo.filter((i) => i.action === a).length;
    console.log(`${THEME} adapted: ${n('remove')} removed, ${n('replace') + n('add')} written, ${n('patch') + n('edit')} patched.`);
  }
}

if (!dryRun)
  console.log(`
Next:
  1. npm install   (dependencies changed; the theme's pnpm lockfile is gone)
  2. src/data_files/navigation.ts: menus, footer columns, legal links, address, social links per language
     (from .migration/structure.md)
  3. Brand: src/assets/logo.svg (SHOW_NAME in src/components/BrandLogo.astro), favicons src/images/icon.svg,
     icon.png, icon-maskable.png; site name in src/migration/site.config.ts
  4. Content into src/content/, then npm run build
  5. The look is still the theme's demo look: design pass per the recipe (tokens in src/assets/styles/global.css,
     Navbar, FooterSection, src/migration/theme/)`);
