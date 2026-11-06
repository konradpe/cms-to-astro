// Astro integration for the migration period: keeps the new site navigable while it is incomplete.
//
// After each build it
//   1. turns absolute <a> links to the old domain (https://www.example.com/about/) into relative ones (/about/),
//      except links to files (images, PDFs), which stay absolute until they are downloaded, and links marked
//      data-old-site (the wireframe note, placeholders), which point to the old site on purpose; <link rel="canonical">
//      and hreflang alternates stay absolute, as they must;
//   2. finds internal links whose target page doesn't exist yet;
//   3. creates a placeholder page for each of them from the built template page (site layout, "not moved yet"
//      message, link to the old version), so browsing never leaves the new site. The template of the link's
//      language is used: /migration-pending/ for the default language, /migration-pending/<prefix>/ for links
//      under /<prefix>/ (the kit's src/pages/migration-pending/[...locale].astro builds both; further mappings:
//      localeTemplates: { '/en/': '/some-template/' });
//   4. keeps placeholders and the /migration-status/ page out of the site search (removes data-pagefind-body);
//   5. writes the list of placeholder pages to .migration/pending-pages.txt.
// Once a real page exists, its placeholder is simply not generated any more.
// Remove the integration and the template pages at go-live (the list must be empty by then).
//
//   // astro.config.mjs
//   import pendingPages from './integrations/pending-pages.mjs';
//   integrations: [pendingPages({ oldOrigin: 'https://www.example.com' })]
//
// Only the build output (dist/) is affected: check navigation with `npm run build && npm run preview`.
// Works with every URL style, detected from the build output: directories (/about/ -> about/index.html),
// files without extension (/kontakt -> kontakt.html, build.format 'preserve' or 'file') and .html URLs
// (/about.html, treated as pages, not as files).

import { readdir, readFile, writeFile, mkdir, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isFile = (p) => /\.[a-z0-9]{2,5}$/i.test(p) && !/\.html?$/i.test(p);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const decode = (p) => {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
};
// Page identity: /about/, /about, /about.html and /about/index.html are the same page here.
const key = (p) => decode(p).replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/\/+$/, '') || '/';
const exists = async (f) => !!(await stat(f).catch(() => null));

