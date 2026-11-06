#!/usr/bin/env node
// AstroWind adapter for the cms-to-astro migration kit (recipe: references/themes/astrowind.md).
// Run from a project folder holding AstroWind at the pinned commit with the kit installed. It removes
// what a migration doesn't use (demo pages and posts, blog routes, Decap CMS, analytics, Partytown,
// astro-compress, repository and deploy files), wires the theme into the kit's integration points and
// prints the steps left. Every touched file is checked first (pinned hash or exact anchors); on any
// mismatch nothing is changed. Idempotent. No dependencies; Node >= 22.
//
//   node adapt.mjs [--check] [--into <dir>]

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PINNED = '14e1a691f80548dcc36370847b1a02c0d0b12821';
const THEME = { name: '@arthelokyo/astrowind', version: '1.0.0-beta.66' };

const HELP = `Usage: node adapt.mjs [--check] [--into <dir>]

Adapts AstroWind (github.com/arthelokyo/astrowind @ ${PINNED.slice(0, 12)}) to the cms-to-astro kit.
Order: scaffold the theme at that commit, install the kit (scripts/install-kit.mjs), run this, npm install.

  --check        Only report: for every file this adapter touches, whether it matches the pinned
                 commit (upstream), is already adapted, or differs (drift). Exit code 1 on drift.
  --into <dir>   Project folder (default: .)
  --help         Show this help`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const CHECK = args.includes('--check');
const intoAt = args.indexOf('--into');
const ROOT = path.resolve(intoAt >= 0 ? args[intoAt + 1] ?? '.' : '.');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = path.join(HERE, 'overlay');
const KIT = path.resolve(HERE, '../../kit');

