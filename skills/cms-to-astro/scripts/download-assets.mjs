#!/usr/bin/env node
// Download images and files from the old site, keep a tidy folder structure, optionally rewrite URLs in content.
// No dependencies; Node >= 22.
//
//   node download-assets.mjs --list media-urls.txt --out public/media [--prefer-original] [--rewrite src]

import { mkdir, writeFile, readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

const HELP = `Usage: node download-assets.mjs --list <file> --out <dir> [options]

  --list <file>        URLs to download: a text file (one per line) or a JSON array
  --out <dir>          Target folder, e.g. public/media or src/assets/media
  --keep-paths         Keep the full original path (wp-content/uploads/2024/03/x.pdf) instead of
                       shortening it; with --out public the files keep their old URLs, so links from
                       other websites or e-mails to PDFs keep working. Default: shortened
                       (public/media/2024/03/x.pdf -> /media/2024/03/x.pdf).
  --prefer-original    For WordPress resized copies (photo-1024x683.jpg) try the original first
  --rewrite <dir>      Replace the old URLs with the new local paths in .md/.mdx/.html/.astro/
                       .json/.ts/.js/.yaml files under this folder
  --web-prefix <path>  URL path the files are served under (default: derived from --out, e.g.
                       public/media -> /media; src/... -> a relative path is not possible,
                       so pass --web-prefix explicitly)
  --map <file>         Where to write the old URL -> local path map (default: .migration/assets-map.json)

File names are made URL-safe: umlauts and accents are transliterated (Groß -> Gross,
Zeichenfläche -> Zeichenflaeche), other characters become "-". Reference old URLs in content and
let --rewrite (or the map) produce the new paths instead of typing new paths by hand.
  --concurrency <n>    Parallel downloads (default: 4)
  --help               Show this help`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIST = opt('list');
const OUT = opt('out');
if (!LIST || !OUT) {
  console.error('Need --list and --out. See --help.');
  process.exit(1);
}
const PREFER_ORIGINAL = args.includes('--prefer-original');
const KEEP_PATHS = args.includes('--keep-paths');
const REWRITE = opt('rewrite');
const MAP = opt('map', '.migration/assets-map.json');
const CONCURRENCY = Number(opt('concurrency', 4));
const norm = OUT.split(path.sep).join('/');
const WEB_PREFIX = opt('web-prefix', /(^|\/)public\/?$/.test(norm) ? '' : norm.includes('public/') ? '/' + norm.split('public/').pop().replace(/\/$/, '') : '/' + path.basename(OUT));
const UA = 'Mozilla/5.0 (compatible; asset-download/0.1; static-migration)';

const raw = await readFile(LIST, 'utf8');
const urls = [...new Set((raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split('\n')).map((u) => String(u).trim()).filter((u) => /^https?:\/\//.test(u)))];

const TRANSLIT = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
const safeName = (seg) =>
  seg.normalize('NFC').replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/gi, '-');
const localRel = (u) => {
  let p = new URL(u).pathname;
  try { p = decodeURIComponent(p); } catch {}
  const m = KEEP_PATHS ? null : p.match(/\/(?:wp-content\/uploads|fileadmin|sites\/default\/files|images|media|assets)\/(.+)$/i);
  return (m ? m[1] : p.replace(/^\/+/, '')).split('/').map(KEEP_PATHS ? (seg) => seg : safeName).join('/');
};
// Same file name in the other Unicode normalization (macOS uploads often use decomposed "a" + "¨").
const otherNormalization = (u) => {
  const x = new URL(u);
  let p;
  try { p = decodeURIComponent(x.pathname); } catch { return null; }
  const alt = p.normalize('NFC') === p ? p.normalize('NFD') : p.normalize('NFC');
  if (alt === p) return null;
  x.pathname = alt.split('/').map(encodeURIComponent).join('/');
  return x.toString();
};
const originalOf = (u) => u.replace(/-\d+x\d+(\.[a-z0-9]+)(\?.*)?$/i, '$1');

async function exists(f) {
  try {
    return (await stat(f)).size > 0;
  } catch {
    return false;
  }
}
async function download(u) {
  let res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (res.status === 404 && otherNormalization(u)) res = await fetch(otherNormalization(u), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const map = {};
const failed = [];
const tooBig = [];
const LIMIT_MIB = 25; // Cloudflare's per-file limit; other hosts have similar ones
let done = 0, skipped = 0, originals = 0;
let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      let source = url;
      if (PREFER_ORIGINAL && originalOf(url) !== url) source = originalOf(url);
      let rel = localRel(source);
      let file = path.join(OUT, rel);
      try {
        if (await exists(file)) skipped++;
        else {
          let buf;
          try {
            buf = await download(source);
            if (source !== url) originals++;
          } catch (e) {
            if (source === url) throw e;
            source = url; // original not available, fall back to the listed URL
            rel = localRel(url);
            file = path.join(OUT, rel);
            buf = await download(url);
          }
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, buf);
          done++;
          if (buf.length > LIMIT_MIB * 1048576) tooBig.push({ url, mb: +(buf.length / 1048576).toFixed(1) });
        }
        map[url] = `${WEB_PREFIX}/${rel}`;
        if (source !== url) map[source] = map[url];
      } catch (e) {
        failed.push({ url, error: String(e.message || e) });
      }
    }
  }),
);

await mkdir(path.dirname(MAP), { recursive: true });
await writeFile(MAP, JSON.stringify(map, null, 2));
console.log(`Downloaded ${done}, already present ${skipped}, originals used ${originals}, failed ${failed.length}. Map: ${MAP}`);
for (const f of failed.slice(0, 20)) console.log(`  ✗ ${f.url}: ${f.error}`);
if (tooBig.length) {
  console.log(`${tooBig.length} file(s) over ${LIMIT_MIB} MiB, too big for Cloudflare (and heavy in git): compress them, host them elsewhere, or link to the old location until go-live:`);
  for (const f of tooBig) console.log(`  ! ${f.url} (${f.mb} MB)`);
}

if (REWRITE) {
  // Variants: http/https and with/without www, longest URLs first so prefixes don't clobber.
  const variants = [];
  for (const [u, local] of Object.entries(map)) {
    const x = new URL(u);
    const hosts = [x.host, x.host.startsWith('www.') ? x.host.slice(4) : `www.${x.host}`];
    const paths = [...new Set([`${x.pathname}${x.search}`, (() => { try { return decodeURI(`${x.pathname}${x.search}`); } catch { return null; } })()].filter(Boolean))];
    for (const proto of ['https:', 'http:']) for (const h of hosts) for (const p of paths) variants.push([`${proto}//${h}${p}`, local]);
  }
  variants.sort((a, b) => b[0].length - a[0].length);
  const exts = new Set(['.md', '.mdx', '.html', '.astro', '.json', '.ts', '.js', '.yaml', '.yml']);
  let changedFiles = 0, replacements = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', '.astro'].includes(entry.name)) await walk(full);
      } else if (exts.has(path.extname(entry.name))) {
        let text = await readFile(full, 'utf8');
        let n = 0;
        for (const [from, to] of variants) {
          if (text.includes(from)) {
            n += text.split(from).length - 1;
            text = text.split(from).join(to);
          }
        }
        if (n) {
          await writeFile(full, text);
          changedFiles++;
          replacements += n;
        }
      }
    }
  }
  await walk(REWRITE);
  console.log(`Rewrote ${replacements} URL(s) in ${changedFiles} file(s) under ${REWRITE}.`);
}
