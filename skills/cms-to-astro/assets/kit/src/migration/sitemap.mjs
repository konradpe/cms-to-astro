// Options for @astrojs/sitemap that follow what each built page says about itself, instead of a
// second list of rules:
//   - left out: noindex pages, pages whose canonical is another URL (aliases), 404 pages, /migration-*;
//   - the URL is the page's own canonical (the old URL form, e.g. /about.html in file style);
//   - alternates (xhtml:link) come from the page's hreflang links (slugs may be translated, so
//     the integration's path-prefix i18n option can't pair them).
//
//   import sitemap from '@astrojs/sitemap';
//   import { sitemapOptions } from './src/migration/sitemap.mjs';
//   integrations: [sitemap(sitemapOptions())]
//
// Reads dist/ in the sitemap's build:done hook; pass { outDir } if astro.config sets another outDir.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_PAGE = /^\/migration-(pending|status)(\/|\.html|$)/;
const NOT_FOUND = /(^|\/)404(\/|\.html)?$/;

/** Same identity as keyOf() in urls.ts: /about/, /about and /about.html are one page. */
function keyOf(p) {
  let x = p.split(/[?#]/)[0];
  try {
    x = decodeURI(x);
  } catch {}
  x = x.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/+$/, '');
  return x || '/';
}

export function sitemapOptions({ outDir = 'dist' } = {}) {
  const dist = path.resolve(outDir);
  const builtHtml = (pageUrl) => {
    const p = decodeURI(new URL(pageUrl).pathname).replace(/^\//, '');
    const candidates = p === '' || p.endsWith('/') ? [`${p}index.html`] : p.endsWith('.html') ? [p] : [`${p}.html`, `${p}/index.html`];
    for (const c of candidates) {
      try {
        return readFileSync(path.join(dist, c), 'utf8');
      } catch {}
    }
    return '';
  };
  const canonicalOf = (html) => html.match(/<link\s[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];

  return {
    filter(page) {
      const pathname = new URL(page).pathname;
      if (MIGRATION_PAGE.test(pathname) || NOT_FOUND.test(pathname)) return false;
      const html = builtHtml(page);
      if (/<meta\s[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)) return false;
      const canonical = canonicalOf(html);
      return !canonical || keyOf(new URL(canonical).pathname) === keyOf(pathname);
    },
    serialize(item) {
      const html = builtHtml(item.url);
      const canonical = canonicalOf(html);
      const links = [...html.matchAll(/<link\s[^>]*rel="alternate"[^>]*>/g)].flatMap(([tag]) => {
        const lang = tag.match(/hreflang="([^"]+)"/)?.[1];
        const url = tag.match(/href="([^"]+)"/)?.[1];
        return lang && url ? [{ lang, url }] : [];
      });
      return { ...item, ...(canonical && { url: canonical }), ...(links.length && { links }) };
    },
  };
}
