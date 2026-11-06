#!/usr/bin/env node
// Turn rendered pages captured with `snapshot.mjs --content` into Markdown content files.
// Deterministic and cheap: use it instead of converting pages by hand (or by a model).
//
//   New files, one per URL:
//     node content-to-md.mjs --snapshots .migration/snapshots/live --urls-file .migration/urls-portfolio.txt --out src/content/portfolio
//   Fill empty bodies of existing files (e.g. page-builder pages from wp-export, matched by oldUrl):
//     node content-to-md.mjs --snapshots .migration/snapshots/live --fill src/content/pages

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage:
  node content-to-md.mjs --snapshots <dir> --urls-file <file> --out <dir> [options]
  node content-to-md.mjs --snapshots <dir> --fill <content-dir>

  --snapshots <dir>    Output folder of snapshot.mjs --content (one subfolder per page)
  --urls-file <file>   URLs to convert (one per line), e.g. .migration/urls-portfolio.txt
  --out <dir>          Where to write new .md files. The file path mirrors the URL path, minus the
                       folder all URLs of the list share (/projects/a/ and /projects/b/ -> a.md, b.md;
                       /about/ and /en/about/ -> about.md, en/about.md; / -> index.md). A language
                       prefix is never stripped. Two URLs that would land in the same file are
                       reported and the second is skipped.
  --full-paths         Mirror the complete URL path (no shared folder stripped)
  --fill <dir>         Instead: fill .md files under <dir> whose body is empty or that are marked
                       needsReview, using the snapshot of their oldUrl
  --site-name <text>   Suffix to strip from page titles ("About – Example Ltd" -> "About");
                       default: detected from the most common title suffix
  --no-wireframe       Don't add "wireframe: true" (by default converted pages render in the
                       wireframe layout until their type gets a styled template)
  --overwrite          Overwrite existing files (default: skip them; a file that belongs to a
                       different oldUrl is reported as a collision)

Frontmatter: title, description, featuredImage, oldUrl, lang, translationKey (pages with hreflang
alternates: the path of the x-default or unprefixed version, the same for all translations), date
(if the page states one), wireframe, needsReview. Text the old page shows outside its main content
(hero, badges) and numbers its scripts compute (counters) are added as HTML comments for review.
  --help               Show this help

