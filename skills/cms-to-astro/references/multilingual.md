# Multilingual sites

Languages are where migrations silently lose content: a translation plugin may hold texts that no sitemap lists, or the "English version" may be machine translation generated on the fly that doesn't exist anywhere as text. Find out exactly what exists before planning.

## Contents
1. Detect what kind of multilingual site it is
2. Decide with the owner
3. Extract content per language
4. Build it in Astro
5. SEO: hreflang, sitemap, redirects
6. Maintenance rules for the agent

## 1. Detect what kind of multilingual site it is

Signals (the inventory lists hreflang alternates, language prefixes and translation plugins; confirm by clicking the language switcher on the live site):

| Signal | Where |
|---|---|
| `<html lang="…">` | every page; differs per language version |
| `<link rel="alternate" hreflang="en" href="…">` | `<head>`; the cleanest map of which page translates which |
| `xhtml:link rel="alternate" hreflang` | in the sitemap (Yoast, WPML, TYPO3 seo) |
| Language switcher links | header/footer |
| URL pattern | `/en/…` prefix, subdomain `en.example.com`, separate domains `example.de` / `example.com`, query `?lang=en` or TYPO3's legacy `?L=1` |
| Plugin / system | WPML, Polylang, TranslatePress, Weglot, GTranslate (WordPress); TYPO3 site languages; Joomla language filter; Drupal content translation |

Classify the site; each type migrates differently:

| Type | What it means | Migration |
|---|---|---|
| **A · Translated site** (WPML, Polylang, TYPO3 languages, separate pages per language) | Each language version is stored content | Extract every language; keep the URL scheme |
| **B · Translation service** (Weglot, TranslatePress automatic mode, Lokalise-like SaaS) | Translations live at the service (Weglot) or in plugin tables, partly machine-made | Rendered pages per language are the only easy source; ask whether translations were reviewed or are machine output |
| **C · Live machine translation** (GTranslate free, Google Translate widget) | No stored translations at all; the browser translates on the fly | Nothing to migrate. Decide: drop it, or produce reviewed translations as a separate task |
| **D · Bilingual content on one page** (e.g. German and English paragraphs side by side) | One page, two languages, no i18n routing | Migrate as is; no language routing. Mark language changes in HTML (`<p lang="en">`) for screen readers |
| **E · Partial** | Only some pages exist in a second language | Agree what happens on the missing ones: hide the switcher link, or link to the default-language page |

Count pages per language (from hreflang clusters or URL prefixes) and list pages that exist in only one language.

**Wrong `lang` attribute.** The inventory compares each page's `lang` with its text (stop-word check). A site marked `de` but written in English (a common theme default) is a single-language English site: set `lang="en"` in the new site. It matters for screen readers, search engines and the search index (word stemming follows `lang`).

## 2. Decide with the owner

Ask in plain words, one at a time, with a recommendation:

1. **Which languages stay?** Recommend keeping only languages someone maintains. A language nobody updates becomes outdated quickly and confuses visitors.
2. **Machine-translated languages** (type B/C): keep, drop, or have them reviewed? Recommend not migrating unreviewed machine translation as if it were finished text; if kept, mark it in MIGRATION.md.
3. **URLs:** keep the old scheme (prefixes, default language with or without prefix). Recommend keeping it: no redirects, no lost search ranking.
4. **Later edits:** when the owner changes German text, should the agent update English too (and how: owner provides text, or agent drafts a translation for review)? Write the answer into AGENTS.md.

Record decisions in MIGRATION.md (Decisions → Languages).

## 3. Extract content per language

- **Rendered pages** work for every type: run `snapshot.mjs --content` on each language's URLs (from the language's sitemap, hreflang alternates or the switcher). Store `page.json` meta per language (titles and descriptions are translated too).
- **WordPress REST:** with Polylang or WPML, the API may accept a language parameter (try `/wp-json/wp/v2/pages?lang=en`) or expose a `lang` field; if the results don't differ per language, use rendered pages. Export each language into its own folder (`--out src/content/en`, …) only when the API clearly separates them.
- **Pairing translations:** `content-to-md.mjs` sets the same `translationKey` on all versions of a page from its hreflang alternates (the path of the `x-default` or unprefixed version); the inventory and PLAN.md put the translations of a page type into one group. Pages without alternates get no key: give them their own, or pair them by hand where the switcher links them.
- **UI strings** (menu labels, "Read more", footer texts, form labels, cookie notices, date formats) are not page content: collect them per language from the rendered pages into a small dictionary.

## 4. Build it in Astro

Configuration (default language without prefix, as many sites do):

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://www.example.com',
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
```

Match the old site: set `prefixDefaultLocale: true` if the old default language had `/de/`. Separate domains per language need a domain mapping; check Astro's current i18n docs (`domains` option) or deploy one build per domain.

Content layout:

```
src/content/pages/de/ueber-uns.md     lang: de, translationKey: about
src/content/pages/en/about.md         lang: en, translationKey: about
src/i18n/ui.ts                        UI strings per language + a t() helper
```

Schema additions: `lang: z.enum(['de', 'en'])`, `translationKey: z.string()`.

Templates:
- `<html lang={lang}>` from the entry, never hard-coded.
- **Language switcher** links to the entry with the same `translationKey` in the other language; if there is none, to that language's home page (or hide the link, as agreed).
- **Dates and numbers** via `Intl.DateTimeFormat(lang)` / `Intl.NumberFormat(lang)`.
- **Navigation** per language in `src/data/navigation.<lang>.json`.
- A **404 page** per language if the old site had them.
- RSS feeds per language if blogs exist in several languages.

## 5. SEO: hreflang, sitemap, redirects

- In `<head>` of every translated page: `<link rel="alternate" hreflang="<lang>" href="<absolute URL>">` for each existing translation, plus `x-default` (usually the default-language version).
- `@astrojs/sitemap` supports i18n alternates (its `i18n` option); enable it with the same locales.
- Old query-based URLs (`?lang=en`, `?L=1`) need redirects to the new paths; query-string redirects need host support (Cloudflare `_redirects` matches paths, not queries: use a small Worker rule or Cloudflare Redirect Rules, or keep a JavaScript fallback on the target page). Note this in MIGRATION.md if it applies.

## 6. Maintenance rules for the agent (copy into AGENTS.md)

- Each content change: ask whether the other language(s) need the same change, unless AGENTS.md states the owner's standing answer.
- Never publish machine translation as final text without the owner's OK; if the owner wants a draft translation, mark it (`translationStatus: draft`) and tell them.
- New pages: create all language versions with the same `translationKey`, or record which language is missing.
- UI strings live in `src/i18n/ui.ts`; never hard-code text in components.
