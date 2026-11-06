# TYPO3, Joomla, Drupal, hosted builders and static HTML

The universal route works for every system: URL list from the sitemap or the crawl (`inventory.mjs`), then content, design and interactions from the rendered pages (`snapshot.mjs --content --styles --interactions`), then `download-assets.mjs`. The sections below add system-specific shortcuts and pitfalls.

**Page-builder and agency layouts:** `snapshot.mjs --content` also saves `raw.html` (the rendered DOM after scrolling). `content.html` keeps text, images and links but drops classes and data attributes; for layouts built from blocks (columns, icon lists, team cards, video embeds with their IDs in data attributes), convert from `raw.html` with a small per-theme mapping, or with `content-to-md.mjs` for the plain parts.

## TYPO3

- **No public content API by default.** Some sites run the headless extension (`EXT:headless`, JSON on `?type=834`) or a custom one; the inventory's plugin list (`typo3:<extension>`) shows extensions seen in the HTML.
- **Sitemap:** the `seo` system extension serves `/sitemap.xml` (often an index with per-type sitemaps such as `?type=1533906435`). If absent, the crawl takes over.
- **Files** live in `/fileadmin/…`; processed images in `/fileadmin/_processed_/…` (resized copies, hashed names). Older sites also serve files from `/uploads/` (TemplaVoilà era: `uploads/tx_templavoila/`, `uploads/_processed_/`) and `/typo3temp/`: collect every file on the old domain, whatever the folder. Prefer the originals: the `<img>` usually points to `_processed_`, the original is often linked from a lightbox (`href` to `/fileadmin/user_upload/…`).
- **Content elements** render as `<div id="c123" class="frame frame-default frame-type-text…">`. Each `frame` is one block; text/image, textpic and bullets map well to Markdown. `frame-type-list` with a plugin inside is an extension (news, forms, events).
- **News (`tx_news`)**: list and detail pages; one collection `news`. Detail pages are often in no sitemap; the inventory finds them by following links from the list pages. One article is often served under each of its categories (`/aktuelles/<category>/details/<slug>`): keep one main URL and list the others as `aliases` in frontmatter (astro-setup.md §6). Dates: read `<time datetime>` (content-to-md does), not the displayed text, whose format differs per language.
- **Consent:** `we_cookie_consent` uses Klaro; `snapshot.mjs --hide-consent` covers it.
- **Forms:** `powermail` or the core form framework (`tx-form`); see incompatibilities.md.
- **Multilingual:** `/en/…` path prefixes (or the legacy `?L=1` parameter). Each language often has its own sitemap; the inventory also adds language versions from `hreflang` links.
- **URLs without trailing slash** (`/kontakt`) are common: use `build.format: 'preserve'` (astro-setup.md §6).
- **Shared hosting:** agencies often run many customer sites on one TYPO3 instance, with all their sitemaps in one `robots.txt`; the inventory only follows the site's own.
- **Backend export (.t3d)** is not useful here.

## Joomla

- Generator meta `Joomla!`; articles under `/index.php/…` or SEF URLs; components in `/components/com_<name>/`.
- Sitemap often from an extension (OSMap, JSitemap): `/sitemap.xml` or `/index.php?option=com_osmap&view=xml…`.
- Joomla 4/5 has a Web Services API (`/api/index.php/v1/content/articles`), but it needs a token; only use it if the owner creates one. Rendered pages are usually enough.

## Drupal

- Signs: `data-drupal-*` attributes, `/sites/default/files/`. Files there; image styles in `/sites/default/files/styles/<style>/public/…` (prefer the original path without `styles/<style>/public/`).
- JSON:API may be enabled (`/jsonapi`): if it answers publicly, nodes come as structured JSON; otherwise use rendered pages.
- Sitemap: `simple_sitemap` or `xmlsitemap` module at `/sitemap.xml`.

## Hosted website builders

| Builder | Export | Approach |
|---|---|---|
| **Squarespace** | Settings → Import & Export → Export: WordPress-format XML for blog posts and basic pages | Posts from the XML (or rendered pages); layout and other pages from rendered pages. Images on `images.squarespace-cdn.com`: download, add `?format=original`. |
| **Wix** | No usable export | Rendered pages only. Content renders via JavaScript: the snapshot script waits for network idle and scrolls, which usually suffices. Images on `static.wixstatic.com`: strip the `/v1/fill/...` transform part to get the original. |
| **Webflow** | CMS collections as CSV (Collections → Export); full code export on paid plans | CSV → content collections; design from rendered pages (or exported CSS for reference). |
| **Jimdo** | No real export | Rendered pages. |
| **Ghost** | Settings → Labs → Export (JSON) and the public Content API (needs a Content API key the owner creates) | Posts from JSON/API, rest rendered. |
| **Shopify** (content pages only) | Admin API needs an app token | Rendered pages; keep the shop on Shopify (incompatibilities.md). |

Check the builder's terms: content belongs to the owner, but template designs from a hosted builder are usually licensed to use on that platform only. A 1:1 visual copy of a *template* may not be allowed off the platform; recommend the "new design, same content" route (new-design.md) and note this when the kick-off choice is an exact copy or a similar look.

## Static HTML or an old custom system

If the site is already plain HTML files (or a custom PHP system without admin), ask for FTP/SFTP access or a zip of the files: that is the most complete source. Otherwise crawl. Convert repeating parts (header, footer, menus) into Astro layouts and page bodies into Markdown.
