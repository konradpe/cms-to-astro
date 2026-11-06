# {{Site name}} website

Static website for {{owner / company}}, built with Astro and Tailwind CSS, hosted on {{host}}. Content is Markdown in `src/content/`; every change goes through git. The site was migrated from {{CMS}} on {{date}}; `.migration/` holds the original data.

The people asking you for changes are usually not developers. Confirm what they want in one sentence, make the change, check it, then tell them in plain words what changed and where to look.

## Migration status (delete this block when the migration is complete)

- Built so far: {{content types / pages}}. Not built yet: {{…}}. Internal links stay relative; for pages not built yet the build creates placeholder pages (`integrations/pending-pages.mjs`, `src/pages/migration-pending.astro`, open list in `.migration/pending-pages.txt`). Never point links at the old domain.
- Files with `needsReview: true` are raw imports, files with `wireframe: true` render in the draft layout: edit their text like any other content when asked, but don't restructure them; tell the owner they are still waiting for clean-up. Status per page: `PLAN.md` (`node <skill-dir>/scripts/plan.mjs report` if the skill is installed), overview in the preview at `/migration-status/`.
- Progress and open decisions: `MIGRATION.md`.

## Commands

| Command | Does |
|---|---|
| `npm install` | Install dependencies (first time, or after package.json changed) |
| `npm run dev -- --host` | Local preview at http://localhost:4321 |
| `npm run build` | Build the site into `dist/`; **must pass before every commit** |
| `npm run preview` | Serve the built site locally |

Node version: see `.nvmrc`.

## Where things live

| What | Where | Notes |
|---|---|---|
| {{Pages}} | `src/content/pages/<path>.md` | URL = `oldUrl` path, or `/<file path>/` |
| {{News / posts}} | `src/content/posts/<slug>.md` | Listed on {{/news/}}, newest first |
| {{Projects}} | `src/content/projects/<slug>.md` | Shown in the grid on the home page |
| Images and files | `public/media/<year>/<month>/…` | Referenced as `/media/…` |
| Menu, footer links | `src/data/navigation.json` | |
| Contact data (address, phone, e-mail) | `src/data/site.json` | Used by templates; migrated page texts may repeat it (see recipe) |
| Text blocks of designed pages | `src/content/sections/<page>/<block>.md` | {{e.g. about/intro.md}}; layout stays in `src/pages/<page>.astro` |
| Colours, fonts | `src/styles/global.css` (shadcn variables in `:root`, `@theme`), fonts in `astro.config.mjs` (`fonts`) | Design; change only when asked |
| Page layout, header, footer | `src/layouts/`, `src/components/` (menu: `src/components/site/SiteNav.tsx`, data in `src/data/navigation.json`) | Design; change only when asked |
| Redirects | `public/_redirects` | One line per old → new path |

Frontmatter fields ({{posts}}), example: `src/content/posts/{{example}}.md`

```yaml
title: "…"            # required
date: 2026-01-31      # required for posts
excerpt: "…"          # one or two sentences, shown in lists
featuredImage: "/media/2026/01/photo.jpg"
categories: ["…"]
draft: false          # true hides the entry without deleting it
```

## Recipes

**Add a {{news item}}**
1. Create `src/content/posts/<short-slug>.md` (lowercase, hyphens) with the fields above.
2. Put images into `public/media/<year>/<month>/` (max ~2000 px wide, JPEG/WebP), reference them as `/media/…`, with alt text.
3. `npm run build`, check the page in the dev server.
4. Publish (see below).

**Change text on a page:** find the page file (search for a sentence from the page), edit, build, publish.

**Replace an image:** add the new file next to the old one (new name), update the reference, keep alt text accurate, remove the old file if nothing else uses it (`grep -r old-name src`).

**Change a page's URL or delete a page:** add a redirect line to `public/_redirects` (`/old/ /new/ 301`) so old links keep working.

**Hide something temporarily:** `draft: true` in its frontmatter.

**Change contact data (phone, address, e-mail):**
1. Change it in `src/data/site.json`.
2. Search for the old value everywhere, in all its spellings, using the value you are replacing (not a fixed pattern): e.g. for a phone number its last digits, so `+43 1 234 56 78` and `01/2345678` are both found: `grep -rn "56 *78" src public`. {{Where it repeats on this site, verified when this file was written: e.g. imprint in all languages, contact page.}} Change every hit and keep each place's format (footer and imprint may write numbers differently).
3. Contact data is the same in every language: change all language versions without asking.
4. Build and check the footer, contact page and imprint. Pages that are still placeholders can't be checked; tell the owner.

{{More recipes for this site's frequent requests.}}

## Publishing

{{Preview first: work on a branch named after the change, push, wait for the preview URL from {{host}}, give it to the owner, merge to `main` only after they say "publish".}}
{{or Direct: commit to `main` after the build passes; {{host}} deploys within a few minutes.}}
{{or, while hosting isn't set up yet: commit locally after the build passes; show the owner the change with `npm run build && npx astro preview --host` (stop it afterwards with `npx astro preview stop`). Nothing is published until hosting is connected.}}

CI runs `npm run build` on every push; a red build never deploys. To undo a change: `git revert <commit>` and push.

Commit messages: short, plain description of the change ("Add news item: summer break"). No tool or AI attribution.

## Rules

- Content edits leave the design alone. Change colours, fonts, layouts or dependencies only when explicitly asked.
- Changing the look ("make it look like <site or theme>"): restyle in place, design values in `src/styles/global.css` first, then the layout and components. Use the `frontend-design` skill for the plan and its check against generic defaults (and `impeccable` critique/polish if installed). Content, routes and data files stay as they are. Another site or Astro theme is a visual model only: never copy in its project (routes, content collections, scripts); that costs many times more and breaks the URLs.
- Never add tracking, chat widgets, embeds from new providers or other third-party scripts without the owner's explicit OK: it affects their privacy policy.
- No passwords, tokens or keys in any file. Secrets belong in the host's or CI's settings.
- Keep old URLs working: every removed or renamed page gets a redirect.
- Every image gets alt text (decorative images: `alt=""`).
- Icons: `<Icon name="lucide:…" />` (astro-icon; brands from `simple-icons:`); the site's own icons and logos are `.svg` files in `src/assets/icons/` (or `src/assets/`). Never paste SVG markup into templates or content.
- Interactive parts use the installed libraries (Base UI via shadcn, PhotoSwipe `Lightbox`, Embla `Carousel`, motion `Motion`); don't hand-build menus, sliders or lightboxes or add other UI libraries without the owner's OK.
- Keep the owner's wording; fix only obvious typos unless asked to edit the text.
- Astro drops a line break between text and a following inline tag: keep `text <em>…</em>` on one line.
{{Languages: the site exists in {{de, en}}. When content changes in one language, ask whether the other(s) need the same change {{or: the owner's standing rule}}; language-independent data (phone numbers, addresses, prices, dates, names) changes everywhere without asking. Never publish machine translation without the owner's OK. UI texts live in `src/i18n/ui.ts`.}}
{{Search: Pagefind indexes everything inside `data-pagefind-body` after `npm run build`. New templates keep that attribute on their main content; new content types may get a filter value (`data-pagefind-filter="type"`).}}
{{Third-party services allowed on this site: {{host, form service, video facade …}}. Anything else needs the owner's OK and an update of the privacy policy and, if it sets cookies, the consent configuration.}}