// sha256 (first 16 hex digits, LF line endings) of every theme file this adapter deletes, replaces or
// patches, at the pinned commit.
const DELETE = {
  // repository, AI guides about the theme, deploy configs for other hosts (the skill brings its own)
  '.agents/skills/add-blog-post.md': '202a0e32f401a2b9',
  '.agents/skills/add-component.md': 'd1cf9e645c37bd67',
  '.agents/skills/add-page.md': 'c78438fab89e7801',
  '.agents/skills/add-structured-data.md': 'e7054a512aecbca2',
  '.agents/skills/configure-contact-form.md': '91a7f0f94d04b442',
  '.agents/skills/content-at-build-time.md': '0fe2864d410853f5',
  '.agents/skills/customize-header.md': 'a8a1e358fe215690',
  '.agents/skills/deploy-cloudflare.md': 'a9f3b2f937b32a83',
  '.agents/skills/deploy-with-base-path.md': '5edabba9922d9791',
  '.agents/skills/disable-blog.md': '6bb180443e8fb7cd',
  '.agents/skills/set-open-graph-image.md': '47bf0a6938ad9d07',
  '.agents/skills/setup-decap-cms.md': '474dbed1438c5762',
  '.agents/skills/styling.md': '4dd2932010509947',
  '.agents/skills/use-shadcn-tokens.md': '35726f702d5eb65b',
  '.agents/skills/use-widgets.md': 'd90304313fffbd5b',
  '.agents/skills/write-landing-page.md': 'ba7b5e40abe960ae',
  'AGENTS.md': 'cbd55de9d65617c4',
  'CLAUDE.md': 'faf5480de781a9fa',
  'README.md': '4acf123e6673fbe1',
  '.github/assets/lighthouse-dark.svg': '56ef901bb3f0de95',
  '.github/assets/lighthouse-light.svg': '21de0cb6915a7ba3',
  '.github/workflows/actions.yaml': '74c5a359c3825cc5',
  Dockerfile: '137305b9a6588fc9',
  'docker-compose.yml': 'fbf6419fc9876e3b',
  '.dockerignore': '064b9f3ffe8a7290',
  'nginx/nginx.conf': '7ea789d52bf078de',
  'netlify.toml': '3aceb08280fb0a94',
  'vercel.json': 'ec7b92cd105d7508',
  'sandbox.config.json': '807594ae84cb894e',
  '.stackblitzrc': '4009b40f4f5fdc8e',
  'wrangler.jsonc': 'b9fd84038c3a3295',
  // Decap CMS admin (loads its app from unpkg)
  'public/decapcms/config.yml': 'f4640ade5a82632a',
  'public/decapcms/index.html': 'afe8d7df5072683e',
  // demo pages; the blog routes would collide with the kit's catch-all (posts = the kit's news collection)
  'src/pages/index.astro': '44938aac19ebf197',
  'src/pages/about.astro': '8ed9c1d4f36297f6',
  'src/pages/contact.astro': '0822fc5dce78455b',
  'src/pages/pricing.astro': 'cce152681537bab2',
  'src/pages/services.astro': 'f9f64429b1cb3586',
  'src/pages/privacy.md': '765d558fe92a7274',
  'src/pages/terms.md': '29790f4372133c19',
  'src/pages/rss.xml.ts': '753193dc4113d438',
  'src/pages/homes/mobile-app.astro': 'e7723ed5e860ccf2',
  'src/pages/homes/personal.astro': '0965e1f5ebc4c8c0',
  'src/pages/homes/saas.astro': 'b5ff7146414f4784',
  'src/pages/homes/startup.astro': 'd2bed3b4fe573fa8',
  'src/pages/landing/click-through.astro': '3ee730a132cb362d',
  'src/pages/landing/lead-generation.astro': '225d7382fb2b7353',
  'src/pages/landing/pre-launch.astro': '491e219aeea437b9',
  'src/pages/landing/product.astro': '08f0dae8003ed473',
  'src/pages/landing/sales.astro': '1ccef3c645b2e50a',
  'src/pages/landing/subscription.astro': '72aeaf50dc4a38e4',
  'src/pages/[...blog]/index.astro': 'd9ad5fd64222fa0c',
  'src/pages/[...blog]/[...page].astro': '0f3d8e7e6e319fab',
  'src/pages/[...blog]/[category]/[...page].astro': '22ab1f627500dfb1',
  'src/pages/[...blog]/[tag]/[...page].astro': 'd1b8ada2b5c0e604',
  // demo posts and the blog code that reads the `post` collection
  'src/data/post/astrowind-template-in-depth.mdx': '833df6094a94e977',
  'src/data/post/build-websites-with-ai.md': 'bbd0187bf22f8f0b',
  'src/data/post/get-started-website-with-astro-tailwind-css.md': '66af26d63132dc1b',
  'src/data/post/how-to-customize-astrowind-to-your-brand.md': '58ffc4f69c6005bc',
  'src/data/post/landing.md': 'f3bb2213290cb2aa',
  'src/data/post/markdown-elements-demo-post.mdx': 'e7a4aef1e30e6df0',
  'src/data/post/useful-resources-to-create-websites.md': '65303b60cbd5867a',
  'src/utils/blog.ts': 'fdc2a3a046febebd',
  'src/components/blog/Grid.astro': '51fe4793856fbf25',
  'src/components/blog/GridItem.astro': 'caf74cf0c0853ff3',
  'src/components/blog/Headline.astro': '0ead0513c05e7dca',
  'src/components/blog/List.astro': '1f9d41c0c8962fc5',
  'src/components/blog/ListItem.astro': 'dd070189d44cf904',
  'src/components/blog/Pagination.astro': 'dcd3d62f369d1c86',
  'src/components/blog/RelatedPosts.astro': 'c72e12c42dffbf21',
  'src/components/blog/SinglePost.astro': '32487d48ef6a3792',
  'src/components/blog/Tags.astro': 'fba9d937619327f0',
  'src/components/blog/ToBlogLink.astro': '90a3ab68d16f4a27',
  'src/components/widgets/BlogLatestPosts.astro': 'a5507369fb60aeeb',
  'src/components/widgets/BlogHighlightedPosts.astro': '44df528a43213a76',
  'src/components/common/SocialShare.astro': '00cfc9b2e25f2bc6',
  // head tags (the kit's <Meta> replaces them), analytics, site verification, demo announcement (shields.io)
  'src/components/common/Metadata.astro': 'ef352805906ebbe7',
  'src/components/common/Analytics.astro': '694bb89e512ae4ab',
  'src/components/common/SiteVerification.astro': 'e911f23bf2adf7d7',
  'src/components/widgets/Announcement.astro': '8edfe386eb56fb63',
  // layouts of the demo pages (the kit Shell wraps Layout.astro directly) and demo images
  'src/layouts/PageLayout.astro': 'a1194f6b0c7b8f50',
  'src/layouts/MarkdownLayout.astro': '9763a5327be2b624',
  'src/layouts/LandingLayout.astro': 'e7f894640e37fefa',
  'src/assets/images/app-store.png': '4cd7a2ffddef89be',
  'src/assets/images/google-play.png': '2a9ea62e408d3eb7',
  'src/assets/images/hero-image.png': '76f60d9db6dc2fce',
  'src/assets/images/default.png': 'c16c3ea155c0e4fd',
};