Needs turndown (in .migration/tools or the project). Prints one line per page and a summary.`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SNAP = opt('snapshots');
const FILL = opt('fill');
const OUT = opt('out');
const URLS = opt('urls-file');
if (!SNAP || (!FILL && (!OUT || !URLS))) {
  console.error('Need --snapshots plus either --urls-file and --out, or --fill. See --help.');
  process.exit(1);
}
const WIREFRAME = !args.includes('--no-wireframe');
const FULL_PATHS = args.includes('--full-paths');
const OVERWRITE = args.includes('--overwrite');

let TurndownService;
for (const base of [path.join(process.cwd(), '.migration', 'tools'), process.cwd()]) {
  try {
    const mod = await import(pathToFileURL(createRequire(path.join(base, 'package.json')).resolve('turndown')).href);
    TurndownService = mod.default ?? mod;
    break;
  } catch {}
}
if (!TurndownService) {
  console.error('turndown not found. In the project folder run: npm i --prefix .migration/tools turndown');
  process.exit(2);
}
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.keep(['iframe', 'table', 'video', 'audio', 'sup', 'sub']);
td.remove(['script', 'style', 'noscript', 'form', 'button']);

// Same folder naming as snapshot.mjs
const slugFor = (u) => {
  const p = new URL(u).pathname.replace(/\/+$/, '');
  return p ? p.slice(1).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120) : 'home';
};
const LANG_SEG = /^[a-z]{2}([-_][a-z]{2,4})?$/i;
const segsOf = (u) => {
  let p = new URL(u).pathname;
  try { p = decodeURIComponent(p); } catch {}
  return p.split('/').filter(Boolean);
};
const safeSeg = (seg) => seg.normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-').toLowerCase();
// Folder shared by all URLs of the list (their directory parts), never including a language prefix.
const sharedFolder = (urls) => {
  if (FULL_PATHS || !urls.length) return [];
  let common = segsOf(urls[0]).slice(0, -1);
  for (const u of urls.slice(1)) {
    const d = segsOf(u).slice(0, -1);
    let i = 0;
    while (i < common.length && i < d.length && common[i] === d[i]) i++;
    common = common.slice(0, i);
  }
  return common.length && LANG_SEG.test(common[0]) ? [] : common;
};
const fileNameFor = (u, shared) => {
  const rest = segsOf(u).slice(shared.length).map(safeSeg);
  return rest.length ? rest.join('/') : 'index';
};
// Translations share a key: the path of the x-default or unprefixed alternate (else the first, sorted).
const translationKeyOf = (page) => {
  const all = page.meta?.alternates || [];
  const alts = all.filter((a) => a.lang !== 'x-default');
  if (alts.length < 2) return null;
  const pick = all.find((a) => a.lang === 'x-default')?.href || alts.find((a) => !LANG_SEG.test(segsOf(a.href)[0] || ''))?.href || alts.map((a) => a.href).sort()[0];
  return segsOf(pick).join('/') || 'home';
};
const comment = (title, lines) => (lines.length ? `<!-- ${title}\n${lines.map((l) => `  - ${String(l).replace(/--/g, '–')}`).join('\n')}\n-->\n\n` : '');
const yaml = (v) => JSON.stringify(v);
const exists = async (p) => !!(await stat(p).catch(() => null));

async function loadSnapshot(url) {
  const dir = path.join(SNAP, slugFor(url));
  const html = await readFile(path.join(dir, 'content.html'), 'utf8').catch(() => null);
  const page = JSON.parse(await readFile(path.join(dir, 'page.json'), 'utf8').catch(() => 'null'));
  return html && page ? { html, page } : null;
}

// Site-name suffix: the most common " – X" / " | X" / " - X" ending among the titles seen.
async function detectSiteName(urls) {
  if (opt('site-name')) return opt('site-name');
  const counts = new Map();
  for (const u of urls.slice(0, 50)) {
    const s = await loadSnapshot(u);
    const parts = (s?.page?.meta?.title || '').split(/\s[–|—-]\s/);
    if (parts.length > 1) {
      const suffix = parts[parts.length - 1].trim();
      counts.set(suffix, (counts.get(suffix) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function titleOf(page, siteName) {
  const h1 = page.headings?.find((h) => h.startsWith('h1:'))?.slice(3).trim();
  let t = page.meta?.title || h1 || '';
  if (siteName && t.endsWith(siteName)) t = t.slice(0, -siteName.length).replace(/\s[–|—-]\s*$/, '').trim();
  return t || h1 || 'Untitled';
}

function toMarkdown(html) {
  return td.turndown(html).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}

const results = { written: 0, filled: 0, skipped: 0, missing: [], thin: [], collisions: [], outside: 0, computed: 0 };

if (!FILL) {
  const urls = (await readFile(URLS, 'utf8')).split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
  const siteName = await detectSiteName(urls);
  const shared = sharedFolder(urls);
  const claimed = new Map(); // file -> URL, to catch two URLs landing in the same file
  await mkdir(OUT, { recursive: true });
  for (const url of urls) {
    const snap = await loadSnapshot(url);
    if (!snap) {
      results.missing.push(url);
      console.log(`✗ ${url}: no snapshot (run snapshot.mjs --content for it)`);
      continue;
    }
    const file = path.join(OUT, `${fileNameFor(url, shared)}.md`);
    if (claimed.has(file)) {
      results.collisions.push(`${url} and ${claimed.get(file)} -> ${file}`);
      console.log(`✗ COLLISION: ${url} would overwrite ${claimed.get(file)} in ${file}; skipped`);
      continue;
    }
    claimed.set(file, url);
    if (await exists(file)) {
      const owner = (await readFile(file, 'utf8')).match(/oldUrl:\s*"([^"]+)"/)?.[1];
      if (owner && owner !== url) {
        results.collisions.push(`${url} -> ${file} (belongs to ${owner})`);
        console.log(`✗ COLLISION: ${file} already holds ${owner}; ${url} not written${OVERWRITE ? ' (not overwritten either)' : ''}`);
        continue;
      }
      if (!OVERWRITE) {
        results.skipped++;
        continue;
      }
    }
    await mkdir(path.dirname(file), { recursive: true });
    const { html, page } = snap;
    const body = toMarkdown(html);
    // Cover image: og:image, else the largest content image that isn't a logo or icon.
    const firstImage = (page.images || [])
      .filter((i) => i.inContent && i.width >= 300 && !/logo|icon|sprite|placeholder/i.test(i.src))
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const fm = [
      '---',
      `title: ${yaml(titleOf(page, siteName))}`,
      page.meta?.description ? `description: ${yaml(page.meta.description)}` : null,
      page.meta?.ogImage || firstImage ? `featuredImage: ${yaml(page.meta?.ogImage || firstImage.largest || firstImage.src)}` : null,
      `oldUrl: ${yaml(url)}`,
      page.meta?.lang ? `lang: ${yaml(page.meta.lang.slice(0, 2).toLowerCase())}` : null,
      translationKeyOf(page) ? `translationKey: ${yaml(translationKeyOf(page))}` : null,
      page.meta?.published ? `date: ${yaml(page.meta.published.slice(0, 10))}` : null,
      WIREFRAME ? 'wireframe: true' : null,
      'needsReview: true',
      '---',
      '',
    ].filter((l) => l !== null);
    const notes = comment('Shown on the old page outside its main content (hero, badges, intro): build it into the template or the page blocks.', page.textOutsideContent || [])
      + comment('Numbers the old site computes or animates in the browser (counters); not reliable content, ask the owner for the real figures:', (page.computedNumbers || []).map((c) => `${c.shown}${c.changedFrom ? ` (was ${c.changedFrom} a moment earlier)` : ''}${c.inMarkup ? ` (markup says ${c.inMarkup})` : ''}`));
    if (page.textOutsideContent?.length) results.outside++;
    if (page.computedNumbers?.length) results.computed++;
    await writeFile(file, fm.join('\n') + notes + body + '\n');
    results.written++;
    if (body.length < 200) results.thin.push(url);
    console.log(`✓ ${url} -> ${file} (${body.length} chars)`);
  }
} else {
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else if (/\.mdx?$/.test(e.name)) files.push(f);
    }
  };
  await walk(FILL);
  for (const f of files) {
    const s = await readFile(f, 'utf8');
    const m = s.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    if (!m) continue;
    const [, front, bodyNow] = m;
    const needs = /needsReview:\s*true/.test(front) || !bodyNow.trim();
    if (!needs || (bodyNow.trim().length > 200 && !OVERWRITE)) continue;
    const oldUrl = front.match(/oldUrl:\s*"([^"]+)"/)?.[1];
    if (!oldUrl) continue;
    const snap = await loadSnapshot(oldUrl);
    if (!snap) {
      results.missing.push(oldUrl);
      console.log(`✗ ${path.relative(process.cwd(), f)}: no snapshot of ${oldUrl}`);
      continue;
    }
    const body = toMarkdown(snap.html);
    let newFront = front;
    if (WIREFRAME && !/wireframe:/.test(front)) newFront = front.replace(/\n---\n$/, '\nwireframe: true\n---\n');
    await writeFile(f, `${newFront}\n<!-- Body taken from the rendered page; clean it up when this page gets its styled template. -->\n\n${body}\n`);
    results.filled++;
    if (body.length < 200) results.thin.push(oldUrl);
    console.log(`✓ filled ${path.relative(process.cwd(), f)} (${body.length} chars)`);
  }
}

console.log(`\n${results.written} written, ${results.filled} filled, ${results.skipped} skipped (exist, same page), ${results.missing.length} without snapshot, ${results.thin.length} with very little text${results.thin.length ? ` (check: ${results.thin.slice(0, 5).join(', ')})` : ''}.`);
if (results.outside) console.log(`${results.outside} page(s) show text outside their main content (hero, badges): noted as comments; build those pages from the screenshot and raw.html, not from the Markdown alone.`);
if (results.computed) console.log(`${results.computed} page(s) with computed or animated numbers (counters): noted as comments; ask the owner for the real figures.`);
if (results.collisions.length) {
  console.log(`${results.collisions.length} COLLISION(S): different pages would share a file. Use --full-paths or another --out:`);
  for (const c of results.collisions.slice(0, 10)) console.log(`  ✗ ${c}`);
  process.exitCode = 3;
}
