# Migration kit

Theme-independent plumbing for a migrated site: every content entry served at its old URL, languages with translated slugs, head tags, wireframes, placeholders for pages not moved yet, a status page and a sitemap filter. It drops into a plain Astro 7 scaffold or a third-party theme; a theme plugs in through three integration points in `src/migration/theme/index.ts`. Dependencies: `astro`, `@astrojs/sitemap`.

Install (from the project folder):

```bash
node <skill-dir>/scripts/install-kit.mjs --old-origin https://www.example.com --locales de,en --url-style preserve
```

It copies the files without overwriting (lists what it skipped), writes `src/migration/site.config.ts`, and prints the `astro.config.mjs` lines and packages. This file lands in `src/migration/KIT.md`.

## Files

| File | Does |
|---|---|
| `src/migration/site.config.ts` | **The only file to edit:** old origin, site name, locales (default first), default-locale prefix, URL style, routed collections |
| `src/migration/urls.ts` | URL rules (pure): key of a path, href in the site's URL style, locale of a path, locale homes, route params |
| `src/migration/content.ts` | Entries: route, href, locale, title, translations (`translationKey`), aliases, `entryAt(path)`, `getEntries()`, the catch-all's `staticPaths()` |
| `src/migration/schema.ts` | Lenient fields of migrated content, `migrationCollection(name, extraFields?)` |
| `src/migration/lenient-glob.ts` | `glob()` loader that skips a broken file with a warning instead of failing the build |
| `src/content.config.ts` | `pages` and `news` collections (only copied if the project has none) |
| `src/migration/meta.ts`, `Meta.astro` | `buildMeta()` → `PageMeta`; `<Meta>` renders title, description, canonical, hreflang + x-default, robots, Open Graph |
| `src/migration/EntryView.astro` | Picks the view per entry: `wireframe: true` → Wireframe; `blocks` → blocks (then the body, if any); else the page template |
| `src/migration/Blocks.astro` | Renders `blocks` through the registry |
| `src/migration/blocks/*.astro` | Default blocks: hero, text, image-text, cards, gallery, video, map, contact |
| `src/migration/theme/` | **Integration points** (below): `index.ts`, default `Shell.astro`, default `PageTemplate.astro` |
| `src/migration/strings.ts` | The kit's UI texts (en, de; others fall back to en) |
| `src/migration/markdown.ts` | Small Markdown for block text fields |
| `src/migration/VideoFacade.astro` | Click-to-load script for videos |
| `src/migration/Wireframe.astro`, `PendingNotice.astro`, `NotFound.astro`, `Route.astro` | Draft layout, "not moved yet" notice, 404 content, catch-all dispatcher |
| `src/migration/sitemap.mjs` | `sitemapOptions()` for `@astrojs/sitemap` |
| `src/migration/locale-404.mjs` | Directory style with several languages only: moves `en/404/index.html` to `en/404.html` |
| `src/pages/[...path].astro`, `[...path]/index.astro` | Catch-all: every entry at its old path, alias paths, a "not moved yet" home per language without content, a redirect at `/` when the default language is prefixed. Directory indexes (`/`, `/en/`, `/x/`) go through `index.astro` because `build.format: 'preserve'` writes only index routes as `x/index.html`. Real page files (`src/pages/about.astro`) win; the catch-all leaves their paths out |
| `src/pages/404.astro`, `[...locale]/404.astro` | 404 per language (`404.html`, `en/404.html`) |
| `src/pages/migration-pending/[...locale].astro` | Placeholder template per language (migration only) |
| `src/pages/migration-status.astro` | Status page from `.migration/plan.json` (migration only) |
| `integrations/pending-pages.mjs` | After the build: old-domain links made relative, placeholders for linked pages not moved yet, `.migration/pending-pages.txt` (migration only) |

Markers other tools rely on: `data-migration="wireframe"` (wireframe), `data-migration="pending"` (placeholders, pending homes, status page; `plan.mjs` reads both from `dist/`), `data-old-site` on deliberate links to the old site (pending-pages leaves them absolute).

## Content

Files from `content-to-md.mjs` under `src/content/<collection>/`, URL paths mirrored (`pages/en/services/consulting.md`). Fields: `title`, `description`, `featuredImage`, `oldUrl`, `lang`, `translationKey`, `date`, `wireframe`, `needsReview`, plus `draft`, `order`, `updated`, `excerpt` and unknown fields (kept). The kit adds:

- `aliases: ["/news/press/x"]`: further old paths (or URLs) of the same page; each becomes a page with a canonical link to the main URL, no hreflang, not in the sitemap. At go-live, turn them into host redirects where the host supports it.
- `noindex: true`: robots noindex, left out of the sitemap and of the other languages' hreflang.
- `template: <name>`: picks a page template from the registry (default `page`).
- `blocks: [{ type, …fields }]`: the page is built from blocks.

