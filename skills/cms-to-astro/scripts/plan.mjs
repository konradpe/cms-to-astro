#!/usr/bin/env node
// The page plan: every page of the old site with its migration status, derived from the project
// itself, plus rough token estimates for what is left. It is what makes interrupted sessions cheap
// to resume: any agent can run `plan.mjs update` and see exactly where things stand.
//
//   node plan.mjs init [--mode new|similar|copy]  create .migration/plan.json from .migration/inventory.json
//   node plan.mjs update                  re-derive statuses from content files, dist/ and the comparison
//   node plan.mjs set <path|group> <status> [--note "..."]   approved | issue | skipped | auto
//   node plan.mjs group <path-prefix|group> <name>    put pages into a content-type group (merge groups)
//   node plan.mjs report                  write PLAN.md and print a summary (update runs first)

import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const HELP = `Usage: node plan.mjs <init|update|set|report> [options]   (run from the project folder)

  init                  Create .migration/plan.json from .migration/inventory.json (pages and posts;
                        archives and feeds are left out). Keeps manual statuses of an existing plan.
  --mode <m>            The kick-off design choice, stored in the plan (any command accepts it):
                          new      new design on the same content (no pixel matching)
                          similar  similar look, built by eye, content check only
                          copy     exact 1:1 copy (pixel comparison rounds)
                        Changes the token estimates. Default: copy, or what the plan already says.
  update                Derive each page's status from the project:
                          todo       nothing done yet
                          extracted  a content file with its oldUrl exists (raw)
                          wireframe  content shown in the wireframe layout (frontmatter wireframe: true)
                          styled     built with a real template (in dist/, not a wireframe/placeholder)
                          compared   in .migration/comparison/report.json (diff % or, with
                                     compare.mjs --content-only, text/link differences recorded)
                        Manual statuses (approved, issue, skipped) are kept.
  group <target> <name>  Put pages into the content-type group <name>: target is a path prefix
                        (/hidden-pages/ ...) or an existing group. Use it to merge groups that share one
                        template (e.g. several folders of the same kind of page). Kept on init.
  set <target> <status> [--note "text"]
                        target: a path (/about/) or a group name (portfolio); status: approved,
                        issue, skipped, or auto (back to the derived status)
  report                update, then write PLAN.md (overview, estimates, issues, page list)

  --plan <file>         default .migration/plan.json
  --inventory <file>    default .migration/inventory.json
  --content <dir>       default src/content
  --dist <dir>          default dist
  --comparison <file>   default .migration/comparison/report.json
  --out <file>          PLAN.md location for report (default PLAN.md)

Token estimates are rough (calibrated on a few test migrations, ±50%); see ESTIMATES in this file.`;