// Theme files replaced as a whole: upstream hash, source of the new content, and how to recognise an
// adapted file that was edited afterwards (kept on later runs).
const REPLACE = {
  'src/pages/404.astro': { hash: 'e42775b5d1d0bf8c', from: path.join(KIT, 'src/pages/404.astro'), adapted: (s) => s.includes('migration/NotFound.astro') },
  'src/content.config.ts': { hash: 'cdbb6c2aa0bdbc6a', from: path.join(KIT, 'src/content.config.ts'), adapted: (s) => s.includes('migrationCollection') },
  'src/config.yaml': { hash: 'd2eb97d03feb8ce7', from: path.join(OVERLAY, 'src/config.yaml'), adapted: (s) => s.includes('cms-to-astro') },
  'src/navigation.ts': { hash: 'ae6fdb9becfcd98c', from: path.join(OVERLAY, 'src/navigation.ts'), adapted: (s) => s.includes('cms-to-astro') },
  'src/components/Logo.astro': { hash: '0e7b075f0746bf7a', from: path.join(OVERLAY, 'src/components/Logo.astro'), adapted: (s) => s.includes('cms-to-astro') },
  // a kit file: the recipe's version replaces the kit's default
  'src/migration/theme/index.ts': { kit: true, from: path.join(OVERLAY, 'src/migration/theme/index.ts'), adapted: (s) => s.includes('AstroWindShell') },
};

// Packages only the removed code used.
const REMOVE_PACKAGES = {
  dependencies: ['@astro-community/astro-embed-twitter', '@astro-community/astro-embed-vimeo', '@astro-community/astro-embed-youtube', '@astrojs/rss', 'astro-seo'],
  devDependencies: ['@astrojs/mdx', '@astrojs/partytown', '@types/mdx', 'astro-compress'],
  overrides: ['astro-compress'],
};
const PACKAGE_HASH = '03da08546d72085a';

// ---------------------------------------------------------------------------------------------------
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const abs = (f) => path.join(ROOT, f);
const isText = (f) => !/\.(png|jpe?g|gif|webp|ico)$/i.test(f);
const read = (f) => readFileSync(abs(f), 'utf8').replace(/\r\n/g, '\n');
const hashOf = (f) => createHash('sha256').update(isText(f) ? read(f) : readFileSync(abs(f))).digest('hex').slice(0, 16);

// Preconditions: AstroWind at the pinned version, kit installed.
if (!existsSync(abs('package.json'))) fail(`No package.json in ${ROOT}. Run from the project folder or pass --into.`);
const pkg = JSON.parse(read('package.json'));
if (pkg.name !== THEME.name) fail(`${ROOT} is not AstroWind (package.json name "${pkg.name}"). This adapter is for ${THEME.name}.`);
if (!existsSync(abs('src/migration/site.config.ts')) || !existsSync(abs('src/migration/theme/index.ts'))) {
  fail('The migration kit is not installed. First: node <skill-dir>/scripts/install-kit.mjs --old-origin <url> --locales <list> --url-style <style>');
}
const siteConfig = read('src/migration/site.config.ts');
const value = (re, what) => siteConfig.match(re)?.[1] ?? fail(`src/migration/site.config.ts: ${what} not found (expected the installer's format).`);
const origin = value(/oldOrigin:\s*'([^']*)'/, 'oldOrigin');
const urlStyle = value(/urlStyle:\s*'(directory|preserve|file)'/, 'urlStyle');
const locales = value(/locales:\s*\[([^\]]*)\]/, 'locales').split(',').map((l) => l.trim().replace(/^'|'$/g, '')).filter(Boolean);
const prefixDefault = value(/prefixDefaultLocale:\s*(true|false)/, 'prefixDefaultLocale') === 'true';
const [format, trailingSlash] = { directory: ['directory', 'always'], preserve: ['preserve', 'ignore'], file: ['file', 'never'] }[urlStyle];
const locale404 = urlStyle === 'directory' && (locales.length > 1 || prefixDefault);