export default function pendingPages({ oldOrigin, templatePath = '/migration-pending/', localeTemplates = {} }) {
  const origin = new URL(oldOrigin);
  const bareHost = origin.hostname.replace(/^www\./, '').replace(/\./g, '\\.');
  const absoluteOld = new RegExp(`(<a\\b[^>]*?\\s)href="https?://(?:www\\.)?${bareHost}(/[^"]*)?"([^>]*>)`, 'g');
  const templateBase = key(templatePath);

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
        const pathOf = (f) => '/' + path.relative(out, f).split(path.sep).join('/');
        const built = new Set(htmlFiles.map((f) => key(pathOf(f))));

        // Templates: the default one, one per language prefix below it, explicit extra mappings.
        const templates = [];
        for (const f of htmlFiles) {
          const k = key(pathOf(f));
          if (k === templateBase || k.startsWith(`${templateBase}/`)) {
            templates.push({ prefix: `${k.slice(templateBase.length)}/`, file: f, html: await readFile(f, 'utf8') });
          }
        }
        for (const [prefix, tp] of Object.entries(localeTemplates)) {
          const f = htmlFiles.find((h) => key(pathOf(h)) === key(tp));
          if (f) templates.push({ prefix, file: f, html: await readFile(f, 'utf8') });
        }
        templates.sort((a, b) => b.prefix.length - a.prefix.length);
        const templateFiles = new Set(templates.map((t) => t.file));
        const defaultTemplate = templates.find((t) => t.prefix === '/');
        if (!defaultTemplate) {
          logger.warn(`No ${templatePath} page found; placeholders use a minimal page. Add the kit's src/pages/migration-pending/ route.`);
        }
        // build.format 'preserve' / 'file' write extensionless pages as x.html, 'directory' as x/index.html:
        // the template page shows which one; without it, any non-index page (except 404.html) does.
        const isIndexFile = (f) => f.endsWith(`${path.sep}index.html`);
        const fileMode = defaultTemplate
          ? !isIndexFile(defaultTemplate.file)
          : htmlFiles.some((f) => !isIndexFile(f) && !/\/404\.html$/.test(pathOf(f)));

        // 1 + 2: internalize old-domain links, collect missing targets
        const missing = new Map();
        let internalized = 0;
        for (const f of htmlFiles) {
          if (templateFiles.has(f)) continue;
          const html = await readFile(f, 'utf8');
          const next = html.replace(absoluteOld, (m, prefix, p = '/', rest) => {
            if (/\sdata-old-site\b/.test(prefix + rest)) return m; // deliberate link to the old site
            if (isFile(p.split(/[?#]/)[0])) return m; // files stay absolute until downloaded
            internalized++;
            return `${prefix}href="${p}"${rest}`;
          });
          for (const m of next.matchAll(/<a\b[^>]*?\shref="(\/(?!\/)[^"#?]*)/g)) {
            const p = m[1];
            if (isFile(p) || p.startsWith('/_astro/') || key(p).startsWith(templateBase)) continue;
            if (!built.has(key(p)) && !missing.has(key(p))) missing.set(key(p), p);
          }
          if (next !== html) await writeFile(f, next);
        }

        // 3: placeholder pages from the built template of the link's language
        for (const p of missing.values()) {
          const segs = decode(p).split('/').filter(Boolean);
          const last = segs.at(-1) ?? '';
          const target = !segs.length || p.endsWith('/') ? path.join(out, ...segs, 'index.html')
            : /\.html?$/i.test(last) ? path.join(out, ...segs)
            : fileMode ? path.join(out, ...segs.slice(0, -1), `${last}.html`)
            : path.join(out, ...segs, 'index.html');
          if (await exists(target)) continue;
          const template = templates.find((t) => p.startsWith(t.prefix))?.html;
          const html = (template ?? `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Not moved yet</title><p data-migration="pending">This page hasn't been moved yet: <a href="__OLD_URL__" data-old-site target="_blank" rel="noopener">__PATH__ on the current website</a></p>`)
            .replaceAll('__OLD_URL__', esc(new URL(p, origin).href))
            .replaceAll('__PATH__', esc(decode(p)))
            .replace(/\sdata-pagefind-body(="[^"]*")?/g, '')
            .replace(/<link[^>]+(rel="canonical"|hreflang=)[^>]*>/g, ''); // a placeholder is no canonical page
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, /name="robots"/.test(html) ? html : html.replace(/<\/head>/, '<meta name="robots" content="noindex"></head>'));
        }
        for (const f of templateFiles) {
          await rm(f, { force: true });
          // remove now-empty folders (migration-pending/en/ …)
          for (let d = path.dirname(f); d.startsWith(out) && d !== out; d = path.dirname(d)) {
            if (!(await rmdir(d).then(() => true, () => false))) break;
          }
        }

        // 4: status page out of the search index
        for (const f of htmlFiles) {
          if (key(pathOf(f)) !== '/migration-status') continue;
          await writeFile(f, (await readFile(f, 'utf8')).replace(/\sdata-pagefind-body(="[^"]*")?/g, ''));
        }

        // 5: report
        const report = path.join(process.cwd(), '.migration', 'pending-pages.txt');
        await mkdir(path.dirname(report), { recursive: true });
        const list = [...missing.values()].map(decode).sort();
        await writeFile(report, list.join('\n') + (list.length ? '\n' : ''));
        logger.info(`${internalized} old-domain link(s) made relative; ${list.length} placeholder page(s) for pages not moved yet (list: .migration/pending-pages.txt)`);
      },
    },
  };
}