// Rough costs in tokens (total tokens as Claude Code reports them per agent, context re-reads included).
// Calibrated on three test migrations (Nov 2026: a WordPress page-builder site, a multilingual TYPO3 site,
// a WordPress/Elementor site): 370-540k tokens each for stages 0-6 with a two-page near-1:1 pilot, of which
// ~150k setup and extraction, 60-140k per page template (4-7 comparison rounds). Update with better data.
// "Template" = first page of a content type built as a near 1:1 copy incl. comparison rounds.
const ESTIMATES = {
  setup: 150_000, // stages 0-5: tools, intake, inventory, scaffold, design and content extraction
  template: { simple: 45_000, medium: 85_000, complex: 140_000 },
  perPageStyled: 4_000, // each further page of a type that already has a template (content clean-up, delegated)
  perPageWireframe: 1_000, // scripted conversion to the wireframe layout, delegated batch
  harness: 50_000, // stage 8 incl. the harness test
  goLive: 40_000, // stages 9-11 (repository, CI, preview, checklist)
};
// "New design on the same content": no pixel comparison rounds, but a design direction to agree once.
// NOT YET CALIBRATED by a test migration: derived from the copy-mode runs by removing the comparison
// rounds (about half of each template's cost) and the detailed design extraction. Replace with real data.
const ESTIMATES_NEW = {
  ...ESTIMATES,
  setup: 125_000, // no detailed design extraction; brand basics and structure summary instead
  designDirection: 40_000, // two or three mockups of the home page's first screen, tokens, base layout
  template: { simple: 20_000, medium: 35_000, complex: 55_000 }, // components + first page + content check
  perPageStyled: 3_000,
};
// "Similar look": design values and screenshots as input, built by eye, no measuring loop.
// NOT YET CALIBRATED: between the two (template cost roughly 60% of the 1:1 runs).
const ESTIMATES_SIMILAR = {
  ...ESTIMATES,
  setup: 140_000,
  template: { simple: 30_000, medium: 50_000, complex: 80_000 },
  perPageStyled: 3_500,
};
const ESTIMATE_SETS = { copy: ESTIMATES, similar: ESTIMATES_SIMILAR, new: ESTIMATES_NEW };
const MODE_LABEL = {
  copy: 'exact 1:1 copy, compared pixel by pixel',
  similar: 'similar look, built by eye, checked for complete content',
  new: 'new design on the same content (no pixel matching)',
};
const STATUS_ORDER = ['todo', 'extracted', 'wireframe', 'styled', 'compared', 'approved'];
const MANUAL = new Set(['approved', 'issue', 'skipped']);

const args = process.argv.slice(2);
const cmd = args[0];
if (!cmd || args.includes('--help') || !['init', 'update', 'set', 'group', 'report'].includes(cmd)) {
  console.log(HELP);
  process.exit(cmd ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PLAN = opt('plan', '.migration/plan.json');
const INVENTORY = opt('inventory', '.migration/inventory.json');
const CONTENT = opt('content', 'src/content');
const DIST = opt('dist', 'dist');
const COMPARISON = opt('comparison', '.migration/comparison/report.json');
const MODE_ARG = opt('mode');
if (MODE_ARG && !['copy', 'similar', 'new'].includes(MODE_ARG)) {
  console.error('--mode must be new, similar or copy');
  process.exit(1);
}

const readJson = async (f, def = null) => JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) ?? def;
const exists = async (p) => !!(await stat(p).catch(() => null));
const normPath = (p) => {
  let x = p.split(/[?#]/)[0];
  try { x = decodeURI(x); } catch {}
  return x.endsWith('/') ? x : `${x}/`;
};
// Fallback when the inventory has no group: first segment after a language prefix (/en/…).
const groupOf = (p) => {
  let seg = p.split('/').filter(Boolean);
  if (seg.length && /^[a-z]{2}([-_][a-z]{2})?$/i.test(seg[0])) seg = seg.slice(1);
  return !seg.length ? 'home' : /^\d{4}$/.test(seg[0]) ? 'posts-dated' : seg.length === 1 ? 'pages' : seg[0];
};
const slugOf = (p) => p.replace(/\/+$/, '').slice(1).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120) || 'home';

async function init() {
  const inv = await readJson(INVENTORY);
  if (!inv) throw new Error(`${INVENTORY} not found; run inventory.mjs first`);
  const old = await readJson(PLAN, { pages: [] });
  const manual = new Map(old.pages.filter((p) => p.manual).map((p) => [p.path, p]));
  const manualGroup = new Map(old.pages.filter((p) => p.groupManual).map((p) => [p.path, p.group]));
  const pages = inv.urls
    .filter((u) => u.kind === 'page' || u.kind === 'post')
    .map((u) => {
      const p = normPath(new URL(u.url).pathname);
      const m = manual.get(p);
      const g = manualGroup.get(p);
      return { path: p, url: u.url, group: g ?? u.group ?? groupOf(p), ...(g ? { groupManual: true } : {}), lang: u.lang ?? null, kind: u.kind, status: m?.status ?? 'todo', manual: !!m, note: m?.note ?? '' };
    });
  const plan = { site: inv.site, mode: MODE_ARG ?? old.mode ?? 'copy', createdAt: old.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), pages };
  await mkdir(path.dirname(PLAN), { recursive: true });
  await writeFile(PLAN, JSON.stringify(plan, null, 1));
  console.log(`Plan with ${pages.length} pages in ${new Set(pages.map((p) => p.group)).size} groups written to ${PLAN}.`);
  return plan;
}

async function contentIndex() {
  const map = new Map();
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) await walk(f);
      else if (/\.mdx?$/.test(e.name)) {
        const s = await readFile(f, 'utf8');
        const front = s.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
        const oldUrl = front.match(/oldUrl:\s*"?([^"\n]+)"?/)?.[1];
        if (!oldUrl) continue;
        let p;
        try { p = normPath(new URL(oldUrl).pathname); } catch { continue; }
        map.set(p, { file: f, wireframe: /wireframe:\s*true/.test(front), needsReview: /needsReview:\s*true/.test(front), title: front.match(/title:\s*"?([^"\n]+)"?/)?.[1] });
      }
    }
  };
  await walk(CONTENT);
  return map;
}