Route of an entry: the path of `oldUrl`; without one, the file path (`pages/en/x.md` → `/en/x`, other collections get `/<collection>` after the language prefix). Locale: `lang` if it is a site locale (a wrong theme default such as `de` on an English-only site is ignored), else the locale folder, else the URL prefix. Translations: entries with the same `translationKey`; hreflang only when at least two languages exist; x-default = the default language's version. Two files with the same route: the first wins, the other is reported.

A broken file (unreadable YAML, invalid fields) is skipped with a warning; invalid single values are dropped.

**Add a content type** (e.g. projects with a `client` field):

```ts
// src/content.config.ts
import { z } from 'astro/zod';
projects: migrationCollection('projects', { client: z.string().optional() }),
```

and add `'projects'` to `collections` in `site.config.ts`. Its entries are then served at their old URLs like pages; read the extra field as `(entry.data as { client?: string }).client` in its template (the shared entry type only knows the base fields).

**A designed page instead of the catch-all:** create `src/pages/about.astro` (or `index.astro`); the catch-all leaves that path out. Read the content with `const entry = await entryAt('/about')` from `src/migration/content.ts`.

**Add a language:** append the code to `locales` in `site.config.ts`, add a `strings.ts` entry, put the files under `src/content/pages/<code>/`.

## Integration points (`src/migration/theme/index.ts`)

A theme recipe edits this file and adds its own components next to it; no other kit file needs to change.

### 1. `Shell`: the frame of every kit page

Props `{ meta: PageMeta }`, default slot = page content. It must put `lang={meta.lang}` on `<html>`, render `<Meta meta={meta} />` in `<head>` (and keep the theme from rendering its own title, description, canonical or hreflang), and render the slot inside `<main>`. `meta.languages` feeds a language switcher (each language's version of the page, else its home). The default `Shell.astro` is a plain HTML frame.

```astro
---
// src/migration/theme/ThemeShell.astro; in index.ts: export { default as Shell } from './ThemeShell.astro';
import Layout from '../../layouts/Layout.astro'; // the theme's layout
import Meta from '../Meta.astro';
import type { PageMeta } from '../meta';
const { meta } = Astro.props as { meta: PageMeta };
---
<Layout lang={meta.lang} languages={meta.languages}>
  <Meta slot="head" meta={meta} />  <!-- the theme layout needs <slot name="head" /> in its <head> -->
  <slot />
</Layout>
```

### 2. `templates`: styled page templates

`Record<string, Component>`; `page` is the default, frontmatter `template` picks another. Props `{ entry: MigrationEntry; meta: PageMeta; heading: string | false }` (`heading` is false when the body starts with its own `# Heading`), default slot = the rendered Markdown body. Rendered inside the Shell.

```astro
---
// src/migration/theme/ProseTemplate.astro; in index.ts: templates = { page: ProseTemplate }
const { heading } = Astro.props;
---
<article class="prose mx-auto">{heading && <h1>{heading}</h1>}<slot /></article>
```

### 3. `blocks`: block components by `type`

`Record<string, Component>`. Props = the block's frontmatter fields plus `locale` and `index` (0 = first block; the default hero renders `<h1>` there, and a page whose first block isn't a hero gets the title as `<h1>`). Unknown types are skipped with a build warning. Map a type to a theme component through a small adapter:

```astro
---
// src/migration/theme/blocks/Hero.astro; in index.ts: blocks = { ...blocks, hero: Hero }
import ThemeHero from '../../../components/Hero.astro'; // the theme's hero, with its own props
const { heading, text, image } = Astro.props;
---
<ThemeHero title={heading} subtitle={text} image={image} />
```

Default block fields (text fields take the Markdown of `markdown.ts`):

