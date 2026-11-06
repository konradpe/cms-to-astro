#!/usr/bin/env node
// Summarise the old site's structure from snapshot.mjs --content captures into one short Markdown file:
// menus, footer, page tree, section outlines per content type, the section kinds used across the site
// (= the component set a new design needs) and brand basics. Input for "new design, same content";
// cheaper to read than dozens of page.json files or screenshots.
//
//   node structure.mjs [--snapshots .migration/snapshots/live] [--out .migration/structure.md]

import { readFile, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const HELP = `Usage: node structure.mjs [options]   (run from the project folder)

Reads page.json files written by snapshot.mjs --content (same script version: needs the menus,
footer, outline and brand fields) and writes a compact structure summary.

  --snapshots <dir>   default .migration/snapshots/live
  --plan <file>       page plan for the page tree and content-type groups (default .migration/plan.json)
  --out <file>        default .migration/structure.md
  --examples <n>      example outlines per content type (default 3)
  --help`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SNAP = opt('snapshots', '.migration/snapshots/live');
const OUT = opt('out', '.migration/structure.md');
const EXAMPLES = Number(opt('examples', 3));
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null'));
const plan = await readJson(opt('plan', '.migration/plan.json'));

const pages = [];
for (const d of (await readdir(SNAP).catch(() => [])).sort()) {
  const pj = await readJson(path.join(SNAP, d, 'page.json'));
  if (!pj?.url) continue;
  let p;
  try { p = decodeURI(new URL(pj.url).pathname); } catch { p = new URL(pj.url).pathname; }
  pages.push({ dir: d, path: p.endsWith('/') ? p : `${p}/`, ...pj });
}
if (!pages.length) {
  console.error(`No page.json files in ${SNAP}. Capture pages first: snapshot.mjs <urls> --out ${SNAP} --content`);
  process.exit(1);
}
if (!pages.some((p) => p.outline)) {
  console.error('The captures have no structure data (menus, outline). Re-capture with the current snapshot.mjs --content.');
  process.exit(1);
}
const groupOf = (p) => plan?.pages?.find((x) => x.path === p)?.group ?? (p === '/' ? 'home' : p.split('/').filter(Boolean).length === 1 ? 'pages' : p.split('/').filter(Boolean)[0]);
const home = pages.find((p) => p.path === '/') ?? pages[0];
const rel = (href) => {
  try {
    const u = new URL(href);
    const h = new URL(home.url).hostname.replace(/^www\./, '');
    return u.hostname.replace(/^www\./, '') === h ? decodeURI(u.pathname) + u.search + u.hash : href;
  } catch { return href; }
};
const menuLines = (items, depth = 0) => items.flatMap((n) => [`${'  '.repeat(depth)}- ${n.text || '(no text)'}${n.href ? ` → ${rel(n.href)}` : ''}`, ...menuLines(n.children ?? [], depth + 1)]);
const sectionLine = (s, i) => `${i + 1}. **${s.kind}**${s.heading ? ` "${s.heading.replace(/^h\d: /, '')}"` : ''} · ${s.words} words${s.images ? ` · ${s.images} img` : ''}${s.columns > 1 ? ` · ${s.columns} columns` : ''}${s.buttons ? ` · ${s.buttons} buttons` : ''}${s.backgroundImage ? ' · background image' : ''}${s.forms ? ' · form' : ''}${s.iframes ? ` · embeds: ${s.iframes.map((u) => { try { return new URL(u).hostname; } catch { return u; } }).join(', ')}` : ''}`;

const out = [`# Site structure: ${new URL(home.url).origin}`, '', `From ${pages.length} captured page(s) in \`${SNAP}\`, written by structure.mjs. Section kinds are guesses from the markup (hero, text, image-text, cards, gallery, video, map, form, image, other): check them against a screenshot before you design components.`, ''];

// Menus and footer (from the home page; other pages usually share them).
out.push('## Menus (home page)', '');
if (!home.menus?.length) out.push('No menu found in the markup (check the header screenshot).', '');
for (const [i, m] of (home.menus ?? []).entries()) {
  const title = m.where === 'language switcher' ? 'Language switcher' : i === 0 ? 'Main menu' : `Menu ${i + 1}`;
  out.push(`### ${title} (${m.where}${m.visible ? '' : ', hidden at this width: mobile or off-canvas menu'})`, '', ...menuLines(m.items).slice(0, 80), '');
}
// Menus on other pages that the home page doesn't have (compared by their labels).
const otherMenus = new Map();
const menuSig = (m) => JSON.stringify(m.items.map((n) => n.text.toLowerCase()));
for (const p of pages) for (const m of p.menus ?? []) {
  const sig = menuSig(m);
  if (!(home.menus ?? []).some((h) => menuSig(h) === sig)) otherMenus.set(sig, { page: p.path, m });
}
if (otherMenus.size) {
  out.push('### Menus found only on other pages', '');
  for (const { page, m } of [...otherMenus.values()].slice(0, 5)) out.push(`- on ${page}: ${m.items.slice(0, 8).map((n) => n.text).join(' · ')}${m.items.length > 8 ? ' …' : ''}`);
  out.push('');
}
out.push('## Footer (home page)', '');
if (home.footer) {
  out.push(`Text: ${home.footer.textLines.slice(0, 25).join(' | ')}`, '');
  out.push(`Links: ${home.footer.links.slice(0, 30).map((l) => `${l.text || '(icon)'} → ${rel(l.href)}`).join(' · ') || 'none'}`, '');
} else out.push('No footer element found.', '');

// Page tree by content type.
const groups = new Map();
for (const p of plan?.pages ?? pages.map((x) => ({ path: x.path, group: groupOf(x.path) }))) (groups.get(p.group) ?? groups.set(p.group, []).get(p.group)).push(p.path);
out.push('## Pages by content type', '', '| Type | Pages | Examples |', '|---|---|---|');
for (const [g, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) out.push(`| ${g} | ${list.length} | ${list.slice(0, 4).join(', ')}${list.length > 4 ? ', …' : ''} |`);
out.push('');

// Outlines per content type: kind frequencies plus a few example pages.
const kindsSite = new Map();
out.push('## Section outlines by content type', '');
const captured = new Map();
for (const p of pages) (captured.get(groupOf(p.path)) ?? captured.set(groupOf(p.path), []).get(groupOf(p.path))).push(p);
for (const [g, list] of [...captured.entries()].sort((a, b) => (a[0] === 'home' ? -1 : b[0] === 'home' ? 1 : b[1].length - a[1].length))) {
  const kinds = new Map();
  for (const p of list) for (const s of p.outline ?? []) { kinds.set(s.kind, (kinds.get(s.kind) || 0) + 1); kindsSite.set(s.kind, (kindsSite.get(s.kind) || 0) + 1); }
  out.push(`### ${g} (${list.length} captured)`, '', `Section kinds: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`, '');
  for (const p of list.slice(0, EXAMPLES)) {
    out.push(`**${p.path}** ${p.meta?.title ? `(${p.meta.title})` : ''}`, '', ...(p.outline ?? []).slice(0, 25).map(sectionLine), '');
  }
}
out.push('## Section kinds across the site', '', [...kindsSite.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '), '', 'Each kind that occurs is a candidate for one component of the new design; rare kinds may fold into a more general one.', '');

// Brand basics.
const b = home.brand ?? {};
const styles = await readJson(path.join(SNAP, home.dir, 'styles.json'));
out.push('## Brand basics (home page)', '');
out.push(`- Site name: ${b.siteName || home.meta?.title || '–'}`);
const logo = b.logo;
const logoText = !logo ? 'not found (check the header screenshot)'
  : (logo.file ? `inline SVG saved as ${path.join(SNAP, home.dir, logo.file)}`
    : logo.src ? `${logo.largest || logo.src}${logo.alt ? ` (alt "${logo.alt}")` : ''}`
    : logo.backgroundImage ? `CSS background image ${logo.backgroundImage}${logo.text ? ` (link text "${logo.text}")` : ''}`
    : `"${logo.text}": ${logo.note}`) + (logo.shownAt ? ` · shown at ${logo.shownAt.join('×')} px` : '');
out.push(`- Logo: ${logoText}`);
out.push(`- Icons: ${(b.icons ?? []).map((i) => `${i.rel}${i.sizes ? ` ${i.sizes}` : ''} ${i.href}`).join(' · ') || 'none'}`);
if (b.themeColor) out.push(`- Theme colour: ${b.themeColor}`);
if (styles) {
  out.push(`- Text colours: ${styles.textColors?.slice(0, 5).map((c) => c.value).join(', ')}`);
  out.push(`- Background colours: ${styles.backgroundColors?.slice(0, 5).map((c) => c.value).join(', ')}`);
  out.push(`- Fonts: ${styles.fontFamilies?.slice(0, 4).map((f) => f.value).join(' | ')} (check licences before reusing)`);
} else out.push('- Colours and fonts: capture the home page with --styles to list them.');
out.push('');

await writeFile(OUT, out.join('\n'));
const totalSections = [...kindsSite.values()].reduce((a, n) => a + n, 0);
console.log(`${pages.length} pages, ${groups.size} content types, ${totalSections} sections (${[...kindsSite.entries()].sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}).`);
console.log(`Main menu: ${home.menus?.[0] ? `${home.menus[0].items.length} top-level items` : 'not found'}; logo: ${b.logo ? 'found' : 'not found'}. Wrote ${OUT}.`);