async function update(plan) {
  plan ??= await readJson(PLAN);
  if (!plan) throw new Error(`${PLAN} not found; run "plan.mjs init" first`);
  if (MODE_ARG) plan.mode = MODE_ARG;
  plan.mode ??= 'copy';
  const content = await contentIndex();
  const comparison = await readJson(COMPARISON, { results: [] });
  const compared = new Map();
  for (const r of comparison.results ?? []) {
    if (r.diffPct === null || r.diffPct === undefined) continue; // side-by-side only (--content-only)
    const e = compared.get(r.page) ?? {};
    e[r.file.replace('.png', '')] = `${r.diffPct}%`;
    compared.set(r.page, e);
  }
  for (const d of comparison.contentDiffs ?? []) {
    const e = compared.get(d.page) ?? {};
    e['text/link differences'] = d.textOnlyOld.length + d.textOnlyNew.length + d.linksOnlyOld.length + d.linksOnlyNew.length;
    compared.set(d.page, e);
  }
  for (const p of plan.pages) {
    const c = content.get(p.path);
    // build.format 'directory' writes about/index.html, 'file' writes about.html.
    const segs = p.path.split('/').filter(Boolean);
    const last = segs[segs.length - 1] ?? '';
    const candidates = [path.join(DIST, ...segs, 'index.html'), ...(segs.length ? [path.join(DIST, ...segs.slice(0, -1), /\.html?$/i.test(last) ? last : `${last}.html`)] : [])];
    let distFile = null;
    for (const f of candidates) if (!distFile && (await exists(f))) distFile = f;
    let built = null;
    if (distFile) {
      const html = await readFile(distFile, 'utf8');
      built = html.includes('data-migration="pending"') ? 'pending' : html.includes('data-migration="wireframe"') ? 'wireframe' : 'styled';
    }
    const cmp = compared.get(slugOf(p.path));
    p.title = c?.title ?? p.title;
    p.file = c?.file ?? null;
    p.diff = cmp ?? null;
    p.derived = cmp && built === 'styled' ? 'compared' : built === 'styled' ? 'styled' : built === 'wireframe' || c?.wireframe ? 'wireframe' : c ? 'extracted' : 'todo';
    if (!p.manual) p.status = p.derived;
  }
  plan.updatedAt = new Date().toISOString();
  await writeFile(PLAN, JSON.stringify(plan, null, 1));
  return plan;
}

async function complexityOf(group, pages) {
  // Size of the first captured page of the group: number of visible layout blocks (snapshot --layout),
  // else the number of sections in its outline (snapshot --content).
  for (const p of pages) {
    const dir = path.join('.migration', 'snapshots', 'live', slugOf(p.path));
    const layout = await readJson(path.join(dir, 'layout-1440.json'));
    if (layout?.blocks) return layout.blocks.length < 60 ? 'simple' : layout.blocks.length < 150 ? 'medium' : 'complex';
    const outline = (await readJson(path.join(dir, 'page.json')))?.outline;
    if (outline) return outline.length < 4 ? 'simple' : outline.length < 8 ? 'medium' : 'complex';
  }
  return 'medium';
}

