# Astro project setup

Keep the project boring: Astro, Tailwind, Markdown content, as few dependencies as the site needs. Every dependency is something the owner's agent must keep updated later. Astro changes between major versions; when an example here fails, check the current Astro docs for that feature before working around it.

## Contents
1. Scaffold and clean-up
2. Astro 7 specifics
3. Folder layout
4. Content collections
5. Page-builder pages: fixed layout, editable sections
6. Routes that keep the old URLs; wireframes; the home page
7. Pages not migrated yet: relative links and placeholder pages; status page
8. Layout, navigation, styles, fonts
9. Images and files
10. React and shadcn/ui (only when needed)
11. SEO basics, 404, redirects
12. Checks and gotchas

## 1. Scaffold and clean-up

The project folder already holds `MIGRATION.md` and `.migration/`. `create-astro` won't scaffold into a non-empty folder (with `-y` it silently picks a random subfolder), so scaffold into a temporary folder and copy without overwriting:

```bash
npm create astro@latest -- .scaffold --template minimal --no-install --no-git --skip-houston -y
node -e "require('fs').cpSync('.scaffold', '.', { recursive: true, force: false })" && rm -rf .scaffold
npm install
npx astro add tailwind -y          # Tailwind v4 via @tailwindcss/vite
npx astro add sitemap -y
node -v | sed 's/^v//' > .nvmrc    # pin the Node version in use
```

Clean up what the scaffold leaves behind:

- `package.json`: set `"name"` (it is "scaffold" now); compare `"engines"` with `.nvmrc` and the Node version on the host.
- `README.md`: replace with two lines pointing to `AGENTS.md` and `docs/EDITING.md`.
- `AGENTS.md`: current create-astro writes its own (dev server and doc links). Keep useful lines (e.g. `astro dev --background`) and replace it in stage 8.
- `public/favicon.*`: Astro's logo; replace with the site's icons (download them with the other assets).
- `.gitignore`: add `.env*`, `.claude/settings.local.json` (personal Claude Code settings, e.g. a locally installed design plugin), `.migration/tools/node_modules/`, `.migration/snapshots/`, `.migration/comparison/`. Keep `.migration/*.json`, `*.txt` and reports in git; they document where content came from.

**Fallback without GitHub access** (corporate proxy, allowlist): `create-astro` downloads its template from GitHub. Build the same minimal project from npm alone:

```bash
npm init -y && npm pkg set type=module name=<project-name> scripts.dev="astro dev" scripts.build="astro build" scripts.preview="astro preview" scripts.astro="astro"
npm i astro
mkdir -p src/pages public
printf "import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n" > astro.config.mjs
printf '{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts", "**/*"], "exclude": ["dist"] }\n' > tsconfig.json
printf -- "---\n---\n<h1>It works</h1>\n" > src/pages/index.astro
npx astro add tailwind -y && npx astro add sitemap -y
npm pkg set engines.node="$(npm view astro engines.node)"
```

## 2. Astro 7 specifics

- **Markdown processor:** Astro 7's default Markdown processor is Sätteri, not unified/remark. `markdown.remarkPlugins` / `rehypePlugins` fail the build unless `@astrojs/markdown-remark` is installed. Prefer solving things without Markdown plugins (templates, the build step in section 7). If a plugin is unavoidable, either install `@astrojs/markdown-remark` to use remark/rehype plugins as before, or write a Sätteri hast plugin per Astro's Markdown docs.
- **Zod:** import `z` from `astro/zod` (the `astro:content` re-export is deprecated). Zod 4 syntax: `z.url()` instead of `z.string().url()`.
- **Node:** Astro 7.4 requires Node ≥ 22.23.4 (`engines`); the current LTS is the safe choice.
- **Servers start themselves in the background:** run non-interactively, `astro dev` and `astro preview` detach, print `… running at http://localhost:<port> (pid …)` and return; `astro dev stop|status|logs` and `astro preview stop|status` manage them. If the port is taken they silently take the next one, while an older server keeps answering on the old port. Always read the printed URL, and stop servers at the end of each stage.