// Patches: each edit is `find` (exact, once) or `from`…`to` (exact anchors, once, in order) → `replace`.
// An edit counts as done when its `marker` (default: `replace`, or the anchor's absence for removals) is there.
const PATCHES = {
  'astro.config.ts': {
    hash: '16310518da626d55',
    edits: [
      { find: "import mdx from '@astrojs/mdx';\nimport partytown from '@astrojs/partytown';\n", replace: '' },
      { find: "import compress from 'astro-compress';\nimport type { AstroIntegration } from 'astro';\n", replace: '' },
      {
        find: "import astrowind from './vendor/integration';\n",
        replace:
          "import astrowind from './vendor/integration';\n\n// cms-to-astro kit: sitemap filter, placeholders for pages not moved yet" +
          (locale404 ? ', 404 file per language' : '') +
          "\nimport { sitemapOptions } from './src/migration/sitemap.mjs';\nimport pendingPages from './integrations/pending-pages.mjs';\n" +
          (locale404 ? "import locale404 from './src/migration/locale-404.mjs';\n" : ''),
        marker: "import pendingPages from './integrations/pending-pages.mjs';",
      },
      { from: 'const hasExternalScripts = false;\n', to: 'hasExternalScripts ? (Array.isArray(items) ? items.map((item) => item()) : [items()]) : [];\n\n', replace: '' },
      {
        find: "  output: 'static',\n",
        replace: `  output: 'static',\n\n  // cms-to-astro kit: the old site's origin until go-live, and its URL style (site.config.ts urlStyle '${urlStyle}').\n  site: '${origin}',\n  build: { format: '${format}' },\n  trailingSlash: '${trailingSlash}',\n`,
        marker: "// cms-to-astro kit: the old site's origin",
      },
      { find: '    sitemap(),\n    mdx(),\n', replace: '    sitemap(sitemapOptions()),\n' },
      { from: '    ...whenExternalScripts(() =>\n', to: '    ),\n\n', replace: '' },
      { from: '    compress({\n', to: '      Logger: 1,\n    }),\n\n', replace: '' },
      {
        find: "    astrowind({\n      config: './src/config.yaml',\n    }),\n",
        replace:
          "    astrowind({\n      config: './src/config.yaml',\n    }),\n" +
          `    pendingPages({ oldOrigin: '${origin}' }), // cms-to-astro kit, migration only: remove at go-live\n` +
          (locale404 ? '    locale404(),\n' : ''),
        marker: 'pendingPages({ oldOrigin:',
      },
    ],
  },
  'vendor/integration/index.ts': {
    hash: 'd24e30b0f8b95da5',
    edits: [
      {
        find: "        updateConfig({\n          site: SITE.site,\n          base: SITE.base,\n\n          trailingSlash: SITE.trailingSlash ? 'always' : 'never',\n\n          vite: {\n",
        replace:
          '        // cms-to-astro: site, base and trailingSlash are set in astro.config.ts (the kit\'s URL style);\n        // config.yaml must not override them.\n        updateConfig({\n          vite: {\n',
      },
    ],
  },
  'src/layouts/Layout.astro': {
    hash: 'aa7e805799dcf0de',
    edits: [
      {
        find: "import Metadata from '~/components/common/Metadata.astro';\nimport SiteVerification from '~/components/common/SiteVerification.astro';\nimport Analytics from '~/components/common/Analytics.astro';\nimport Intersect from '~/components/common/Intersect.astro';\n",
        replace: '',
      },
      {
        from: "// Comment the line below to disable View Transitions\nimport { ClientRouter } from 'astro:transitions';\n",
        to: 'const { metadata = {} } = Astro.props;\n',
        replace:
          "// cms-to-astro: View Transitions are off; kit scripts, placeholders and migrated inline HTML expect full\n// page loads. To turn them on: import { ClientRouter } from 'astro:transitions', render\n// <ClientRouter fallback=\"swap\" /> in <head>, then test the menu, videos and search.\n\nexport interface Props {\n  /** <html lang>: the page's language (the kit Shell passes meta.lang); else i18n.language in config.yaml. */\n  lang?: string;\n}\n\nconst { lang } = Astro.props;\n",
      },
      { find: '<html lang={language} dir={textDirection}', replace: '<html lang={lang ?? language} dir={textDirection}' },
      {
        from: '    <Metadata {...metadata} />\n',
        to: '    <ClientRouter fallback="swap" />\n',
        replace: "    {/* cms-to-astro: title, description, canonical, hreflang, robots and Open Graph come from the kit's <Meta> (head slot). */}\n",
      },
      {
        find: '    <slot />\n\n    <Intersect />\n',
        replace:
          "    <slot />\n    {\n      /* cms-to-astro: reveal on scroll off (see fadeInUp in src/assets/styles/tailwind.css). To restore it,\n         import Intersect from '~/components/common/Intersect.astro' and render <Intersect /> here. */\n    }\n",
      },
    ],
  },
  'src/assets/styles/tailwind.css': {
    hash: '92693955da201bd0',
    edits: [
      {
        find: '  @keyframes fadeInUp {\n    0% {\n      opacity: 0;\n      transform: translateY(0.75rem);\n    }\n',
        replace:
          '  /* cms-to-astro: entry fade off. Widgets carry `md:opacity-0` until this animation runs; full-page\n     screenshots restart CSS animations and caught every section near-invisible. To restore the fade:\n     first frame `opacity: 0; transform: translateY(0.75rem);` and <Intersect /> in Layout.astro. */\n  @keyframes fadeInUp {\n    0% {\n      opacity: 1;\n      transform: translateY(0);\n    }\n',
      },
    ],
  },
  'src/components/widgets/Header.astro': {
    hash: 'b7d1412667075cfc',
    edits: [
      { find: '  position?: string;\n}', replace: "  position?: string;\n  /** Href of the logo link (the kit Shell passes the home of the page's language). */\n  homeHref?: string;\n}" },
      { find: "  position = 'center',\n} = Astro.props;", replace: "  position = 'center',\n  homeHref = getHomePermalink(),\n} = Astro.props;" },
      { find: '<a class="flex items-center" href={getHomePermalink()}>', replace: '<a class="flex items-center" href={homeHref}>' },
    ],
  },
  'src/components/widgets/Footer.astro': {
    hash: '25d3e1351d7ed5e5',
    edits: [
      {
        find: '  theme?: string;\n}',
        replace:
          "  theme?: string;\n  /** Href of the site name link (the kit Shell passes the home of the page's language). */\n  homeHref?: string;\n  /** Site name above the legal links (the kit Shell passes site.config.ts `name`). */\n  siteName?: string;\n}",
      },
      {
        find: "const { socialLinks = [], secondaryLinks = [], links = [], footNote = '', theme = 'light' } = Astro.props;",
        replace:
          "const {\n  socialLinks = [],\n  secondaryLinks = [],\n  links = [],\n  footNote = '',\n  theme = 'light',\n  homeHref = getHomePermalink(),\n  siteName = SITE?.name,\n} = Astro.props;",
      },
      { find: '<a class="inline-block font-bold text-xl" href={getHomePermalink()}>{SITE?.name}</a>', replace: '<a class="inline-block font-bold text-xl" href={homeHref}>{siteName}</a>' },
    ],
  },
};