| type | fields |
|---|---|
| `hero` | `heading`, `text?`, `image?`, `alt?`, `actions?: [{ label, href }]` |
| `text` | `heading?`, `text` |
| `image-text` | `heading?`, `text`, `image`, `alt?`, `imageSide?: left \| right` |
| `cards` | `heading?`, `items: [{ title, text?, image?, alt?, href? }]` |
| `gallery` | `heading?`, `items: [{ src, alt?, caption?, full? }]` (each links to `full` or `src`; no lightbox script: wrap it in the skill's `Lightbox` through a block adapter, the skill's references/libraries.md §7) |
| `video` | `url` (YouTube/Vimeo), `title?`, `poster?` (a downloaded image: the provider's thumbnail URL would be a request). Click-to-load: nothing loads from the provider before the click |
| `map` | `heading?`, `address?`, `lat?`, `lng?`, `href?`, `image?` (static link to OpenStreetMap or `href`; no embed) |
| `contact` | `heading?`, `name?`, `address?`, `phone?`, `email?`, `hours?`, `text?` |

A video inside a Markdown body uses the same facade: `<div data-kit-video="https://www.youtube-nocookie.com/embed/<id>" data-kit-video-title="…"><button type="button">Load video from YouTube. This sends data to YouTube.</button></div>`.

## astro.config.mjs

The installer prints these lines with the project's values; `urlStyle` in `site.config.ts` must match.

| `urlStyle` | Old URLs | `build.format` | `trailingSlash` | Files |
|---|---|---|---|---|
| `directory` | `/about/` | `'directory'` | `'always'` | `about/index.html` |
| `preserve` | `/kontakt`, `/en/` | `'preserve'` | `'ignore'` | `kontakt.html`, `en/index.html` |
| `file` | `/about.html` | `'file'` | `'never'` | `about.html` |

```js
// directory style, two languages; for preserve/file take format and trailingSlash from the table and drop locale404
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { sitemapOptions } from './src/migration/sitemap.mjs';
import pendingPages from './integrations/pending-pages.mjs';
import locale404 from './src/migration/locale-404.mjs';

export default defineConfig({
  site: 'https://www.example.com',
  build: { format: 'directory' },
  trailingSlash: 'always',
  integrations: [
    sitemap(sitemapOptions()),
    pendingPages({ oldOrigin: 'https://www.example.com' }), // migration only
    locale404(), // directory style with several languages only
  ],
});
```

Don't enable Astro's `i18n` routing: the kit routes by old paths, and slugs may be translated.

**Limits.** `file` style can't write directory indexes: `/en/` becomes `en.html`, linked as `/en.html`; old links to `/en/` or `/en/index.html` then need host redirects. For `.html` sites with directory indexes, `preserve` is the better choice: it writes `about.html` for `/about.html` and `en/index.html` for `/en/`. Separate domains per language need one build per domain. Query URLs (`?lang=en`, `?id=12`) need host redirects. The catch-all assumes Astro's default `srcDir` (`src`). Placeholders exist only in the build output (`npm run build && npm run preview`), not in `astro dev`.

## Go-live

1. Check: `.migration/pending-pages.txt` empty; no `wireframe: true` and no `needsReview: true` left in `src/content`; every language has a home entry (no "not moved yet" home).
2. Delete `integrations/pending-pages.mjs` and its line in `astro.config.mjs`, `src/pages/migration-pending/`, `src/pages/migration-status.astro`.
3. Optional: delete `src/migration/Wireframe.astro` and the wireframe branch in `EntryView.astro` (or give it a final look if some pages stay simple).
4. `site` in `astro.config.mjs` = the final domain. Aliases and, with a prefixed default language, the redirect at `/` become host redirects where the host supports them (`public/_redirects`).

## Tested

Astro 7.4.7, @astrojs/sitemap 3.7.4, Node 24.18.0: minimal scaffold (`create astro --template minimal`), `install-kit.mjs`, the printed astro.config used verbatim, neutral fixtures on example.com (de + en with translated slugs and translationKeys, a nested page, news with an alias, a wireframe page, a noindex page with a translation, an untranslated page, links to pages not moved yet and to the old domain, a blocks page with all eight blocks and an unknown type, a Markdown video facade, an umlaut path, a file without oldUrl, a file with broken YAML).

- **Builds:** `directory`, `preserve`, `file` × two languages, single language (`en`, one file with a wrong `lang: de`), prefixed default language (`/de/`, `/en/`; directory and preserve). All build; the broken file is skipped with a warning; `astro check`: 0 errors.
- **Checked per build (scripted, 33–113 checks each, all pass):** output file per old URL (`about/index.html`, `kontakt.html` + `en/index.html`, `about.html` + `en.html`); `<html lang>`; canonical (alias → main URL); hreflang only for real translations, x-default, none to/from noindex pages; robots noindex; placeholders per language (right `lang`, noindex, no canonical, `data-old-site` link) and `.migration/pending-pages.txt`; old-domain page links made relative, PDF link kept absolute; templates removed from `dist/`; status page from `plan.json`; `404.html` + `en/404.html` in every style; sitemap with old URL forms (`.html` in file style), alternates, without noindex/alias/404/migration/placeholder pages; `data-migration` markers; no loading attribute (`src`, `srcset`, `poster`, `<link>`, `<iframe>`, CSS `url()`) pointing to another host.
- **Mutation check:** six deliberate breaks (hreflang on untranslated pages, `data-old-site` ignored, sitemap keeping noindex pages, video iframe loaded directly, hreflang to a noindex translation, no index catch-all) are each caught.
- **Dev server** (`astro dev`): every route of all three styles answers, incl. alias, localized 404, both catch-alls.
- **Extension:** a `projects` collection with an extra field, a named template, a custom block type and a page file overriding a catch-all path (`entryAt()`) build and type-check without catch-all conflicts.
- **plan.mjs update** derives `styled` / `wireframe` / `todo` from the built markers (directory, preserve). In file style it can't find `/x.html` pages in `dist/` (its `normPath` adds `/`), so they stay `extracted`: a plan.mjs issue.
- Not tested: a third-party theme, a real host (`kontakt.html` served at `/kontakt`, nested 404 lookup), Windows paths.