## 3. Folder layout

```
MIGRATION.md               progress file (moves to docs/ after go-live)
AGENTS.md, CLAUDE.md       agent instructions (stage 8)
docs/EDITING.md            owner guide (stage 8)
astro.config.mjs
integrations/              pending-pages.mjs during the migration (section 7)
src/
  content.config.ts        content collections and their fields
  content/<type>/…md       one folder per content type (pages, posts, projects, team …)
  content/sections/<page>/ editable text blocks of designed pages (section 5)
  data/site.json           contact data, social links (one place, used everywhere)
  data/navigation.json     menus, footer links
  layouts/Base.astro       html head, header, footer (<main data-pagefind-body> if search is built)
  layouts/Wireframe.astro  unstyled content in the site frame, during the migration
  components/              Header, Footer, ProjectGrid, Gallery …
  pages/                   routes: index.astro, designed pages, [...path].astro per collection
  styles/global.css        Tailwind import + design tokens
public/
  media/…                  downloaded images and files (paths mirror the old uploads)
  favicon.*, robots.txt, _redirects
.migration/                inventory, export reports, snapshots, tools (not deployed)
```

## 4. Content collections

One collection per content type from the inventory's URL groups. Fields mirror what the export writes, so files validate from the start:

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const base = {
  title: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  excerpt: z.string().optional(),
  date: z.coerce.date().optional(),
  updated: z.coerce.date().optional(),
  featuredImage: z.string().optional(),   // /media/…
  oldUrl: z.url().optional(),             // routes, redirects, provenance
  order: z.number().optional(),
  draft: z.boolean().default(false),
  needsReview: z.boolean().optional(),
  wireframe: z.boolean().optional(),      // rendered in the wireframe layout until the type is styled
  isFrontPage: z.boolean().optional(),
  lang: z.string().optional(),            // multilingual sites
  translationKey: z.string().optional(),
};

export const collections = {
  pages: defineCollection({ loader: glob({ pattern: '**/*.md', base: './src/content/pages' }), schema: z.object(base) }),
  posts: defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
    schema: z.object({ ...base, categories: z.array(z.string()).default([]), tags: z.array(z.string()).default([]) }),
  }),
};
```

Structured content (team members, projects with year, client, category, cover image) gets real fields instead of free text, so templates render it consistently and the agent can edit it safely.

Raw imports are validated too, even before their pages are built: keep optional fields lenient (`.optional()`, `.default('')`) until a type is cleaned up, or one odd file fails the whole build. Keep `wpId` and `author` from the WordPress export in the schema (Zod drops unknown fields silently); they document provenance.

## 5. Page-builder pages: fixed layout, editable sections

Designed pages (a home page with hero and grid, an "About" with several styled blocks) are layouts, not prose. Keep the layout in a page template and every text block in its own small Markdown file, so the owner's agent edits text without touching layout:

```
src/content/sections/about/intro.md        title, body
src/content/sections/about/what-we-do.md   title, body
src/content/sections/about/bio.md          image, body
```

```ts
// content.config.ts (addition)
sections: defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sections' }),
  schema: z.object({ title: z.string().optional(), image: z.string().optional(), links: z.array(z.object({ label: z.string(), href: z.string() })).optional() }),
}),
```

```astro
---
// src/pages/about.astro
import { getEntry, render } from 'astro:content';
const intro = await getEntry('sections', 'about/intro');
const { Content: IntroText } = await render(intro);
---
<section class="…the extracted layout…"><h2>{intro.data.title}</h2><IntroText /></section>
```

Site-wide facts (address, phone, e-mail, social links) live in `src/data/site.json`; templates read them from there. Migrated body text often repeats them anyway; AGENTS.md tells the agent to search for old values everywhere.

**Many builder pages from the same blocks** (typical for agency themes and multilingual sites: 30 pages × 5 languages, all made of hero, text/image, feature list, team, call-to-action): one file per page and language, with the blocks as a validated list in the frontmatter and one renderer component:

```yaml
---
title: "Product page"
lang: de
translationKey: product
oldUrl: "https://www.example.com/product"
blocks:
  - type: hero
    heading: "…"
    image: /media/hero.jpg
  - type: textImage
    text: "Markdown **allowed** here"
    image: /media/photo.jpg
    imageSide: right
  - type: features
    items: [{ icon: truck, title: "…", text: "…" }]