// New files of the recipe (everything in overlay/src/migration/theme except index.ts, which replaces the kit's).
const ADD = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else ADD.push(path.relative(OVERLAY, f).split(path.sep).join('/'));
  }
};
walk(path.join(OVERLAY, 'src/migration/theme'));
ADD.splice(ADD.indexOf('src/migration/theme/index.ts'), 1);

// ---------------------------------------------------------------------------------------------------
// Plan: decide every action before changing anything.
const actions = []; // { file, do: fn, note }
const report = []; // [file, status]
const drift = []; // files that differ from the pinned commit (or the recipe)
const errors = [];
const kept = [];

for (const [file, hash] of Object.entries(DELETE)) {
  if (!existsSync(abs(file))) report.push([file, 'removed']);
  else if (hashOf(file) === hash) {
    report.push([file, 'upstream']);
    actions.push({ file, note: 'delete', run: () => rmSync(abs(file)) });
  } else {
    report.push([file, 'DRIFT']);
    drift.push(file);
    kept.push(`${file} (differs from the theme's version, not deleted: check it by hand)`);
  }
}

for (const [file, r] of Object.entries(REPLACE)) {
  const next = readFileSync(r.from, 'utf8');
  if (!existsSync(abs(file))) {
    report.push([file, 'missing']);
    actions.push({ file, note: 'write', run: () => write(file, next) });
    continue;
  }
  const now = read(file);
  const pristine = r.kit ? now === readFileSync(path.join(KIT, file), 'utf8').replace(/\r\n/g, '\n') : hashOf(file) === r.hash;
  if (now === next.replace(/\r\n/g, '\n')) report.push([file, 'adapted']);
  else if (pristine) {
    report.push([file, r.kit ? 'kit default' : 'upstream']);
    actions.push({ file, note: 'replace', run: () => write(file, next) });
  } else if (r.adapted(now)) {
    report.push([file, 'adapted (edited since)']);
  } else {
    report.push([file, 'DRIFT']);
    drift.push(file);
    errors.push(`${file}: differs from ${r.kit ? "the kit's default" : `AstroWind ${PINNED.slice(0, 12)}`} and from this recipe's version. Merge by hand (recipe file: ${path.relative(ROOT, r.from)}), then run again.`);
  }
}

