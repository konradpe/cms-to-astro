#!/usr/bin/env node
// Export public WordPress content through the REST API into Markdown files with frontmatter.
// Uses `turndown` from the current project if installed (npm i -D turndown); otherwise keeps HTML bodies.
//
//   node wp-export.mjs https://example.com --out src/content [--types pages,posts]

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node wp-export.mjs <site-url> [options]

  --out <dir>          Content folder; one subfolder per type (default: src/content)
  --types <list>       REST bases to export (default: pages,posts). Custom post types use their
                       rest_base, see inventory.json -> wpApi.types (e.g. portfolio)
  --report <file>      Report with flagged items, old paths and media (default: .migration/wp-export-report.json)
  --media-list <file>  Plain list of all media/file URLs found (default: .migration/media-urls.txt)
  --help               Show this help

Only published, public content is exported (no login). Run from the project folder (turndown is
looked up in .migration/tools, then in the project).`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const site = new URL(args.find((a) => /^https?:\/\//.test(a)));
const OUT = opt('out', 'src/content');
const TYPES = opt('types', 'pages,posts').split(',').map((t) => t.trim()).filter(Boolean);
const REPORT = opt('report', '.migration/wp-export-report.json');
const MEDIA_LIST = opt('media-list', '.migration/media-urls.txt');
const UA = 'Mozilla/5.0 (compatible; wp-export/0.1; static-migration)';

// turndown from the project, if available
let turndown = null;
try {
  let mod;
  for (const base of [path.join(process.cwd(), '.migration', 'tools'), process.cwd()]) {
    try {
      mod = await import(pathToFileURL(createRequire(path.join(base, 'package.json')).resolve('turndown')).href);
      break;
    } catch {}
  }
  if (!mod) throw new Error('turndown not found');
  const TurndownService = mod.default ?? mod;
  turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  turndown.keep(['iframe', 'table', 'video', 'audio', 'figure', 'sup', 'sub']);
  turndown.remove(['script', 'style', 'noscript']);
} catch {
  console.warn('turndown not installed: bodies stay HTML inside the .md files. For Markdown: npm i --prefix .migration/tools turndown');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', eacute: 'é', egrave: 'è', copy: '©', reg: '®', trade: '™', euro: '€' };
const decode = (s = '') =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);
const stripTags = (s = '') => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const yaml = (v) => JSON.stringify(v); // JSON strings/arrays are valid YAML flow scalars

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  return { ok: res.ok, status: res.status, headers: res.headers, data: res.ok ? await res.json() : null };
}

async function fetchAll(restBase) {
  const items = [];
  for (let page = 1; ; page++) {
    const url = new URL(`/wp-json/wp/v2/${restBase}`, site);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_embed', '1');
    const r = await getJson(url);
    if (!r.ok) {
      if (page === 1) console.warn(`  ${restBase}: HTTP ${r.status}, skipped`);
      break;
    }
    items.push(...r.data);
    const totalPages = Number(r.headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return items;
}

const BUILDER_MARKERS = [
  [/\[\/?(vc_|et_pb_|gdlr|fusion_|av_|cs_|fl_builder|elementor)[^\]]*\]/i, 'page-builder shortcodes in the body'],
  [/elementor-widget|et_pb_module|wpb_wrapper|gdlr-core-pbf|fusion-builder/i, 'page-builder markup in the body'],
  [/\[[a-z_-]+(\s[^\]]*)?\]/i, 'shortcodes in the body'],
];

// oldPaths: every exported item's old URL path. Not a redirect list: keep these paths in the new site;
// only paths that change (or pages that are dropped) need a redirect, and those are decided later.
const report = { site: site.toString(), exportedAt: new Date().toISOString(), counts: {}, frontPage: null, needsReview: [], oldPaths: [], media: 0 };
const media = new Set();

for (const restBase of TYPES) {
  process.stdout.write(`${restBase}: `);
  const items = await fetchAll(restBase);
  console.log(`${items.length} item(s)`);
  report.counts[restBase] = items.length;
  const byId = new Map(items.map((i) => [i.id, i]));
  const pathOf = (item) => {
    const parts = [item.slug];
    let p = item.parent;
    for (let guard = 0; p && byId.has(p) && guard < 10; guard++) {
      parts.unshift(byId.get(p).slug);
      p = byId.get(p).parent;
    }
    return parts.join('/');
  };

  for (const item of items) {
    const rendered = item.content?.rendered ?? '';
    const title = decode(item.title?.rendered ?? item.slug);
    const embedded = item._embedded ?? {};
    const featured = embedded['wp:featuredmedia']?.[0]?.source_url ?? null;
    const terms = (embedded['wp:term'] ?? []).flat().filter(Boolean);
    const categories = terms.filter((t) => t.taxonomy === 'category').map((t) => decode(t.name));
    const tags = terms.filter((t) => t.taxonomy === 'post_tag').map((t) => decode(t.name));
    const otherTerms = terms.filter((t) => !['category', 'post_tag'].includes(t.taxonomy)).map((t) => `${t.taxonomy}:${decode(t.name)}`);
    const oldUrl = item.link;
    const oldPath = new URL(oldUrl).pathname;
    const safeDecode = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
    const filePath = path.join(OUT, restBase, `${safeDecode(restBase === 'pages' ? pathOf(item) : item.slug)}.md`);

    // collect media: featured image, <img src/srcset>, linked uploads
    if (featured) media.add(featured);
    for (const m of rendered.matchAll(/<img[^>]+src=["']([^"']+)/gi)) media.add(new URL(m[1], site).toString());
    for (const m of rendered.matchAll(/srcset=["']([^"']+)/gi)) {
      const biggest = m[1].split(',').map((c) => c.trim().split(/\s+/)).sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0];
      if (biggest?.[0]) media.add(new URL(biggest[0], site).toString());
    }
    for (const m of rendered.matchAll(/href=["']([^"']*\/(wp-content\/uploads|fileadmin)\/[^"']+)/gi)) media.add(new URL(m[1], site).toString());

    // flag content the API cannot deliver properly
    const text = stripTags(rendered);
    const reasons = [];
    const isFrontPage = oldPath === '/' || oldPath === '';
    if (isFrontPage) {
      report.frontPage = filePath;
      reasons.push('WordPress front page: build the home page as its own template (src/pages/index.astro); use this file only as a content source and exclude it from catch-all routes');
    }
    if (text.length < 80) reasons.push(`very little text in the API body (${text.length} chars): content probably lives in a page builder; take it from the rendered page`);
    for (const [re, why] of BUILDER_MARKERS) if (re.test(rendered)) { reasons.push(why); break; }
    if (reasons.length) report.needsReview.push({ type: restBase, slug: item.slug, oldUrl, file: filePath, reasons });

    const body = turndown ? turndown.turndown(rendered) : rendered;
    const fm = [
      '---',
      `title: ${yaml(title)}`,
      `slug: ${yaml(item.slug)}`,
      `date: ${yaml(item.date)}`,
      `updated: ${yaml(item.modified)}`,
      item.excerpt?.rendered ? `excerpt: ${yaml(stripTags(item.excerpt.rendered).replace(/\s*\[…\]$|\s*\[&hellip;\]$/, ''))}` : null,
      featured ? `featuredImage: ${yaml(featured)}` : null,
      categories.length ? `categories: ${yaml(categories)}` : null,
      tags.length ? `tags: ${yaml(tags)}` : null,
      otherTerms.length ? `terms: ${yaml(otherTerms)}` : null,
      embedded.author?.[0]?.name ? `author: ${yaml(embedded.author[0].name)}` : null,
      typeof item.menu_order === 'number' && item.menu_order ? `order: ${item.menu_order}` : null,
      `oldUrl: ${yaml(oldUrl)}`,
      `wpId: ${item.id}`,
      isFrontPage ? `isFrontPage: true` : null,
      reasons.length ? `needsReview: true` : null,
      '---',
      '',
    ].filter((l) => l !== null);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, fm.join('\n') + body.trim() + '\n');
    report.oldPaths.push({ oldPath, type: restBase, file: filePath });
  }
}

report.media = media.size;
await mkdir(path.dirname(MEDIA_LIST), { recursive: true });
await mkdir(path.dirname(REPORT), { recursive: true });
await writeFile(MEDIA_LIST, [...media].sort().join('\n') + '\n');
await writeFile(REPORT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${Object.values(report.counts).reduce((a, b) => a + b, 0)} file(s) to ${OUT}/, ${media.size} media URL(s) to ${MEDIA_LIST}, report to ${REPORT}.`);
if (report.needsReview.length) {
  console.log(`${report.needsReview.length} item(s) need review (content not fully available through the API):`);
  for (const n of report.needsReview.slice(0, 15)) console.log(`  - ${n.type}/${n.slug}: ${n.reasons.join('; ')}`);
  if (report.needsReview.length > 15) console.log(`  … see ${REPORT}`);
}
