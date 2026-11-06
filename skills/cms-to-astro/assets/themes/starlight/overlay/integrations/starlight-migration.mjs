// Astro integration of the Starlight recipe (migration kit). Runs once the pages are written
// (astro:build:generated), before the sitemap, Starlight's Pagefind index and pending-pages run:
//
//   1. Deletes Starlight's fallback copies. Starlight repeats every default-language page under each
//      other language prefix where that language has no page with the same path (/kontakt again as
//      /en/kontakt, German text, "not translated yet" note). With translated slugs these are
//      duplicates of real pages (/en/contact), and the old site never had those URLs. The route
//      middleware (src/migration/starlight/route-data.ts) marks them with
//      <meta name="migration" content="fallback">, keeps them out of the sidebar and the search.
//   2. build.format 'preserve' only (old URLs like /kontakt and /en/): Starlight's route writes /en/
//      as en.html. A page whose canonical URL (= its old URL) ends with "/" is moved to en/index.html.
//
// withoutRemovedPages(options) wraps the sitemap options so the deleted pages and the language
// placeholder templates (/en/migration-pending) stay out of sitemap.xml:
//
//   import starlightMigration, { withoutRemovedPages } from './integrations/starlight-migration.mjs';
//   integrations: [starlight({...}), sitemap(withoutRemovedPages(sitemapOptions())), starlightMigration(), ...]

import { mkdir, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const decode = (p) => {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
};
/** Same page identity as the kit: /en/, /en, /en.html and /en/index.html are one page. */
const key = (p) => decode(p).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/+$/, '') || '/';
const exists = async (f) => !!(await stat(f).catch(() => null));
const FALLBACK = /<meta\s+name="migration"\s+content="fallback"/;
const LOCALE_TEMPLATE = /^\/[^/]+\/migration-pending(\/|\.html)?$/;

/** Keys of the pages deleted after the build (filled in astro:build:generated, read by the sitemap filter). */
const removed = new Set();

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(f)));
    else if (e.name.endsWith('.html')) out.push(f);
  }
  return out;
}

export default function starlightMigration() {
  let format = 'directory';
  return {
    name: 'starlight-migration',
    hooks: {
      'astro:config:done': ({ config }) => {
        format = config.build.format;
      },
      'astro:build:generated': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        let deleted = 0;
        let moved = 0;
        for (const file of await htmlFiles(out)) {
          const rel = '/' + path.relative(out, file).split(path.sep).join('/');
          const html = await readFile(file, 'utf8');
          if (FALLBACK.test(html)) {
            await rm(file);
            for (let d = path.dirname(file); d.startsWith(out) && d !== out; d = path.dirname(d)) {
              if (!(await rmdir(d).then(() => true, () => false))) break; // only empty folders
            }
            removed.add(key(rel));
            deleted++;
            continue;
          }
          if (format !== 'preserve' || rel.endsWith('/index.html') || /\/404\.html$/.test(rel)) continue;
          const tag = html.match(/<link\s[^>]*rel="canonical"[^>]*>/)?.[0];
          const canonical = tag?.match(/href="([^"]+)"/)?.[1];
          if (!canonical) continue;
          const canonicalPath = new URL(canonical).pathname;
          if (!canonicalPath.endsWith('/') || key(canonicalPath) !== key(rel)) continue;
          const target = path.join(file.slice(0, -'.html'.length), 'index.html');
          if (await exists(target)) {
            logger.warn(`${rel}: ${path.relative(out, target)} exists already; left as it is.`);
            continue;
          }
          await mkdir(path.dirname(target), { recursive: true });
          await rename(file, target);
          moved++;
        }
        if (deleted) logger.info(`${deleted} Starlight fallback page(s) deleted (default-language copies under other language prefixes)`);
        if (moved) logger.info(`${moved} directory page(s) moved to <path>/index.html (old URLs ending in /)`);
      },
    },
  };
}

/** Sitemap options without the deleted fallback pages and the language placeholder templates. */
export function withoutRemovedPages(options = {}) {
  return {
    ...options,
    filter(page) {
      const pathname = new URL(page).pathname;
      if (removed.has(key(pathname)) || LOCALE_TEMPLATE.test(decode(pathname))) return false;
      return options.filter ? options.filter(page) : true;
    },
  };
}