const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const range = (n) => `${fmtTok(n * 0.5)}–${fmtTok(n * 1.5)}`;

async function report(plan) {
  plan = await update(plan);
  const E = ESTIMATE_SETS[plan.mode] ?? ESTIMATES;
  const groups = new Map();
  for (const p of plan.pages) (groups.get(p.group) ?? groups.set(p.group, []).get(p.group)).push(p);
  const counts = (list) => Object.fromEntries([...STATUS_ORDER, 'issue', 'skipped'].map((s) => [s, list.filter((p) => p.status === s).length]).filter(([, n]) => n));
  const rows = [];
  let remainingStyled = 0, remainingWire = 0;
  const remainingByMode = { copy: 0, similar: 0, new: 0 };
  for (const [g, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const active = list.filter((p) => p.status !== 'skipped');
    const hasTemplate = active.some((p) => ['styled', 'compared', 'approved'].includes(p.status));
    const notStyled = active.filter((p) => ['todo', 'extracted', 'wireframe', 'issue'].includes(p.status));
    const cx = await complexityOf(g, list);
    const cost = (est) => (notStyled.length ? (hasTemplate ? 0 : est.template[cx]) + Math.max(0, notStyled.length - (hasTemplate ? 0 : 1)) * est.perPageStyled : 0);
    const styledCost = cost(E);
    for (const m of Object.keys(remainingByMode)) remainingByMode[m] += cost(ESTIMATE_SETS[m]);
    const wireCost = active.filter((p) => ['todo', 'extracted'].includes(p.status)).length * E.perPageWireframe;
    remainingStyled += styledCost;
    remainingWire += wireCost;
    const c = counts(list);
    const langs = {};
    for (const p of list) langs[p.lang ?? 'default'] = (langs[p.lang ?? 'default'] || 0) + 1;
    const langNote = Object.keys(langs).length > 1 ? ` (${Object.entries(langs).map(([l, n]) => `${l} ${n}`).join(', ')})` : '';
    rows.push(`| ${g} | ${list.length}${langNote} | ${Object.entries(c).map(([s, n]) => `${s} ${n}`).join(', ')} | ${cx} | ${styledCost ? range(styledCost) : '–'} | ${wireCost ? range(wireCost) : '–'} |`);
  }
  const total = counts(plan.pages);
  const designPendingIfNew = !plan.pages.some((p) => ['styled', 'compared', 'approved'].includes(p.status));
  const designPending = plan.mode === 'new' && designPendingIfNew;
  const issues = plan.pages.filter((p) => p.status === 'issue');
  const md = [
    `# Migration plan: ${plan.site}`,
    '',
    `Updated ${plan.updatedAt.slice(0, 16).replace('T', ' ')} by \`plan.mjs report\`. Status per page is derived from the project (content files, build, comparison); approved/issue/skipped are set by hand. Details: \`.migration/plan.json\`.`,
    '',
    `**${plan.pages.length} pages:** ${Object.entries(total).map(([s, n]) => `${s} ${n}`).join(' · ')}`,
    '',
    `**Design:** ${MODE_LABEL[plan.mode] ?? plan.mode}.`,
    '',
    '## By content type',
    '',
    '| Group | Pages | Status | Layout | Est. tokens to style the rest | Est. tokens for wireframes only |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    'One styled template per group serves all its languages; each further page, in any language, adds the per-page cost. If several groups are really the same kind of page (one template), merge them: `plan.mjs group <path-prefix|group> <name>`.',
    '',
    `Remaining, roughly: **${remainingStyled ? range(remainingStyled) : '0'} tokens** to style everything, or **${remainingWire ? range(remainingWire) : '0'}** to show the rest as unstyled wireframes first. Plus about ${designPending ? `${range(E.designDirection)} for agreeing the design direction (once), ` : ''}${range(E.harness)} for the agent setup and ${range(E.goLive)} for repository, preview and go-live, if not done yet. Estimates are rough (±50%) and assume mechanical work runs on a cheaper model.${plan.mode !== 'copy' ? ' The numbers for this route are derived from 1:1 test runs, not yet calibrated.' : ''}${remainingStyled ? ` For comparison, styling the rest would need roughly: ${['new', 'similar', 'copy'].filter((m) => m !== plan.mode).map((m) => `${range(remainingByMode[m] + (m === 'new' && designPendingIfNew ? ESTIMATES_NEW.designDirection : 0))} as ${m === 'new' ? 'a new design (design direction included)' : m === 'similar' ? 'a similar look' : 'an exact copy'}`).join(', ')}.` : ''}`,
    '',
    '## Issues',
    '',
    ...(issues.length ? issues.map((p) => `- ${p.path}: ${p.note || '(no note)'}`) : ['None recorded.']),
    '',
    '## Pages',
    '',
    ...[...groups.entries()].flatMap(([g, list]) => [
      `### ${g} (${list.length})`,
      '',
      ...list.map((p) => `- \`${p.status}\` ${p.path}${p.title ? ` — ${p.title}` : ''}${p.diff ? ` (${Object.entries(p.diff).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}${p.note ? ` — ${p.note}` : ''}`),
      '',
    ]),
  ].join('\n');
  await writeFile(opt('out', 'PLAN.md'), md);
  console.log(`${plan.pages.length} pages: ${Object.entries(total).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  console.log(`Design mode: ${plan.mode}. Remaining (rough): ${remainingStyled ? range(remainingStyled) : '0'} tokens to style everything; ${remainingWire ? range(remainingWire) : '0'} for wireframes only${designPending ? `; design direction ${range(E.designDirection)}` : ''}.`);
  console.log(`Wrote ${opt('out', 'PLAN.md')}.`);
}

async function regroup() {
  const [, target, name] = args;
  if (!target || !name) throw new Error('Usage: plan.mjs group <path-prefix|group> <name>');
  const plan = await readJson(PLAN);
  if (!plan) throw new Error(`${PLAN} not found; run "plan.mjs init" first`);
  let n = 0;
  for (const p of plan.pages) {
    if (target.startsWith('/') ? !p.path.startsWith(target) : p.group !== target) continue;
    p.group = name;
    p.groupManual = true;
    n++;
  }
  await writeFile(PLAN, JSON.stringify(plan, null, 1));
  console.log(`${n} page(s) now in group "${name}".`);
}

async function set() {
  const [, target, status] = args;
  if (!target || !status || ![...MANUAL, 'auto'].includes(status)) throw new Error('Usage: plan.mjs set <path|group> <approved|issue|skipped|auto> [--note "..."]');
  const plan = await readJson(PLAN);
  const t = target.startsWith('/') ? normPath(target) : target;
  let n = 0;
  for (const p of plan.pages) {
    if (p.path !== t && p.group !== t) continue;
    if (status === 'auto') { p.manual = false; p.status = p.derived ?? 'todo'; p.note = ''; }
    else { p.manual = true; p.status = status; if (opt('note')) p.note = opt('note'); }
    n++;
  }
  await writeFile(PLAN, JSON.stringify(plan, null, 1));
  console.log(`${n} page(s) set to ${status}.`);
}

try {
  if (cmd === 'init') await init();
  else if (cmd === 'update') {
    const plan = await update();
    const c = {};
    for (const p of plan.pages) c[p.status] = (c[p.status] || 0) + 1;
    console.log(`${plan.pages.length} pages: ${Object.entries(c).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  } else if (cmd === 'set') await set();
  else if (cmd === 'group') await regroup();
  else await report();
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
