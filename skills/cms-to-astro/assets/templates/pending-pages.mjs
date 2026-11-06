// Astro integration for the migration period: keeps the new site navigable while it is incomplete.
//
// After each build it
//   1. turns absolute <a> links to the old domain (https://www.example.com/about/) into relative ones (/about/),
//      except links to files (images, PDFs), which stay absolute until they are downloaded; <link rel="canonical">
//      and hreflang alternates stay absolute, as they must;
//   2. finds internal links whose target page doesn't exist yet;
//   3. creates a placeholder page for each of them from the built HTML of src/pages/migration-pending.astro
//      (site layout, "not moved yet" message, link to the old version), so browsing never leaves the new site;
//   4. keeps placeholders and the /migration-status/ page out of the site search (removes data-pagefind-body);
//   5. writes the list of placeholder pages to .migration/pending-pages.txt.
// Once a real page exists, its placeholder is simply not generated any more.
// Remove the integration and migration-pending.astro at go-live (the list must be empty by then).
//
//   // astro.config.mjs
//   import pendingPages from './integrations/pending-pages.mjs';
//   export default defineConfig({
//     integrations: [
//       sitemap({ filter: (page) => !page.includes('/migration-pending/') }),
//       pendingPages({ oldOrigin: 'https://www.example.com' }),
//     ],
//   });
//
// Only the build output (dist/) is affected: check navigation with `npm run build && npm run preview`.
// Works with both URL styles: directories (/about/ -> about/index.html, the default) and files
// (/kontakt -> kontakt.html with build.format 'preserve' or 'file'); detected from the build output.

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE_RE = /\.[a-z0-9]{2,5}$/i;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export default function pendingPages({ oldOrigin, templatePath = '/migration-pending/' }) {
  const origin = new URL(oldOrigin);
  const bareHost = origin.hostname.replace(/^www\./, '').replace(/\./g, '\\.');
  const absoluteOld = new RegExp(`(<a\\b[^>]*?\\s)href="https?://(?:www\\.)?${bareHost}(/[^"]*)?"([^>]*>)`, 'g');

  return {
    name: 'pending-pages',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const htmlFiles = [];
        const walk = async (d) => {
          for (const e of await readdir(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) await walk(f);
            else if (f.endsWith('.html')) htmlFiles.push(f);
          }
        };
        await walk(out);

        // Page identity without trailing slash: /about/ and /about are the same page here.
        const key = (p) => (p === '/' ? '/' : p.replace(/\/+$/, ''));
        const pathOf = (f) => {
          const rel = path.relative(out, f).split(path.sep).join('/');
          return rel === 'index.html' ? '/' : '/' + rel.replace(/(\/)?index\.html$/, '').replace(/\.html$/, '');
        };
        const built = new Set(htmlFiles.map((f) => key(pathOf(f))));
        const templateKey = key(templatePath);

        // 1 + 2: internalize old-domain links, collect missing targets
        const missing = new Set();
        let internalized = 0;
        for (const f of htmlFiles) {
          if (key(pathOf(f)) === templateKey) continue;
          const html = await readFile(f, 'utf8');
          let next = html.replace(absoluteOld, (m, prefix, p = '/', rest) => {
            if (FILE_RE.test(p.split(/[?#]/)[0])) return m; // files stay absolute until downloaded
            if (/\sdata-old-site\b/.test(prefix + rest)) return m; // deliberate links to the old site (wireframe note)
            internalized++;
            return `${prefix}href="${p}"${rest}`;
          });
          for (const m of next.matchAll(/<a\b[^>]*?\shref="(\/(?!\/)[^"#?]*)/g)) {
            const p = m[1];
            if (FILE_RE.test(p) || p.startsWith('/_astro/') || key(p) === templateKey) continue;
            if (!built.has(key(p))) missing.add(p);
          }
          if (next !== html) await writeFile(f, next);
        }

        // 3: placeholder pages from the built template
        // Directory output (migration-pending/index.html) or file output (migration-pending.html)
        const dirTemplate = path.join(out, templatePath, 'index.html');
        const fileTemplate = path.join(out, `${templatePath.replace(/^\/|\/$/g, '')}.html`);
        const fileMode = !(await stat(dirTemplate).catch(() => null)) && !!(await stat(fileTemplate).catch(() => null));
        const templateFile = fileMode ? fileTemplate : dirTemplate;
        let template = null;
        try {
          template = await readFile(templateFile, 'utf8');
        } catch {
          logger.warn(`No ${templatePath} page found; placeholders use a minimal page. Add src/pages/migration-pending.astro for the site's layout.`);
        }
        const seenKeys = new Set();
        for (const p of missing) {
          if (seenKeys.has(key(p))) continue;
          seenKeys.add(key(p));
          // /about/ -> about/index.html; /kontakt -> kontakt.html in file mode, else kontakt/index.html
          const segs = p.split('/').filter(Boolean);
          const target = p.endsWith('/') || !fileMode || !segs.length ? path.join(out, ...segs, 'index.html') : path.join(out, ...segs.slice(0, -1), `${segs.at(-1)}.html`);
          if (await stat(target).catch(() => null)) continue;
          const oldUrl = new URL(p, origin).href;
          const html = (template ?? `<!doctype html><meta charset="utf-8"><title>Not moved yet</title><p>This page hasn't been moved yet: <a href="__OLD_URL__" target="_blank" rel="noopener">__PATH__ on the current website</a></p>`)
            .replaceAll('__OLD_URL__', esc(oldUrl))
            .replaceAll('__PATH__', esc(p))
            .replace(/\sdata-pagefind-body(="[^"]*")?/g, '')
            .replace(/<link[^>]+rel="canonical"[^>]*>/g, '') // a placeholder is not the canonical page
            .replace(/<\/head>/, '<meta name="robots" content="noindex"></head>');
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, html);
        }
        if (template) await rm(fileMode ? templateFile : path.dirname(templateFile), { recursive: true, force: true });
        const statusPage = fileMode ? path.join(out, 'migration-status.html') : path.join(out, 'migration-status', 'index.html');
        if (await stat(statusPage).catch(() => null)) {
          await writeFile(statusPage, (await readFile(statusPage, 'utf8')).replace(/\sdata-pagefind-body(="[^"]*")?/g, ''));
        }

        // 4: report
        const report = path.join(process.cwd(), '.migration', 'pending-pages.txt');
        await mkdir(path.dirname(report), { recursive: true });
        await writeFile(report, [...seenKeys].sort().join('\n') + (seenKeys.size ? '\n' : ''));
        logger.info(`${internalized} old-domain link(s) made relative; ${seenKeys.size} placeholder page(s) for pages not moved yet (list: .migration/pending-pages.txt)`);
      },
    },
  };
}