---
```

`src/components/Blocks.astro` maps each `type` to a component; the schema is a `z.discriminatedUnion('type', [...])`. Section files (above) suit a few one-off designed pages; the blocks pattern suits many pages built from a shared set. Visual separators between blocks belong in CSS (e.g. a border on each block heading but the first), not in empty Markdown.

## 6. Routes that keep the old URLs; wireframes; the home page

> The migration kit (`scripts/install-kit.mjs`, documented in `src/migration/KIT.md` after installing) implements this section. Read it to understand the behaviour or to debug; don't rebuild it by hand.

Keep the old paths (wordpress.md → URLs). A catch-all route per collection derives the path from `oldUrl`:

```astro
---
// src/pages/[...path].astro  (pages + posts that keep their old path)
import { getCollection, render } from 'astro:content';
import Base from '../layouts/Base.astro';
import Wireframe from '../layouts/Wireframe.astro';

export async function getStaticPaths() {
  const entries = [...(await getCollection('pages')), ...(await getCollection('posts'))]
    .filter((e) => !e.data.draft && !e.data.isFrontPage);           // the home page has its own template
  return entries.map((entry) => {
    const p = entry.data.oldUrl ? new URL(entry.data.oldUrl).pathname : `/${entry.id}/`;
    return { params: { path: p.replace(/^\/|\/$/g, '') || undefined }, props: { entry } };
  });
}
const { entry } = Astro.props;
const { Content } = await render(entry);
---
{entry.data.wireframe
  ? <Wireframe title={entry.data.title} oldUrl={entry.data.oldUrl}><Content /></Wireframe>
  : <Base title={entry.data.title}><article class="prose"><Content /></article></Base>}