for (const file of ADD) {
  const next = readFileSync(path.join(OVERLAY, file), 'utf8');
  if (!existsSync(abs(file))) {
    report.push([file, 'new']);
    actions.push({ file, note: 'add', run: () => write(file, next) });
  } else report.push([file, read(file) === next.replace(/\r\n/g, '\n') ? 'adapted' : 'adapted (edited since)']);
}

const count = (s, part) => s.split(part).length - 1;
for (const [file, p] of Object.entries(PATCHES)) {
  if (!existsSync(abs(file))) {
    report.push([file, 'DRIFT']);
    drift.push(file);
    errors.push(`${file}: missing; the adapter patches it. Restore it from AstroWind ${PINNED.slice(0, 12)}.`);
    continue;
  }
  const text = read(file);
  const pristine = hashOf(file) === p.hash;
  const problems = [];
  const pending = [];
  for (const e of p.edits) {
    const anchor = e.find ?? e.from;
    const done = e.marker ? text.includes(e.marker) : e.replace ? text.includes(e.replace) : !text.includes(anchor);
    if (done) continue;
    const once = count(text, anchor) === 1 && (!e.to || count(text.slice(text.indexOf(anchor)), e.to) >= 1);
    if (once) pending.push(e);
    else problems.push(`anchor ${count(text, anchor) ? 'not unique' : 'not found'}: ${JSON.stringify(anchor.split('\n')[0])}${e.to ? ` … ${JSON.stringify(e.to.trim().split('\n')[0])}` : ''}`);
  }
  if (problems.length) {
    report.push([file, 'DRIFT']);
    drift.push(file);
    errors.push(
      `${file}: neither AstroWind ${PINNED.slice(0, 12)} nor adapted by this recipe (${problems.join('; ')}). Upstream or the file changed: patch it by hand (patch list in adapt.mjs), or restore the file from AstroWind ${PINNED.slice(0, 12)} and run again.`,
    );
  } else if (!pending.length) report.push([file, 'adapted']);
  else {
    report.push([file, pristine ? 'upstream' : 'DRIFT (anchors found)']);
    if (!pristine) drift.push(file);
    actions.push({
      file,
      note: `patch (${pending.length} edit${pending.length > 1 ? 's' : ''})`,
      run: () => {
        let s = read(file);
        for (const e of pending) {
          const start = s.indexOf(e.find ?? e.from);
          const end = e.to ? s.indexOf(e.to, start) + e.to.length : start + e.find.length;
          s = s.slice(0, start) + e.replace + s.slice(end);
        }
        write(file, s);
      },
    });
  }
}

