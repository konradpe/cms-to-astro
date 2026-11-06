# WordPress specifics

## Where the content comes from (best first)

1. **REST API** (`/wp-json/wp/v2/…`, public, no login). `scripts/wp-export.mjs` uses it. Delivers pages, posts, media, categories, tags and custom post types *if* they are registered with `show_in_rest`. Fast and structured.
2. **Rendered pages** (what visitors see). Always complete, including page-builder layouts, widgets, menus and SEO titles. `scripts/snapshot.mjs --content` extracts them. Needed whenever the API body is empty or full of shortcodes.
3. **WXR export** (only with admin access: Tools → Export → All content). XML with everything including drafts, custom post types and post meta. Useful as a backup and for drafts; parsing builder meta is rarely worth it.
4. **Database dump.** Only as a backup before shutdown.

Use 1 for posts and simple pages, 2 for everything the export flags (`needsReview: true` in frontmatter, listed in `.migration/wp-export-report.json`) and for custom types the API doesn't expose (inventory line "Not in the REST API"; their URLs are in `.migration/urls-<type>.txt`).

```bash
node <skill-dir>/scripts/wp-export.mjs https://example.com --out src/content --types pages,posts
node <skill-dir>/scripts/snapshot.mjs --urls-file .migration/urls-portfolio.txt --out .migration/snapshots/live --content --no-screenshots
```

## Typical findings and what to do

| Finding | Meaning | Action |
|---|---|---|
| Page body in the API is empty or < 80 characters | Content lives in a page builder (post meta), not in `post_content` | Take content from the rendered page; rebuild the layout as components |
| `[vc_row]`, `[et_pb_section]`, `[gdlr_core…]`, `[fusion_…]` in the body | Builder shortcodes | Same as above |
| `[gallery ids="…"]`, `[caption]`, `[embed]`, `[contact-form-7 id="…"]` | Core or plugin shortcodes | gallery → image grid component; caption → `<figure>`; embed → video facade; forms → see incompatibilities.md |
| `wp-block-*` classes (Gutenberg) | Block editor content, usually clean HTML | Turndown handles most; columns, buttons, cover and gallery blocks may need components |
| Custom type in sitemap but `/wp-json/wp/v2/<type>` returns 404/401 | Type not exposed to the API | Rendered pages; one collection per type |
| `media` total in the hundreds | The library includes unused uploads and all resized copies | Download only what the content references (`media-urls.txt` plus images from `page.json` of snapshotted pages) |
| Image names ending `-1024x683.jpg` | WordPress resized copy | `download-assets.mjs --prefer-original` fetches the original when it exists |
| Yoast / Rank Math | SEO titles and descriptions | Taken from the rendered `<head>` (`page.json` → meta); store as `seoTitle`/`description` frontmatter |
| Front page (`isFrontPage: true`, `report.frontPage`) | WordPress's static front page; often still named after the theme demo (e.g. "homepage-business") | Build `src/pages/index.astro` as a template; use the file only as a content source; exclude it from catch-all routes |
| Theme demo content (team members with "Lorem"/"A wonderful serenity…" text, sample projects) | Imported with the theme, never replaced | List it in the report; migrate only what the owner confirms |
| `__trashed` in a URL | A trashed item that is still published or was restored with the trash suffix | Ask the owner; give it a clean slug and a redirect if it is real content |

## Files that must keep their URL

PDFs and other downloads are often linked from other websites, newsletters and e-mails. Download them with `download-assets.mjs --keep-paths --out public` so they stay at `/wp-content/uploads/…`; images used only on the site itself can move to the shorter `/media/…` paths.

## Menus

The public API doesn't expose menus. Take the navigation from the rendered header (`page.json` → `nav`), check it against the screenshot (dropdowns: `interactions-*.json` → submenus) and store it as data (`src/data/navigation.ts` or a JSON file) so the agent can edit it later.

## URLs: keep them

Search engines and external links know the old URLs. Keep the same paths where reasonable, including dated post URLs (`/2021/07/29/slug/`): build routes that produce exactly `oldUrl`'s path from the frontmatter. The report's `oldPaths` lists every exported item's old path; paths that stay the same need nothing. Redirects are only for paths that change or disappear (renamed slugs, `?p=123` links, attachment pages, dropped archives, demo content): collect those while building and write them into `public/_redirects` (hosting.md). Keep the trailing-slash style of the old site.

## Private content

Drafts, private pages and password-protected posts are not in the public API. If the owner wants them: they export a WXR file from the admin themselves, or create an *application password* (Users → Profile → Application Passwords) for read access, which they revoke afterwards. Never ask for their admin password.

## Comments

Approved comments are public at `/wp-json/wp/v2/comments?post=<id>`. Only export them if the owner wants them kept as static text.

## Before the old site goes away

Recommend a full backup (files and database) through their host or a backup plugin, kept somewhere safe. Then put the old installation into maintenance/read-only for a few weeks after go-live, and finally remove it from the server: an abandoned WordPress is a security risk.
