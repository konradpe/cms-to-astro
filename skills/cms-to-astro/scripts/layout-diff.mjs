#!/usr/bin/env node
// Compare the box structure of an old and a new page (layout-<width>.json from snapshot.mjs --layout)
// and print where they diverge, in pixels. Blocks are paired by their text or image file name, so
// different class names and wrappers on both sides don't matter.
//
//   node layout-diff.mjs .migration/snapshots/live/about/layout-1440.json .migration/snapshots/new/about/layout-1440.json

import { readFile } from 'node:fs/promises';

const HELP = `Usage: node layout-diff.mjs <old layout-<width>.json> <new layout-<width>.json> [options]

  --min <px>       Smallest difference to report (default: 2)
  --top <n>        How many of the largest differences to list (default: 25)
  --json           Print the full result as JSON

Pairs blocks by text (headings, paragraphs, links, buttons) or image file name, in page order.
Prints: the first block where the vertical position drifts (usually the cause of everything below),
the blocks with the largest size/position/spacing changes, typography changes, and blocks found
on only one side.`;

const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.includes('--help') ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const [oldFile, newFile] = args.filter((a, i) => !a.startsWith('--') && !['--min', '--top'].includes(args[i - 1]));
const MIN = Number(opt('min', 2));
const TOP = Number(opt('top', 25));

const load = async (f) => {
  const d = JSON.parse(await readFile(f, 'utf8'));
  return { height: d.pageHeight, blocks: d.blocks ?? [] };
};
const [A, B] = [await load(oldFile), await load(newFile)];

const norm = (t) => (t || '').toLowerCase().replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();
const keyOf = (b) => (b.src ? `img:${b.src.replace(/-\d+x\d+(?=\.)/, '').toLowerCase()}` : b.text && norm(b.text).length >= 3 ? `txt:${norm(b.text)}` : null);

// Pair in page order: for each keyed block in A, take the next unused block in B with the same key.
const queue = new Map();
for (const [i, b] of B.blocks.entries()) {
  const k = keyOf(b);
  if (!k) continue;
  (queue.get(k) ?? queue.set(k, []).get(k)).push(i);
}
const pairs = [];
const onlyOld = [];
for (const a of A.blocks) {
  const k = keyOf(a);
  if (!k) continue;
  const list = queue.get(k);
  if (list?.length) pairs.push([a, B.blocks[list.shift()]]);
  else onlyOld.push(a);
}
const onlyNew = [...queue.values()].flat().map((i) => B.blocks[i]);

const px = (v) => (v == null ? null : parseFloat(v));
const STYLE_KEYS = ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'textTransform', 'color'];
const SPACE_KEYS = ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'gap'];
const label = (b) => `${b.el}${b.text ? ` "${b.text.slice(0, 40)}"` : ''}${b.src ? ` [${b.src}]` : ''}`;

const rows = pairs.map(([a, b]) => {
  const d = { dx: b.x - a.x, dy: b.y - a.y, dw: b.w - a.w, dh: b.h - a.h };
  const spacing = {};
  for (const k of SPACE_KEYS) {
    const va = px(a[k]) ?? 0, vb = px(b[k]) ?? 0;
    if (Math.abs(va - vb) >= 1) spacing[k] = `${va}→${vb}`;
  }
  const style = {};
  for (const k of STYLE_KEYS) if ((a[k] ?? '') !== (b[k] ?? '') && (a[k] || b[k])) style[k] = `${a[k] ?? '–'} → ${b[k] ?? '–'}`;
  return { a, b, ...d, spacing, style };
});

// First drift: the first pair (in old page order) whose vertical offset changes by >= MIN against the previous pair.
let firstDrift = null;
let prevDy = 0;
for (const r of rows) {
  if (Math.abs(r.dy - prevDy) >= MIN) { firstDrift = { ...r, jump: r.dy - prevDy }; break; }
  prevDy = r.dy;
}
const sized = rows
  .filter((r) => Math.abs(r.dh) >= MIN || Math.abs(r.dw) >= MIN || Math.abs(r.dx) >= MIN || Object.keys(r.spacing).length)
  .sort((x, y) => Math.max(Math.abs(y.dh), Math.abs(y.dw), Math.abs(y.dx)) - Math.max(Math.abs(x.dh), Math.abs(x.dw), Math.abs(x.dx)))
  .slice(0, TOP);
const typo = rows.filter((r) => Object.keys(r.style).length).slice(0, TOP);

if (args.includes('--json')) {
  console.log(JSON.stringify({ heights: [A.height, B.height], paired: rows.length, firstDrift, sized, typo, onlyOld, onlyNew }, null, 1));
  process.exit(0);
}

const out = [];
out.push(`Page height ${A.height} → ${B.height} (${B.height - A.height >= 0 ? '+' : ''}${B.height - A.height}px); ${rows.length} blocks paired, ${onlyOld.length} only old, ${onlyNew.length} only new.`);
if (firstDrift) {
  out.push('', `First vertical drift (fix this first; everything below moves with it):`);
  out.push(`  ${label(firstDrift.a)} at y=${firstDrift.a.y}: shifted ${firstDrift.jump > 0 ? '+' : ''}${firstDrift.jump}px against the block before (total dy ${firstDrift.dy})`);
  const before = rows[rows.indexOf(rows.find((r) => r.a === firstDrift.a)) - 1];
  if (before) out.push(`  previous block: ${label(before.a)}, dh ${before.dh}${Object.keys(before.spacing).length ? `, spacing ${JSON.stringify(before.spacing)}` : ''}`);
} else out.push('', 'No vertical drift between paired blocks.');
if (sized.length) {
  out.push('', `Largest size/position/spacing differences (old → new):`);
  for (const r of sized) out.push(`  ${label(r.a)} @y${r.a.y}: dx ${r.dx}, dy ${r.dy}, dw ${r.dw}, dh ${r.dh}${Object.keys(r.spacing).length ? `, ${Object.entries(r.spacing).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`);
}
if (typo.length) {
  out.push('', 'Typography differences:');
  for (const r of typo) out.push(`  ${label(r.a)}: ${Object.entries(r.style).map(([k, v]) => `${k} ${v}`).join('; ')}`);
}
if (onlyOld.length) out.push('', `Only on the old page (${onlyOld.length}): ${onlyOld.slice(0, 8).map(label).join(' | ')}`);
if (onlyNew.length) out.push('', `Only on the new page (${onlyNew.length}): ${onlyNew.slice(0, 8).map(label).join(' | ')}`);
console.log(out.join('\n'));