{
  const present = Object.entries(REMOVE_PACKAGES).flatMap(([field, names]) => names.filter((n) => pkg[field]?.[n] !== undefined).map((n) => [field, n]));
  const pristine = hashOf('package.json') === PACKAGE_HASH;
  if (!present.length) report.push(['package.json', 'adapted']);
  else {
    report.push(['package.json', pristine ? 'upstream' : 'DRIFT (packages still listed)']);
    if (!pristine) drift.push('package.json');
    actions.push({
      file: 'package.json',
      note: `remove ${present.map(([, n]) => n).join(', ')}`,
      run: () => {
        for (const [field, name] of present) delete pkg[field][name];
        write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
      },
    });
  }
  if (pkg.version !== THEME.version) {
    report.push(['package.json version', `DRIFT (${pkg.version}, recipe pinned ${THEME.version})`]);
    drift.push('package.json version');
  }
}

function write(file, content) {
  mkdirSync(path.dirname(abs(file)), { recursive: true });
  writeFileSync(abs(file), content);
}

// ---------------------------------------------------------------------------------------------------
if (CHECK) {
  const width = Math.max(...report.map(([f]) => f.length));
  for (const [file, status] of report) console.log(`${file.padEnd(width)}  ${status}`);
  console.log(
    drift.length
      ? `\nDrift in ${drift.length} file(s): they differ from AstroWind ${PINNED.slice(0, 12)} and from this recipe.${errors.length ? `\n${errors.map((e) => `- ${e}`).join('\n')}` : ''}`
      : `\nNo drift: every touched file is AstroWind ${PINNED.slice(0, 12)} or already adapted.`,
  );
  process.exit(drift.length ? 1 : 0);
}

if (errors.length) fail(`Nothing changed. The project doesn't match what this adapter expects:\n${errors.map((e) => `- ${e}`).join('\n')}`);

for (const a of actions) a.run();
// Folders the deletions emptied.
for (const dir of [...new Set(actions.filter((a) => a.note === 'delete').map((a) => path.dirname(a.file)))].sort((a, b) => b.length - a.length)) {
  for (let d = dir; d && d !== '.'; d = path.dirname(d)) {
    if (!existsSync(abs(d)) || readdirSync(abs(d)).length) break;
    rmdirSync(abs(d));
  }
}

const by = (n) => actions.filter((a) => a.note.startsWith(n)).length;
console.log(
  actions.length
    ? `AstroWind adapted for the kit (${urlStyle} URLs, ${locales.join(', ')}): ${by('delete')} files deleted, ${by('replace') + by('write')} replaced, ${by('add')} added, ${by('patch')} patched${by('remove') ? ', packages removed from package.json' : ''}.`
    : 'Nothing to do: the project is already adapted.',
);
if (kept.length) console.log(`\nKept:\n${kept.map((k) => `- ${k}`).join('\n')}`);
console.log(`
Next:
1. npm install   (prunes the removed packages; the build downloads the Inter font once and self-hosts it)
2. src/navigation.ts: header and footer menus per language, from .migration/structure.md
3. src/components/Logo.astro and src/assets/favicons/: the owner's logo and icons (replace the AstroWind ones)
4. The look: src/components/CustomStyles.astro (colours, font variables) and the \`fonts\` entry in
   astro.config.ts, through the design process (frontend-design); widgets in src/components/widgets/
5. npm run build && npx astro check
If urlStyle, locales or oldOrigin change later in site.config.ts, update site/build/trailingSlash and the
kit integrations in astro.config.ts by hand (this adapter writes them once).`);
