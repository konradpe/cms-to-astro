# Site search

A CMS searches its database on the server. A static site has no server, so search moves to the browser: an index is built from the finished pages at build time and loaded on demand. Pagefind does exactly this, independent of where the content came from (WordPress, TYPO3, anything), with no account and no running costs.

## Contents
1. Decide whether search is needed
2. What the old search covers
3. Build it (template)
4. Languages
5. Check it
6. Alternatives

## 1. Decide whether search is needed

In the stage-2 report, say what exists and recommend:

| Situation | Recommendation |
|---|---|
| Search plugin installed but no visible field or icon (inventory: "installed, no visible use") | Drop it; nothing to rebuild |
| Visible search, small site (under ~30 pages) with clear navigation | Offer to drop it; ask how often visitors use it (if analytics exist) |
| Visible search, larger site, news archive, publications, many projects | Rebuild with Pagefind (default) |
| Search is the core of the site (catalogue, database, filters across thousands of records) | Separate project; Pagefind may still fit, or a hosted search service; don't promise it in a 1:1 migration |

For a 1:1 copy, keep the search trigger's look (icon or field in the header) so the comparison stays fair, even before the search works.

## 2. What the old search covers

Check on the live site: search for a word that appears in a news post, a project and a PDF. Note what comes back: pages only, posts, custom types, PDFs, other languages. WordPress's built-in search covers posts and pages (titles and body), not PDFs and not page-builder content stored outside the body; plugins (Relevanssi, SearchWP, Ivory Search) widen or narrow that. The new search should cover at least what the old one did; usually it covers more, because Pagefind indexes the rendered pages, builder content included.

## 3. Build it (template)

1. `npm i -D pagefind` and in `package.json`: `"postbuild": "pagefind --site dist"` (npm runs it after every `npm run build`, also on the host).
2. Copy `assets/templates/Search.astro` to `src/components/` and `assets/templates/icons/search.svg` to `src/assets/icons/`, and place `<Search />` where the old site had its search (header icon or field). Restyle the trigger to match; the dialog uses neutral classes and the site's tokens.
3. Mark what is indexed: `data-pagefind-body` on `<main>` in the layout (only those parts are indexed; header, footer and menus stay out). The placeholder and status pages carry `data-pagefind-ignore`, and the pending-pages build step removes them from the index.
4. Optional: result filters per content type, by adding `<span data-pagefind-filter="type" hidden>Projects</span>` to a template; better titles with `data-pagefind-meta="title"` on the heading; images in results with `data-pagefind-meta="image[src]"` on the cover image.
5. PDFs aren't indexed by Pagefind. If the old search found PDFs, list the important ones on a downloads page with good titles, which then are searchable.

`astro dev` has no index; the dialog says so. Check with `npm run build && npm run preview`.

**Old search URLs:** the component opens itself with the term when a page is called with `?s=` (WordPress), `?q=`, `?search=` or `?keys=` (Drupal), so `https://example.com/?s=biopsy` keeps working as long as `<Search />` sits in the header of every page. Other patterns (TYPO3 `?tx_indexedsearch_pi2[search][sword]=…`, Joomla `index.php?option=com_search…`) need a redirect rule on the host to `/?q=…`. If the old site announced its search to search engines (`SearchAction` in its structured data, e.g. via Yoast or Rank Math), update that pattern or drop it.

**PDFs:** not indexed by default (WordPress doesn't search them either). If the owner wants them found, extract their text at build time and add custom records with Pagefind's Node API (`addCustomRecord`, URL = the PDF), or list them on a downloads page with good titles.

## 4. Languages

Pagefind builds one index per `<html lang>` and loads the one of the current page, so each language searches its own pages. This needs correct `lang` attributes (multilingual.md). Translate the component's texts via its props (`label`, `placeholder`, `noResults`, `devHint`) from the UI dictionary.

## 5. Check it

- Build output prints the number of indexed pages: it should equal the real content pages (not placeholders). An index of 0 pages means `data-pagefind-body` is missing.
- Smoke test on the preview: open `/?s=<word>` for two or three words you know appear on specific pages and check those pages are in the results (a few lines with Playwright, or by hand with the owner).
- `lang` must be right on every page (the inventory flags mismatches): Pagefind picks its word stemming from it.
- Search for three words from different content types and one from the old site's search test (section 2); results link to the right pages.
- Keyboard: open with Enter/Space on the trigger, type, Tab to results, Esc closes.
- Phone width: the dialog fits the screen.
- Add search to the AGENTS.md rules: new templates keep `data-pagefind-body`; new content types may get a filter value.

## 6. Alternatives

- **No search, good navigation:** often the right call for small sites.
- **Hosted search** (Algolia and similar): for very large sites or advanced ranking; needs an account, a key in the build and usually money. Not the default.
- **Search engine site search** (a link to a web search restricted to the domain): zero effort, but sends visitors away and depends on indexing; acceptable as a stopgap.