```

**Wireframes:** copy `assets/templates/Wireframe.astro` to `src/layouts/` (adjust the Base import and classes). Every content file with `wireframe: true` (set by `content-to-md.mjs`) renders there: the site's header and footer, the content unstyled, and a visible "draft layout" note. Collections with their own route (e.g. `src/pages/portfolio/[slug].astro`) use the same switch. When a type gets its styled template, remove `wireframe: true` from its files. If the owner decides at go-live that some pages stay simple, give the wireframe layout a final name and drop its note.

- **Keep the old URL style.** `build.format` decides which files are written, `trailingSlash` how links and dev routes behave:

  | Old URLs look like | `build.format` | `trailingSlash` | Files | Typical CMS |
  |---|---|---|---|---|
  | `/about/` | `'directory'` (default) | `'always'` | `about/index.html` | WordPress |
  | `/kontakt` (and language homes `/en/`) | `'preserve'` | `'ignore'` | `kontakt.html`, `en/index.html` | TYPO3, Joomla, Drupal |
  | `/about.html` | `'file'` | `'never'` | `about.html` | static HTML |

  Cloudflare and Netlify serve `kontakt.html` at `/kontakt`; check one URL of each kind on the preview. The pending-pages build step detects the style by itself.
- **One page, several URLs** (a news article under each of its categories, old and new slugs): keep one main entry, list the other paths in frontmatter (`aliases: ["/news/press/details/x"]`) and generate them in the catch-all route as the same page with `<link rel="canonical">` to the main URL. That keeps old links working in the preview; at go-live, turn them into 301 redirects on the host (hosting.md) if the host supports it.
- Designed pages (`index.astro`, `about.astro`) win over the catch-all; exclude their content files from it (`isFrontPage`, or a list) to avoid duplicate routes.
- Raw files render as wireframes (above); only paths without any content file get placeholders (section 7).

## 7. Pages not migrated yet: relative links and placeholder pages; status page

> The migration kit (`scripts/install-kit.mjs`, documented in `src/migration/KIT.md` after installing) implements this section. Read it to understand the behaviour or to debug; don't rebuild it by hand.

Internal links are always relative (`/about/`), in templates, data files and Markdown, from the first page on. Never point them at the old domain: the preview would keep jumping to the old site and nobody could click through it.

During the migration many link targets don't exist yet. Instead of hand-editing links, copy two templates:

- `assets/templates/pending-pages.mjs` → `integrations/pending-pages.mjs`
- `assets/templates/migration-pending.astro` → `src/pages/migration-pending.astro` (adjust the layout import and classes to the site)

```js
// astro.config.mjs
import pendingPages from './integrations/pending-pages.mjs';
export default defineConfig({
  integrations: [
    sitemap({ filter: (page) => !page.includes('/migration-pending/') }),
    pendingPages({ oldOrigin: 'https://www.example.com' }),
  ],
});
```

After every build it turns leftover absolute links to the old domain into relative ones (files such as images and PDFs stay absolute until downloaded), and creates a placeholder page in the site's layout for every linked page that doesn't exist yet: "This page hasn't been moved yet", with a link to the old version in a new tab. The open list goes to `.migration/pending-pages.txt`. Once a real page exists, its placeholder disappears by itself. Check navigation with `npm run build && npm run preview` (in `astro dev` those links 404). Remove the integration and the template page at go-live, when the list is empty.

**Status page for the owner:** copy `assets/templates/migration-status.astro` to `src/pages/`. It reads `.migration/plan.json` and shows every page with its status at `/migration-status/` in the preview (refresh with `plan.mjs update` before building). Exclude it from the sitemap like the placeholder template; remove it at go-live.

**Search** (if agreed): `references/search.md`.

## 8. Layout, navigation, styles, fonts

- **Tokens** from stage 4 in `src/styles/global.css`, named by role so the palette can change without renaming classes:
  ```css
  @import "tailwindcss";
  @theme {
    --color-brand: #c2410c;      /* accent from styles.json */
    --color-ink: #1f2937;        /* headings */
    --color-muted: #6b7280;      /* body text */
    --font-sans: "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
    --font-display: "Playfair Display", ui-serif, Georgia, serif;
  }
  ```
- **Prose:** `@tailwindcss/typography` (`@plugin "@tailwindcss/typography";`) tuned to the extracted typography, or a small set of `.prose` element styles.
- **Tailwind vs. the old theme's CSS.** Tailwind's base reset (preflight) makes `img`, `svg` and `video` block-level, removes list bullets and margins, and unstyles headings; WordPress themes assume browser defaults. Inline icons then drop onto their own line and lists lose their spacing. Add a small base layer for what the old theme relies on:
  ```css
  @layer base {
    svg, img { display: inline-block; }   /* only if the old theme had inline icons/images */
    .prose ul { list-style: disc; padding-left: 1.25em; }
  }
  ```
  Never reuse old class names that are also Tailwind utilities (`outline`, `list-item`, `hidden`, `block`, `flex`, `grid`, `table`, `container`, `columns`, `contents`, `truncate`, `transform`): Tailwind generates CSS for them and the layout changes silently. Prefix ported component classes (`sc-list-item`) or use Tailwind utilities directly.
- **Viewport-based themes** (sizes in `vw` that switch at breakpoints): don't force them into Tailwind's spacing scale. Write component CSS with the old values per breakpoint (`snapshot.mjs --css-rules "<selector regex>"` dumps the old rules with their media queries) and keep only colours and fonts as `@theme` tokens.
- **Fonts:** self-host via Fontsource (`npm i @fontsource/<family>`, import the used weights in `Base.astro`). Never Google's font CDN (privacy-and-legal.md).
- **Navigation** as data (`src/data/navigation.json`), rendered by `Header.astro`. Mobile menu: `<details>`/`<summary>` or a few lines of script in an Astro `<script>`; no framework needed.
- **Theme effects** (parallax, sticky header, hover overlays): CSS first (`group-hover:`, `position: sticky`), small `<script>` blocks for the rest, always honouring `prefers-reduced-motion`.

## 9. Images and files

**SVG icons and logos are files, never inline markup.** Save each as its own `.svg` in `src/assets/icons/` (logos in `src/assets/`), import it and use it as a component: `import MailIcon from '../assets/icons/mail.svg'` and `<MailIcon class="h-6 w-6" aria-hidden="true" />`. Vite processes and optimises them, Astro renders them inline in the HTML (so `currentColor` and hover colours keep working), each icon exists once, and the agent edits one file instead of searching templates for path data. The same applies to icons copied from a theme, an icon set or the old site (the snapshot's `logo.svg`). For an SVG that is just a picture (no colour from CSS), `<img src={logo.src} alt="…">` is fine too.

Start simple: downloaded files in `public/media/…` (`download-assets.mjs --out public/media`), referenced as `/media/…`. Works immediately and keeps paths predictable for the agent. In content, reference old URLs first and let `--rewrite` produce the new paths: the script makes file names URL-safe (umlauts transliterated), so hand-typed new paths may not match.

**Crops vs. originals:** while images are served unprocessed from `public/`, use the theme's resized copies for layout images (grid tiles, thumbnails; e.g. WordPress `-1000x625` variants) and originals only where a large view needs them (lightbox, full-width hero). Originals in a 27-tile grid make the page several MB heavy.

Later improvement (offer it, don't force it): move images to `src/assets/` and use Astro's `<Image>`/`<Picture>` (or `image()` in the schema) for automatic sizes and modern formats; then originals everywhere are fine.

Every image gets alt text; decorative ones `alt=""`.

## 10. React and shadcn/ui (only when needed)

Add React when a confirmed feature needs browser state that a few lines of script can't handle cleanly (filterable grid, multi-step form, interactive map): `npx astro add react -y`, then islands (`<ProjectGrid client:visible … />`). Everything else stays `.astro`.

shadcn/ui only if the island benefits from its components (dialog, dropdown, tabs, form controls), following shadcn's current Astro guide (`npx shadcn@latest init`, path alias `@/*`). Not for static pages.

## 11. SEO basics, 404, redirects

- `site: 'https://www.example.com'` in astro.config (sitemap, canonical URLs).
- Per page: `<title>`, meta description (from the old `page.json` meta), canonical, Open Graph image, `<html lang>`.
- `src/pages/404.astro` in the site's look.
- Redirects: host-level `public/_redirects` (Cloudflare and Netlify; real 301s) for every old path that changes or disappears. The export's `oldPaths` list is the inventory of old paths, not a redirect list: most stay identical and need nothing. Astro's `redirects` config only produces meta-refresh pages on static hosts; use it only where `_redirects` isn't supported (GitHub Pages).

## 12. Checks and gotchas

- `npm run build` must pass before every commit.
- **Lost spaces before inline tags:** Astro drops a line break between text and a following inline element: `see the</a>⏎(PDF)` renders `the(PDF)`, and `text⏎<em>word</em>` renders `text<em>word`. Keep the space on one line. The same happens between elements emitted by `.map()` or on separate lines (buttons, icons): add `{' '}` or use `gap`. After building: `grep -rEo '[a-z,.:]<(em|strong|a|span|b|i)[ >]' dist | head` (no `;` in the pattern: entities like `&nbsp;<a` are fine).
- **Screenshots of the new site:** from `npm run build && npm run preview -- --host`, not the dev server (no dev toolbar, same output as production). If you must use the dev server, set `devToolbar: { enabled: false }` in astro.config.
- A browser in a container cannot reach `localhost`; use `--host` and the machine's network IP.
- Commit `package-lock.json`; CI uses `npm ci`.
