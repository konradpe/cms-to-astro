#!/usr/bin/env node
// Compare screenshots of the old and the new site: side-by-side images with a difference panel,
// pixel-difference statistics per horizontal band, and an HTML gallery for the owner.
// Uses the browser from the `playwright` package for image processing (no other dependencies).
//
//   node compare.mjs .migration/snapshots/live .migration/snapshots/new --out .migration/comparison

import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node compare.mjs <old-snapshots-dir> <new-snapshots-dir> --out <dir> [options]

Pairs up screenshots with the same page folder and file name (e.g. about/desktop-1440.png) that
snapshot.mjs wrote for the old and the new site.

  --out <dir>          Output folder (default: .migration/comparison)
  --band <px>          Height of the bands for the difference statistics (default: 100)
  --threshold <n>      Per-pixel colour difference (sum of RGB deltas, 0-765) that counts as
                       different (default: 48; raise it to ignore font anti-aliasing)
  --pages <list>       Only these page folders (comma-separated)
  --notes <file>       Known, accepted differences to show in the gallery, one per line:
                       "<page>: <text>" (e.g. "home: the old site's cookie banner; the video starts
                       on click now"). Lines for all pages: "*: <text>"
  --lang <en|de>       Language of the gallery texts (default: en)
  --content-only       For a new design on the same content: no pixel comparison. Shows old and new
                       side by side (where both have screenshots) and checks visible text and links
                       (needs page.json from snapshot.mjs --content on both sides). Pages without
                       screenshots are compared by content only.
  --browser <name>     auto (default) | bundled | chrome | msedge
  --help               Show this help

Writes <page>-<file>-compare.png (old | new | difference in red; old | new with --content-only),
report.json and index.html.
If both sides were captured with snapshot.mjs --content, it also lists visible text and links that
exist only on the old or only on the new site (dropped content, or elements the old site hides).`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const valueFlags = new Set(['--out', '--band', '--threshold', '--pages', '--browser', '--notes', '--lang']);
const [OLD, NEW] = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));
if (!OLD || !NEW) {
  console.error('Need the old and the new snapshot folder. See --help.');
  process.exit(1);
}
const OUT = opt('out', '.migration/comparison');
const CONTENT_ONLY = args.includes('--content-only');
const BAND = Number(opt('band', 100));
const THRESHOLD = Number(opt('threshold', 48));
const ONLY = opt('pages') ? new Set(opt('pages').split(',')) : null;
const NOTES = {};
if (opt('notes')) {
  for (const line of (await readFile(opt('notes'), 'utf8')).split('\n')) {
    const m = line.match(/^\s*([^:#]+):\s*(.+)$/);
    if (m) (NOTES[m[1].trim()] ??= []).push(m[2].trim());
  }
}
const T = {
  en: { title: 'Old vs. new website', introNew: 'Each row: old site (left), new site (right). The design is new on purpose; what matters is that all content is there: see the list below.', intro: 'Each row: old site (left), new site (middle), differences in red (right). Small red specks are usually font smoothing; red blocks are real differences.', differ: 'of pixels differ', height: 'height', largest: 'largest differences at', known: 'Known differences', vt: 'Visible text and links', vtIntro: 'Only what a visitor can see on each site. Lines here exist on one side only.', onlyOld: 'Only on the old site (missing on the new one)', onlyNew: 'Only on the new site (not visible on the old one)', nothing: 'nothing', link: 'Link' },
  de: { title: 'Alte vs. neue Website', introNew: 'Pro Zeile: alte Website (links), neue Website (rechts). Das Design ist absichtlich neu; wichtig ist, dass alle Inhalte da sind: siehe die Liste unten.', intro: 'Pro Zeile: alte Website (links), neue Website (Mitte), Unterschiede rot (rechts). Kleine rote Punkte sind meist Schriftglättung; rote Flächen sind echte Unterschiede.', differ: 'der Pixel unterscheiden sich', height: 'Höhe', largest: 'größte Unterschiede bei', known: 'Bekannte Unterschiede', vt: 'Sichtbare Texte und Links', vtIntro: 'Nur was Besucher:innen sehen. Diese Zeilen gibt es nur auf einer Seite.', onlyOld: 'Nur auf der alten Website (fehlt auf der neuen)', onlyNew: 'Nur auf der neuen Website (auf der alten nicht sichtbar)', nothing: 'nichts', link: 'Link' },
}[opt('lang', 'en')] ?? null;
if (!T) { console.error('--lang must be en or de'); process.exit(1); }

let chromium;
outer: for (const base of [path.join(process.cwd(), '.migration', 'tools'), process.cwd()]) {
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(pathToFileURL(createRequire(path.join(base, 'package.json')).resolve(pkg)).href);
      chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) break outer;
    } catch {}
  }
}
if (!chromium) {
  console.error('Playwright not found. In the project folder run: npm i --prefix .migration/tools playwright');
  process.exit(2);
}
async function launchBrowser() {
  const choice = opt('browser', 'auto');
  const tries = choice === 'auto' ? [null, 'chrome', 'msedge'] : [choice === 'bundled' ? null : choice];
  for (const channel of tries) {
    try {
      return await chromium.launch(channel ? { channel } : {});
    } catch {}
  }
  console.error('No usable browser found. Install Google Chrome, or run: npx playwright install chromium');
  process.exit(3);
}

const isDir = async (p) => (await stat(p).catch(() => null))?.isDirectory();
const pairs = [];
for (const page of (await readdir(OLD)).sort()) {
  if (ONLY && !ONLY.has(page)) continue;
  if (!(await isDir(path.join(OLD, page))) || !(await isDir(path.join(NEW, page)))) continue;
  const newFiles = new Set(await readdir(path.join(NEW, page)));
  let shots = 0;
  for (const f of (await readdir(path.join(OLD, page))).sort()) {
    if (/^(desktop|phone)-\d+\.png$/.test(f) && newFiles.has(f)) { pairs.push({ page, file: f }); shots++; }
  }
  if (CONTENT_ONLY && !shots && newFiles.has('page.json')) pairs.push({ page, file: null });
}
if (!pairs.length) {
  console.error(`No matching screenshots (same page folder and file name, e.g. about/desktop-1440.png) in ${OLD} and ${NEW}.`);
  process.exit(1);
}
await mkdir(OUT, { recursive: true });

// Runs in the browser: decode both PNGs, diff them, draw old | new | diff, return stats + PNG.
async function diffInBrowser({ oldUrl, newUrl, band, threshold, scale, sideBySide }) {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [a, b] = await Promise.all([load(oldUrl), load(newUrl)]);
  const toB64 = async (canvas) => {
    const buf = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  if (sideBySide) {
    // New design: old | new only; a pixel difference would be meaningless.
    const gap = 24, label = 28;
    const wa = Math.round(a.width * scale), wb = Math.round(b.width * scale);
    const out = new OffscreenCanvas(wa + gap + wb, Math.round(Math.max(a.height, b.height) * scale) + label);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = '#d0006f'; ctx.fillRect(wa, 0, gap, out.height);
    ctx.fillStyle = '#000'; ctx.font = '16px sans-serif';
    ctx.fillText(`OLD (${a.width}×${a.height})`, 8, 20); ctx.fillText(`NEW (${b.width}×${b.height})`, wa + gap + 8, 20);
    ctx.drawImage(a, 0, label, wa, Math.round(a.height * scale));
    ctx.drawImage(b, wa + gap, label, wb, Math.round(b.height * scale));
    return { oldSize: [a.width, a.height], newSize: [b.width, b.height], diffPct: null, bands: [], png: await toB64(out) };
  }
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pixels = (img) => {
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, w, h);
    x.drawImage(img, 0, 0);
    return x.getImageData(0, 0, w, h).data;
  };
  const pa = pixels(a), pb = pixels(b);
  const diffImg = new ImageData(w, h);
  const bands = [];
  let total = 0;
  for (let y0 = 0; y0 < h; y0 += band) {
    let n = 0, cnt = 0;
    for (let y = y0; y < Math.min(h, y0 + band); y++) {
      for (let xx = 0; xx < w; xx++) {
        const i = (y * w + xx) * 4;
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
        const grey = 255 - (255 - (pa[i] + pa[i + 1] + pa[i + 2]) / 3) * 0.25;
        if (d > threshold) { n++; diffImg.data.set([230, 30, 30, 255], i); } else diffImg.data.set([grey, grey, grey, 255], i);
        cnt++;
      }
    }
    total += n;
    bands.push({ from: y0, to: Math.min(h, y0 + band), diffPct: +(100 * n / cnt).toFixed(2) });
  }
  const gap = 24, label = 28;
  const sw = Math.round(w * scale), sh = Math.round(h * scale);
  const out = new OffscreenCanvas(sw * 3 + gap * 2, sh + label);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = '#d0006f'; ctx.fillRect(sw, 0, gap, out.height); ctx.fillRect(sw * 2 + gap, 0, gap, out.height);
  ctx.fillStyle = '#000'; ctx.font = '16px sans-serif';
  ctx.fillText(`OLD (${a.width}×${a.height})`, 8, 20); ctx.fillText(`NEW (${b.width}×${b.height})`, sw + gap + 8, 20); ctx.fillText('DIFFERENCE (red)', (sw + gap) * 2 + 8, 20);
  ctx.drawImage(a, 0, label, Math.round(a.width * scale), Math.round(a.height * scale));
  ctx.drawImage(b, sw + gap, label, Math.round(b.width * scale), Math.round(b.height * scale));
  const dc = new OffscreenCanvas(w, h); dc.getContext('2d').putImageData(diffImg, 0, 0);
  ctx.drawImage(dc, (sw + gap) * 2, label, sw, sh);
  return { oldSize: [a.width, a.height], newSize: [b.width, b.height], diffPct: +(100 * total / (w * h)).toFixed(2), bands, png: await toB64(out) };
}

const browser = await launchBrowser();
const page = await browser.newPage();
const results = [];
for (const { page: slug, file } of pairs) {
  if (!file) continue;
  const toUrl = async (p) => `data:image/png;base64,${(await readFile(p)).toString('base64')}`;
  const width = Number(file.match(/-(\d+)\.png$/)[1]);
  const r = await page.evaluate(diffInBrowser, {
    oldUrl: await toUrl(path.join(OLD, slug, file)),
    newUrl: await toUrl(path.join(NEW, slug, file)),
    band: BAND,
    threshold: THRESHOLD,
    scale: width > 800 ? 0.5 : 1,
    sideBySide: CONTENT_ONLY,
  });
  const outFile = `${slug}-${file.replace('.png', '')}-compare.png`;
  await writeFile(path.join(OUT, outFile), Buffer.from(r.png, 'base64'));
  const worst = [...r.bands].sort((x, y) => y.diffPct - x.diffPct).filter((b) => b.diffPct > 0).slice(0, 5);
  const entry = { page: slug, file, image: outFile, oldSize: r.oldSize, newSize: r.newSize, heightDelta: r.newSize[1] - r.oldSize[1], diffPct: r.diffPct, worstBands: worst };
  results.push(entry);
  if (CONTENT_ONLY) { console.log(`${slug}/${file}: side by side, height ${r.oldSize[1]} → ${r.newSize[1]}px`); continue; }
  console.log(`${slug}/${file}: ${r.diffPct}% pixels differ, height ${r.oldSize[1]} → ${r.newSize[1]} (${entry.heightDelta >= 0 ? '+' : ''}${entry.heightDelta}px)${worst.length ? `; worst bands: ${worst.slice(0, 3).map((b) => `${b.from}-${b.to}px ${b.diffPct}%`).join(', ')}` : ''}`);
}
await browser.close();

// Content check (needs page.json from snapshot --content on both sides): visible text and links that
// exist only on one side. Catches dropped content and elements the old site hides but the new one shows.
const contentDiffs = [];
const linkKey = (l) => {
  if (/^tel:/i.test(l.href)) return `tel:${l.href.replace(/[^\d+]/g, '')}`;
  if (/^mailto:/i.test(l.href)) return l.href.toLowerCase();
  try { const u = new URL(l.href); return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`; } catch { return l.href; }
};
for (const slug of [...new Set(pairs.map((p) => p.page))]) {
  const read = async (dir) => JSON.parse(await readFile(path.join(dir, slug, 'page.json'), 'utf8').catch(() => 'null'));
  const [a, b] = [await read(OLD), await read(NEW)];
  if (!a?.visibleTextLines || !b?.visibleTextLines) {
    if (a || b) console.log(`${slug}: no text/link comparison: ${!a?.visibleTextLines ? 'old' : 'new'} side lacks content data; capture both sides with snapshot.mjs --content (same script version)`);
    continue;
  }
  const norm = (s) => s.toLowerCase();
  const ta = new Set(a.visibleTextLines.map(norm)), tb = new Set(b.visibleTextLines.map(norm));
  // Links: compare by target path, ignoring the old vs. new domain (relative links on the new site).
  // Links to the old domain and to the new site's own host count as the same internal page.
  const host = (x) => { try { return new URL(x.url).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const siteHosts = [host(a), host(b)].filter(Boolean);
  const sameSite = (l) => { const k = linkKey(l); const h = siteHosts.find((s) => k.startsWith(s)); return h ? k.slice(h.length) || '/' : k; };
  const la = new Map(a.visibleLinks.map((l) => [sameSite(l), l])), lb = new Map(b.visibleLinks.map((l) => [sameSite(l), l]));
  const entry = {
    page: slug,
    textOnlyOld: a.visibleTextLines.filter((l) => !tb.has(norm(l))).slice(0, 40),
    textOnlyNew: b.visibleTextLines.filter((l) => !ta.has(norm(l))).slice(0, 40),
    linksOnlyOld: [...la.entries()].filter(([k]) => !lb.has(k)).map(([k, l]) => `${l.text || '(no text)'} → ${k}`).slice(0, 40),
    linksOnlyNew: [...lb.entries()].filter(([k]) => !la.has(k)).map(([k, l]) => `${l.text || '(no text)'} → ${k}`).slice(0, 40),
  };
  contentDiffs.push(entry);
  const n = entry.textOnlyOld.length + entry.textOnlyNew.length + entry.linksOnlyOld.length + entry.linksOnlyNew.length;
  console.log(`${slug}: ${n ? `${entry.textOnlyOld.length} text line(s) and ${entry.linksOnlyOld.length} link(s) only on the old site, ${entry.textOnlyNew.length} text line(s) and ${entry.linksOnlyNew.length} link(s) only on the new site` : 'visible text and links identical'}`);
}

await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ old: OLD, new: NEW, mode: CONTENT_ONLY ? 'content-only' : 'pixel', threshold: THRESHOLD, band: BAND, results, contentDiffs }, null, 2));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const html = `<!doctype html><html lang="${opt('lang', 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.title)}</title><style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f6f6f4;color:#1e1e1e}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 24px;color:#555}
section{background:#fff;border:1px solid #e3e3e0;border-radius:8px;padding:16px;margin-bottom:24px}
h2{font-size:17px;margin:0 0 6px}.stats{font-size:14px;color:#444;margin-bottom:12px}
img{max-width:100%;height:auto;border:1px solid #ddd;display:block}
</style></head><body>
<h1>${esc(T.title)}</h1>
<p>${esc(CONTENT_ONLY ? T.introNew : T.intro)}</p>
${results.map((r) => `<section><h2>${esc(r.page)} · ${esc(r.file.replace('.png', ''))}</h2>
<div class="stats">${r.diffPct === null ? '' : `${r.diffPct}% ${esc(T.differ)} · `}${esc(T.height)} ${r.oldSize[1]}px → ${r.newSize[1]}px (${r.heightDelta >= 0 ? '+' : ''}${r.heightDelta}px)${r.worstBands.length ? ` · ${esc(T.largest)} ${r.worstBands.slice(0, 3).map((b) => `${b.from}–${b.to}px`).join(', ')}` : ''}</div>
${[...(NOTES['*'] ?? []), ...(NOTES[r.page] ?? [])].length ? `<div class="stats"><strong>${esc(T.known)}:</strong> ${[...(NOTES['*'] ?? []), ...(NOTES[r.page] ?? [])].map(esc).join(' · ')}</div>` : ''}
<a href="${esc(r.image)}"><img src="${esc(r.image)}" alt="Comparison of ${esc(r.page)}"></a></section>`).join('\n')}
${contentDiffs.length ? `<h1>${esc(T.vt)}</h1><p>${esc(T.vtIntro)}</p>
${contentDiffs.map((d) => `<section><h2>${esc(d.page)}</h2>${[[T.onlyOld, d.textOnlyOld, d.linksOnlyOld], [T.onlyNew, d.textOnlyNew, d.linksOnlyNew]].map(([t, txt, lnk]) => `<div class="stats"><strong>${esc(t)}:</strong> ${txt.length + lnk.length ? '' : esc(T.nothing)}</div>${txt.length + lnk.length ? `<ul>${[...txt.map((x) => `<li>${esc(x)}</li>`), ...lnk.map((x) => `<li>${esc(T.link)}: ${esc(x)}</li>`)].join('')}</ul>` : ''}`).join('')}</section>`).join('\n')}` : ''}
</body></html>`;
await writeFile(path.join(OUT, 'index.html'), html);
console.log(`\nWrote ${results.length} comparison(s), report.json and index.html to ${OUT}`);
