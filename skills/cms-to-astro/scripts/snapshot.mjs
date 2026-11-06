#!/usr/bin/env node
// Render pages in a real browser: full-page screenshots, computed design values, content extraction.
// Needs the `playwright` (or `playwright-core`) package in the current project. A browser is found in this
// order: Playwright's own Chromium (npx playwright install chromium), else the installed Google Chrome,
// else Microsoft Edge, so most users need no extra browser download.
//
//   node snapshot.mjs <url> [<url> ...] --out <dir> [--widths 1440,390] [--styles] [--content] [--interactions]

import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `Usage: node snapshot.mjs <url> [<url> ...] --out <dir> [options]

  --out <dir>          Output folder; one subfolder per page (named after the URL path)
  --urls-file <file>   Read URLs from a file (one per line) in addition to the arguments
  --widths <list>      Viewport widths for screenshots (default: 1440,390)
  --styles             Extract design values (colours, fonts, sizes, container widths,
                       breakpoints, theme effects) at the first width -> styles.json
  --content            Extract the main content as cleaned HTML -> content.html, plus meta,
                       images, links, headings, the visible text, the site structure (menu trees,
                       footer, an outline of the page's sections) and brand basics (logo, icons)
                       -> page.json (+ logo.svg for inline SVG logos), and the full rendered DOM
                       after scrolling -> raw.html (for page-builder layouts whose structure,
                       classes and data attributes the cleaned HTML drops)
  --interactions       Capture interaction states: hover styles of nav links, buttons and
                       linked images/cards (before/after values + element screenshots),
                       dropdown submenus, sticky header after scrolling, and the opened
                       mobile menu at phone widths -> interactions-<width>.json + PNGs
  --layout             Record the page's box structure: position, size, padding, margin, font and
                       colours of every visible block (sections, columns, headings, images, text
                       blocks), skipping wrappers with identical boxes -> layout-<width>.json.
                       Run on old and new to find spacing differences by number, not by eye.
  --precise            Layout values with one decimal (sub-pixel offsets) instead of whole pixels
  --measure <sels>     Measure specific elements: CSS selectors separated by ";;" (first 5 matches
                       each) -> measure-<width>.json
  --hide <sels>        Hide elements before capturing (CSS selectors, comma-separated), e.g. a cookie
                       banner: --hide "#klaro, .cookie-notice". Use the same on old and new captures.
  --hide-consent       Hide common cookie/consent banners (WebToffee, Cookiebot, Borlabs, Complianz,
                       CookieYes, Real Cookie Banner, Usercentrics, Klaro, OneTrust, Cookie Notice,
                       iubenda, consentmanager); combine with --hide for others. Never with --privacy.
  --click <sel>        Click an element after loading (e.g. a consent "Accept"/"Reject" button), then
                       capture. Ignored if the element doesn't exist.
  --no-animations      Force animations, transitions and scroll-reveal effects to their end state
                       (reduced motion + opacity/transform reset on hidden reveal elements). For stable
                       comparisons; don't use it when capturing interaction states.
  --css-rules <regex>  Dump stylesheet rules whose selector matches the regex, with their media query
                       -> css-rules.json (for themes whose sizes change by viewport; same-origin CSS only)
  --hover-shots        Also save element screenshots of hover states (with --interactions)
  --privacy            Record what a first visit without consent does: cookies, localStorage/
                       sessionStorage keys and every third-party host contacted -> privacy.json
  --no-screenshots     Skip full-page screenshots
  --wait <ms>          Extra wait after scrolling, before capturing (default: 800)
  --browser <name>     auto (default) | bundled | chrome | msedge
  --help               Show this help

Run it from the project folder; it finds playwright in .migration/tools (or the project itself).`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const valueFlags = new Set(['--out', '--urls-file', '--widths', '--wait', '--browser', '--measure', '--hide', '--click', '--css-rules']);
if (args.includes('--privacy') && (args.includes('--hide-consent') || args.includes('--hide') || args.includes('--click'))) {
  console.error('--privacy measures a first visit as is; run it without --hide, --hide-consent and --click.');
  process.exit(1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);
const urls = args.filter((a, i) => /^https?:\/\//.test(a) && !valueFlags.has(args[i - 1]));
if (opt('urls-file')) {
  const list = (await readFile(opt('urls-file'), 'utf8')).split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
  urls.push(...list);
}
const OUT = opt('out');
if (!OUT || !urls.length) {
  console.error('Need at least one URL and --out <dir>. See --help.');
  process.exit(1);
}
const WIDTHS = opt('widths', '1440,390').split(',').map(Number);
// Containers and overlays of common consent tools (hidden with --hide-consent).
const CONSENT_SELECTORS = [
  '.wcc-consent-container', '.wcc-overlay', '.cky-consent-container', '.cky-overlay', '#CybotCookiebotDialog',
  '#CybotCookiebotDialogBodyUnderlay', '#BorlabsCookieBox', '.BorlabsCookie', '#cmplz-cookiebanner-container',
  '.cmplz-cookiebanner', '#real-cookie-banner', '[id^="bnp-"]', '#usercentrics-root', '#uc-banner', '#klaro',
  '.klaro', '#onetrust-consent-sdk', '#cookie-notice', '#cookie-law-info-bar', '.cli-modal-backdrop', '#iubenda-cs-banner',
  '#cmpbox', '#cmpbox2', '.cmpboxBG', '#moove_gdpr_cookie_info_bar', '.cc-window', '.cc-banner', '#cookiescript_injected',
  '.tx-we-cookie-consent', '.cookieBar', '#cookieBar', '.cookie-bar', '#cookie-bar', '.cookiebar', '#cookie-consent', '.cookie-consent-banner',
].join(', ');
const WAIT = Number(opt('wait', 800));

// Resolve playwright from the migration tools folder (.migration/tools) or the current project,
// not from this script's folder.
let chromium;
outer: for (const base of [path.join(process.cwd(), '.migration', 'tools'), process.cwd()]) {
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      const req = createRequire(path.join(base, 'package.json'));
      const mod = await import(pathToFileURL(req.resolve(pkg)).href);
      chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) break outer;
    } catch {}
  }
}
if (!chromium) {
  console.error('Playwright not found. In the project folder run: npm i --prefix .migration/tools playwright turndown');
  process.exit(2);
}

async function launchBrowser() {
  const choice = opt('browser', 'auto');
  const tries = choice === 'auto' ? [null, 'chrome', 'msedge'] : [choice === 'bundled' ? null : choice];
  let lastError;
  for (const channel of tries) {
    try {
      const browser = await chromium.launch(channel ? { channel } : {});
      return { browser, used: channel ?? 'Playwright Chromium' };
    } catch (e) {
      lastError = e;
    }
  }
  console.error('No usable browser found. Either install Google Chrome, or run: npx playwright install chromium');
  console.error(String(lastError?.message || lastError).split('\n')[0]);
  process.exit(3);
}

const slugFor = (u) => {
  const p = new URL(u).pathname.replace(/\/+$/, '');
  return p ? p.slice(1).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120) : 'home';
};

async function autoScroll(page) {
  // Trigger lazy loading and scroll-reveal animations, then return to the top.
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.6));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
  });
}

function extractStyles() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // checkVisibility also accounts for hidden or transparent ancestors (e.g. hover overlays).
    if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const pick = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, textTransform: s.textTransform, color: s.color, backgroundColor: s.backgroundColor,
      sample: (el.textContent || '').trim().slice(0, 60),
    };
  };
  const first = (sel) => [...document.querySelectorAll(sel)].find((el) => vis(el) && (sel === 'body' || el.textContent.trim())) || null;
  const typography = {};
  for (const sel of ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main p, article p, .entry-content p, p', 'main a, article a, p a', 'nav a, header a', 'button, .button, .btn, input[type=submit]', 'footer', 'footer a', 'blockquote', 'figcaption, .wp-caption-text']) {
    typography[sel] = pick(first(sel));
  }

  const count = (map, k) => k && map.set(k, (map.get(k) || 0) + 1);
  const colors = new Map(), bgs = new Map(), fonts = new Map(), sizes = new Map(), widths = new Map(), radii = new Map();
  const all = [...document.querySelectorAll('body *')].slice(0, 6000);
  const vw = window.innerWidth;
  for (const el of all) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      count(colors, s.color);
      count(fonts, s.fontFamily);
      count(sizes, s.fontSize);
    }
    if (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) count(bgs, s.backgroundColor);
    if (s.borderRadius && s.borderRadius !== '0px') count(radii, s.borderRadius);
    const r = el.getBoundingClientRect();
    if (r.width >= 600 && r.width < vw - 8 && Math.abs(r.left - (vw - r.right)) <= 2) count(widths, Math.round(r.width));
  }
  const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, n]) => ({ value, n }));

  const fontFaces = new Set(), breakpoints = new Map();
  const stylesheets = [];
  for (const sheet of document.styleSheets) {
    stylesheets.push(sheet.href || '(inline)');
    let rules;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin
    const walk = (list) => {
      for (const rule of list) {
        if (rule instanceof CSSFontFaceRule) fontFaces.add(`${rule.style.getPropertyValue('font-family')} ${rule.style.getPropertyValue('font-weight') || ''} ${rule.style.getPropertyValue('font-style') || ''} :: ${rule.style.getPropertyValue('src').slice(0, 200)}`);
        if (rule instanceof CSSMediaRule) {
          for (const m of rule.conditionText.matchAll(/(min|max)-width:\s*([\d.]+)px/g)) count(breakpoints, `${m[1]}-width: ${m[2]}px`);
          walk(rule.cssRules);
        }
      }
    };
    walk(rules);
  }

  const effects = [];
  for (const el of document.querySelectorAll('[data-parallax-speed], [data-parallax], [class*="parallax"], [data-aos], .wow, [data-animation], [class*="reveal"], [class*="animate"]')) {
    const data = Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value.slice(0, 80)]));
    effects.push({ tag: el.tagName.toLowerCase(), class: (el.className && String(el.className).slice(0, 120)) || '', data, backgroundImage: getComputedStyle(el).backgroundImage.slice(0, 200), transform: getComputedStyle(el).transform });
    if (effects.length >= 40) break;
  }
  const fixed = [...document.querySelectorAll('body *')].filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position) && vis(el)).slice(0, 10)
    .map((el) => ({ tag: el.tagName.toLowerCase(), class: String(el.className).slice(0, 100), position: getComputedStyle(el).position }));
  const backgroundImages = [...new Set([...document.querySelectorAll('body *')].map((el) => getComputedStyle(el).backgroundImage).filter((b) => b && b !== 'none' && b.includes('url(')))].slice(0, 40);

  return {
    viewport: vw,
    typography,
    textColors: top(colors),
    backgroundColors: top(bgs),
    fontFamilies: top(fonts, 8),
    fontSizes: top(sizes, 12),
    borderRadii: top(radii, 6),
    centeredContainerWidths: top(widths, 5),
    breakpoints: top(breakpoints, 12),
    fontFaces: [...fontFaces].slice(0, 40),
    loadedFonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`))],
    stylesheets,
    effects,
    fixedOrSticky: fixed,
    backgroundImages,
  };
}

// Numbers that are computed or animated in the browser (count-up counters, "live" statistics): the
// text changes while you watch, or differs from the number stored in the markup. Neither is reliable
// content; the owner should provide the real figures.
async function detectComputedNumbers() {
  const sel = '[data-count], [data-countup], [data-count-to], [data-to], [data-target], [data-number], [data-value], [class*="counter" i], [class*="countup" i], [class*="count-up" i], [class*="odometer" i], [class*="numscroller" i]';
  const all = [...document.querySelectorAll(sel)].filter((el) => /\d/.test(el.textContent || '') && el.children.length < 4);
  const els = all.filter((el) => !all.some((o) => o !== el && el.contains(o))).slice(0, 40); // innermost only
  if (!els.length) return [];
  const first = els.map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  await new Promise((r) => setTimeout(r, 1500));
  return els.map((el, i) => {
    const now = el.textContent.replace(/\s+/g, ' ').trim();
    const stored = ['data-count', 'data-countup', 'data-count-to', 'data-to', 'data-target', 'data-number', 'data-value'].map((a) => el.getAttribute(a)).find((v) => v && /^[\d.,\s]+$/.test(v));
    const changing = now !== first[i];
    const differs = stored && stored.replace(/\D/g, '') !== now.replace(/\D/g, '');
    return changing || differs ? { shown: now.slice(0, 40), ...(changing ? { changedFrom: first[i].slice(0, 40) } : {}), ...(stored ? { inMarkup: stored } : {}), class: String(el.className).slice(0, 60) } : null;
  }).filter(Boolean);
}

function extractContent() {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return u; } };
  const isHidden = (el) => { const s = getComputedStyle(el); return s.display === 'none' || s.visibility === 'hidden'; };
  const candidates = ['main', '[role=main]', 'article', '.entry-content', '#content', '.content', '#main', '.site-content', '#page'].flatMap((s) => [...document.querySelectorAll(s)]);
  const textLen = (el) => (el.innerText || '').trim().length;
  let root = candidates.sort((a, b) => textLen(b) - textLen(a))[0] || document.body;
  if (textLen(root) < 200) root = document.body;

  // Mark hidden elements in the live DOM so the clone can drop them.
  for (const el of root.querySelectorAll('*')) if (isHidden(el)) el.setAttribute('data-snap-hidden', '');
  const clone = root.cloneNode(true);
  for (const el of root.querySelectorAll('[data-snap-hidden]')) el.removeAttribute('data-snap-hidden');

  clone.querySelectorAll('script, style, noscript, link, meta, svg[aria-hidden=true], [data-snap-hidden]').forEach((el) => el.remove());
  if (root === document.body) clone.querySelectorAll('header, footer, nav, #wpadminbar').forEach((el) => el.remove());
  const liveImgs = [...root.querySelectorAll('img')];
  const cloneImgs = [...clone.querySelectorAll('img')];
  cloneImgs.forEach((img, i) => { const live = liveImgs.find((l) => l.getAttribute('src') === img.getAttribute('src')) || liveImgs[i]; img.setAttribute('src', abs(live?.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || '')); });
  const KEEP = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'lang', 'id']);
  for (const el of clone.querySelectorAll('*')) {
    for (const a of [...el.attributes]) if (!KEEP.has(a.name)) el.removeAttribute(a.name);
    if (el.hasAttribute('href')) el.setAttribute('href', abs(el.getAttribute('href')));
  }
  // Drop wrapper soup: empty wrappers, then unwrap wrappers that only hold one element.
  for (let pass = 0; pass < 3; pass++) {
    for (const el of clone.querySelectorAll('div, span, section')) if (!el.textContent.trim() && !el.querySelector('img, iframe, video, picture, hr')) el.remove();
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const el of clone.querySelectorAll('div, span, section')) {
      const onlyChild = el.children.length === 1 && [...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim());
      if (onlyChild && !el.id) { el.replaceWith(el.firstElementChild); changed = true; }
    }
  }

  const largestFromSrcset = (srcset) => {
    if (!srcset) return null;
    const c = srcset.split(',').map((s) => s.trim().split(/\s+/)).map(([u, w]) => ({ u: abs(u), w: parseInt(w) || 0 }));
    return c.sort((a, b) => b.w - a.w)[0]?.u || null;
  };
  const images = [...document.querySelectorAll('img')].map((img) => ({
    src: abs(img.currentSrc || img.src), largest: largestFromSrcset(img.getAttribute('srcset')), alt: img.alt || '',
    width: img.naturalWidth, height: img.naturalHeight, inContent: root.contains(img),
  })).filter((i) => i.src && !i.src.startsWith('data:'));
  const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: abs(a.getAttribute('href')), text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80), internal: new URL(abs(a.getAttribute('href'))).hostname.replace(/^www\./, '') === location.hostname.replace(/^www\./, '') }));
  const headings = [...document.querySelectorAll('h1, h2, h3, h4')].filter((h) => !isHidden(h)).map((h) => `${h.tagName.toLowerCase()}: ${h.innerText.trim().slice(0, 100)}`);
  const nav = [...document.querySelectorAll('nav a, header a')].map((a) => ({ text: a.innerText.trim(), href: abs(a.getAttribute('href') || '') })).filter((a) => a.text);
  // What a visitor can actually see: text lines and links of visible elements only (hidden menus,
  // display:none blocks, transparent overlays excluded). compare.mjs diffs these between old and new.
  // Visible = has a size, isn't hidden or transparent, and isn't parked outside the page horizontally
  // (closed off-canvas menus sit at left:100%).
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })); };
  // innerText already skips display:none / visibility:hidden; additionally drop text of off-screen elements.
  const offscreen = [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left >= innerWidth || r.right <= 0); });
  const offText = new Set(offscreen.flatMap((el) => (el.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim())));
  const visibleTextLines = [...new Set((document.body.innerText || '').replace(/[\u200b\u00ad]/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1 && !offText.has(l)))].slice(0, 3000);
  const backgroundImages = [...new Set([...document.querySelectorAll('body *')].map((el) => getComputedStyle(el).backgroundImage).filter((b) => b && b.includes('url(')).flatMap((b) => [...b.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => abs(m[1]))))].slice(0, 60);
  const visibleLinks = [...document.querySelectorAll('a[href]')].filter(seen).map((a) => ({ href: abs(a.getAttribute('href')), text: (a.innerText || a.getAttribute('aria-label') || a.querySelector('img')?.alt || '').trim().replace(/\s+/g, ' ').slice(0, 80) }));
  const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute('content') || null;

  // Site structure, for building a new design on the same content (structure.mjs summarises it):
  // menu trees, footer, an outline of the main content's sections, and brand basics.
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })); };
  const clean = (s) => (s || '').replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();
  // A bare "#" or javascript: link is a toggle (e.g. a parent menu item that only opens its submenu).
  const linkOf = (a) => { const h = (a.getAttribute('href') || '').trim(); return { text: clean(a.innerText || a.textContent || a.getAttribute('aria-label') || a.querySelector('img')?.alt).slice(0, 80), href: !h || h === '#' || /^javascript:/i.test(h) ? '' : abs(h) }; };
  const tree = (list, depth = 0) => [...list.children].filter((li) => li.tagName === 'LI').map((li) => {
    const a = [...li.querySelectorAll('a')].find((x) => x.closest('li') === li);
    const sub = depth < 4 ? [...li.querySelectorAll('ul, ol')].find((u) => u.parentElement.closest('li') === li) : null;
    const label = a ? linkOf(a) : { text: clean([...li.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : /^(UL|OL)$/.test(n.tagName) ? '' : n.textContent)).join(' ')).slice(0, 80), href: '' };
    return { ...label, ...(sub ? { children: tree(sub, depth + 1) } : {}) };
  }).filter((n) => n.text || n.children?.length);
  const nodes = (t) => t.reduce((n, x) => n + 1 + nodes(x.children ?? []), 0);
  const footerEl = document.querySelector('footer, #colophon, .site-footer, [role=contentinfo]');
  const LANG = /^([a-z]{2}([-_][a-z]{2})?|deutsch|english|français|francais|italiano|español|espanol|nederlands|polski|čeština|magyar|português|русский|中文|日本語)$/i;
  const bySig = new Map();
  const menuEls = [];
  for (const list of document.querySelectorAll('header ul, nav ul, [role=navigation] ul, [class*="menu"] > ul')) {
    if (list.parentElement.closest('li') || list.querySelectorAll('a').length < 2 || (footerEl && footerEl.contains(list))) continue;
    const items = tree(list);
    if (!items.length) continue;
    const sig = JSON.stringify(items.map((n) => n.href || n.text));
    const isLang = items.every((n) => LANG.test(n.text)) || !!list.querySelector('a[hreflang]') || !!list.closest('[class*="lang" i], [aria-label*="sprach" i], [aria-label*="language" i]');
    // Floated items can give the list itself zero height: visible if any of its links is.
    const shownList = vis(list) || [...list.querySelectorAll('a')].some(vis);
    const entry = { where: isLang ? 'language switcher' : list.closest('header') ? 'header' : 'nav', visible: shownList, items };
    if (!isLang && shownList) menuEls.push(list);
    // The same menu often exists twice (desktop and mobile/off-canvas): keep the visible copy.
    if (!bySig.has(sig) || (entry.visible && !bySig.get(sig).visible)) bySig.set(sig, entry);
  }
  const menus = [...bySig.values()];
  if (!menus.some((m) => m.where !== 'language switcher')) {
    // Menus built from divs (page builders, off-canvas plugins): nesting depth = number of
    // submenu/dropdown containers around a link; a deeper link becomes a child of the one before it.
    const SUB = /(^|[-_\s])(sub|dropdown|children)/i;
    const seenLinks = new Set();
    const flat = [...document.querySelectorAll('nav a[href], header a[href], [class*="menu" i] a[href], [role=navigation] a[href]')]
      .filter((a) => !(footerEl && footerEl.contains(a)) && !a.closest('[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [class*="lang" i]') && clean(a.innerText || a.textContent))
      .map((a) => { let d = 0; for (let e = a.parentElement; e && e !== document.body; e = e.parentElement) if (SUB.test(String(e.className || ''))) d++; return { ...linkOf(a), d }; })
      .filter((l) => { const k = `${l.text}|${l.href}`; if (seenLinks.has(k)) return false; seenLinks.add(k); return true; });
    const min = Math.min(...flat.map((l) => l.d));
    const items = [], stack = [{ d: min - 1, children: items }];
    for (const l of flat.slice(0, 80)) {
      while (stack.length > 1 && stack[stack.length - 1].d >= l.d) stack.pop();
      const node = { text: l.text, href: l.href, d: l.d, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
    const strip = (t) => t.map(({ text, href, children }) => ({ text, href, ...(children.length ? { children: strip(children) } : {}) }));
    if (items.length) menus.push({ where: 'header/nav links (no list markup; nesting from submenu containers)', visible: true, items: strip(items) });
  }
  menus.sort((a, b) => ((a.where === 'language switcher') - (b.where === 'language switcher')) || (b.visible - a.visible) || (nodes(b.items) - nodes(a.items)));
  const footer = footerEl ? {
    textLines: [...new Set((footerEl.innerText || '').split('\n').map(clean).filter((l) => l.length > 1))].slice(0, 60),
    links: [...footerEl.querySelectorAll('a[href]')].filter(vis).map(linkOf).slice(0, 60),
  } : null;

  // Logo: score candidates (visible, named "logo", links to the home page, in the header, near the top,
  // not tiny); cookie-tool and footer logos are ignored. Image, inline SVG, or a CSS background on a link.
  const homeLink = (el) => { const a = el.closest('a[href]'); if (!a) return false; try { const u = new URL(a.href); return u.origin === location.origin && /^\/([a-z]{2}\/?)?$/.test(u.pathname); } catch { return false; } };
  const logoScore = (el) => {
    const r = el.getBoundingClientRect();
    const hint = /logo/i.test([el.getAttribute('src'), el.getAttribute('class'), el.getAttribute('alt'), el.id].join(' ')) || !!el.closest('[class*="logo" i], [id*="logo" i]');
    return (vis(el) ? 4 : 0) + (hint ? 3 : 0) + (homeLink(el) ? 2 : 0) + (el.closest('header, [role=banner]') ? 1 : 0) + (r.top < 250 ? 1 : 0) + (r.width >= 40 ? 1 : 0) + (/^(IMG|svg)$/.test(el.tagName) ? 1 : 0);
  };
  const logoEl = [...document.querySelectorAll('header img, header svg, a[rel="home"] img, a[rel="home"] svg, img[src*="logo" i], img[class*="logo" i], [class*="logo" i] img, [class*="logo" i] svg, [class*="logo" i] a, [id*="logo" i] img, [id*="logo" i] a')]
    .filter((el) => !el.closest('[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], footer, #colophon') && !el.parentElement?.closest('svg'))
    .map((el) => [el, logoScore(el)]).filter(([, s]) => s >= 8).sort((a, b) => b[1] - a[1])[0]?.[0];
  const lr = logoEl?.getBoundingClientRect();
  const shownAt = lr ? [Math.round(lr.width), Math.round(lr.height)] : null;
  const bgOf = (el) => [el, ...el.querySelectorAll('*')].flatMap((x) => [getComputedStyle(x).backgroundImage, getComputedStyle(x, '::before').backgroundImage]).find((b) => b && b.includes('url('))?.match(/url\(["']?([^"')]+)["']?\)/)?.[1];

  // Outline: descend through single-child wrappers, then each visible child is a section. A plain text
  // flow (classic editor: headings, paragraphs, images) is split at its main heading level instead.
  const FLOW = /^(H[1-6]|P|UL|OL|DL|FIGURE|IMG|PICTURE|BLOCKQUOTE|TABLE|PRE|HR|A|SPAN|STRONG|EM|B|I)$/;
  // Leave out the site header, navigation and footer, also when they are plain divs or sit inside the
  // content root: blocks holding the visible main menu or the logo with little text, a copyright bar.
  const bodyText = textLen(document.body) || 1;
  const holdsChrome = (c) => menuEls.some((m) => c.contains(m)) || (logoEl && c.contains(logoEl));
  const siteChrome = (c) => c.matches('footer, [role=contentinfo], #wpadminbar') || c === footerEl
    || (c.matches('header, nav, [role=banner], [role=navigation]') && (root === document.body || holdsChrome(c)))
    || (holdsChrome(c) && textLen(c) < bodyText * 0.25)
    || (footerEl && c.contains(footerEl) && textLen(c) < bodyText * 0.25)
    || (/©|copyright/i.test(c.innerText || '') && textLen(c) < 300);
  // Visible children; a zero-height container (floats inside, clearfix outside) is replaced by its children.
  const shown = (c) => !c.checkVisibility || c.checkVisibility({ visibilityProperty: true });
  const visKids = (el) => [...el.children].flatMap((c) => (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|BR)$/.test(c.tagName) || siteChrome(c) ? []
    : vis(c) ? [c] : shown(c) && c.children.length ? visKids(c) : []));
  const isFlow = (k) => k.length && k.filter((c) => FLOW.test(c.tagName)).length >= k.length * 0.6;
  const byHeadings = (k) => {
    const hTag = k.some((c) => c.tagName === 'H2') ? 'H2' : k.some((c) => c.tagName === 'H3') ? 'H3' : null;
    const out = [];
    for (const c of k) { if (!out.length || (hTag && c.tagName === hTag)) out.push([]); out[out.length - 1].push(c); }
    return out;
  };
  let level = root;
  for (let d = 0; d < 10; d++) { const k = visKids(level); if (k.length === 1 && !FLOW.test(k[0].tagName)) level = k[0]; else break; }
  const kids = visKids(level);
  let parts = isFlow(kids) ? byHeadings(kids) : kids.map((k) => [k]);
  // A tall block holding several rows (a page-builder wrapper around several sections): split it into
  // its rows. Children side by side (columns) form one row and stay together.
  const rowsOf = (el) => {
    let e = el;
    for (let d = 0; d < 6; d++) {
      const k = visKids(e);
      if (k.length === 1) { e = k[0]; continue; }
      if (k.length < 2 || isFlow(k)) return null;
      const rows = [];
      let bottom = -Infinity;
      for (const c of k) {
        const r = c.getBoundingClientRect();
        if (!rows.length || r.top >= bottom - 4) { rows.push([c]); bottom = r.bottom; } else { rows[rows.length - 1].push(c); bottom = Math.max(bottom, r.bottom); }
      }
      // A uniform grid (rows of equally many items, maybe below a short heading row) is one section.
      const body = rows[0].length === 1 && rows[0][0].getBoundingClientRect().height < 150 ? rows.slice(1) : rows;
      const n = body[0]?.length ?? 0;
      if (body.length >= 2 && n >= 2 && body.slice(0, -1).every((r) => r.length === n) && body[body.length - 1].length <= n) return null;
      return rows.length >= 2 ? rows : null;
    }
    return null;
  };
  for (let pass = 0; pass < 2; pass++) {
    parts = parts.flatMap((p) => {
      if (p.length !== 1 || p[0].getBoundingClientRect().height < innerHeight * 1.5) return [p];
      return rowsOf(p[0]) ?? [p];
    });
  }
  const levelWidth = level.getBoundingClientRect().width || innerWidth;
  const stats = parts.slice(0, 60).map((els) => {
    const q = (sel) => els.flatMap((e) => [...(e.matches(sel) ? [e] : []), ...e.querySelectorAll(sel)]).filter(vis);
    const text = clean(els.map((e) => e.innerText).join(' '));
    const h = q('h1, h2, h3, h4')[0];
    const iframes = q('iframe').map((f) => f.src).filter(Boolean);
    // Widest row of side-by-side boxes narrower than 60% of the section (the part's own elements, or
    // children of any element inside): columns or cards.
    const rowCount = (rects) => rects.filter((r) => Math.abs(r.top - rects[0].top) < 4 && r.width < levelWidth * 0.6 && r.height > 40).length;
    let columns = els.length > 1 ? Math.max(1, rowCount(els.map((e) => e.getBoundingClientRect()))) : 1;
    for (const e of els.flatMap((x) => [x, ...x.querySelectorAll('*')]).slice(0, 400)) {
      const cs = [...e.children].filter(vis);
      if (cs.length >= 2) columns = Math.max(columns, rowCount(cs.map((c) => c.getBoundingClientRect())));
    }
    return {
      heading: h ? `${h.tagName.toLowerCase()}: ${clean(h.innerText).slice(0, 80)}` : null,
      words: text ? text.split(' ').length : 0,
      images: q('img, svg[role=img]').filter((im) => im.getBoundingClientRect().width >= 40).length,
      links: q('a[href]').length,
      buttons: q('button, input[type=submit], a[class*="button"], a[class*="btn"], .wp-block-button a').length,
      columns,
      height: Math.round(els.reduce((n, e) => n + e.getBoundingClientRect().height, 0)),
      backgroundImage: els.some((e) => [e, ...e.querySelectorAll('*')].slice(0, 150).some((x) => getComputedStyle(x).backgroundImage.includes('url('))),
      forms: q('form').length,
      videos: q('video').length + iframes.filter((s) => /youtube|vimeo/.test(s)).length,
      maps: iframes.filter((s) => /maps|openstreetmap|mapbox/.test(s)).length,
      iframes,
    };
  }).filter((s) => s.words || s.images || s.forms || s.iframes.length);
  // Consecutive rows of the same grid (same column count, each with images) are one section.
  const merged = [];
  for (const s of stats) {
    const prev = merged[merged.length - 1];
    if (prev && s.columns >= 2 && s.columns === prev.columns && s.images && prev.images && !s.forms && !prev.forms) {
      for (const k of ['words', 'images', 'links', 'buttons', 'height', 'forms', 'videos', 'maps']) prev[k] += s[k];
      prev.iframes.push(...s.iframes);
      prev.backgroundImage ||= s.backgroundImage;
      prev.rows = (prev.rows ?? 1) + 1;
    } else merged.push({ ...s, iframes: [...s.iframes] });
  }
  const outline = merged.slice(0, 40).map((s, i) => {
    const kind = s.forms ? 'form' : s.maps ? 'map' : s.videos && s.words < 80 ? 'video'
      : s.images >= 4 && s.words < s.images * 15 ? 'gallery'
      : i === 0 && (s.backgroundImage || s.images) && s.words < 80 ? 'hero'
      : s.columns >= 3 ? 'cards' : s.columns === 2 && s.images ? 'image-text'
      : s.words ? 'text' : s.images ? 'image' : 'other';
    const { backgroundImage, forms, videos, maps, iframes, ...rest } = s;
    return { kind, ...rest, ...(backgroundImage ? { backgroundImage } : {}), ...(forms ? { forms } : {}), ...(iframes.length ? { iframes: iframes.slice(0, 3) } : {}) };
  });

  const brand = {
    siteName: meta('og:site_name'),
    logo: !logoEl ? null
      : logoEl.tagName.toLowerCase() === 'svg' ? { inlineSvg: logoEl.outerHTML.slice(0, 300000), shownAt }
      : logoEl.tagName === 'IMG' ? { src: abs(logoEl.currentSrc || logoEl.src), largest: largestFromSrcset(logoEl.getAttribute('srcset')), alt: logoEl.alt || '', shownAt }
      : bgOf(logoEl) ? { backgroundImage: abs(bgOf(logoEl)), text: clean(logoEl.innerText).slice(0, 80), shownAt }
      : { text: clean(logoEl.innerText).slice(0, 80), shownAt, note: 'text logo or image set by CSS the script could not read' },
    icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')].map((l) => ({ rel: l.getAttribute('rel'), href: abs(l.getAttribute('href')), sizes: l.getAttribute('sizes') })),
    themeColor: meta('theme-color'),
  };

  // Translations of this page (hreflang alternates) and its publication date, if the page states one:
  // article:published_time, JSON-LD datePublished, or the first <time datetime> in the content.
  const alternates = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => ({ lang: l.getAttribute('hreflang'), href: abs(l.getAttribute('href') || '') })).filter((a) => a.href);
  let published = meta('article:published_time');
  if (!published) {
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const find = (o) => (!o || typeof o !== 'object' ? null : o.datePublished || (Array.isArray(o) ? o.map(find).find(Boolean) : find(o['@graph'])));
        published = find(JSON.parse(sc.textContent));
        if (published) break;
      } catch {}
    }
  }
  // A single <time> in the content is the page's date; several are a list (teasers), not this page's date.
  const times = root.querySelectorAll('time[datetime]');
  published ||= times.length === 1 ? times[0].getAttribute('datetime') : null;
  // Visible text outside the content root that isn't header, menu or footer (a hero, badges, logos
  // placed above <main>): the converted Markdown misses it, so list it for the person building the page.
  const chrome = [...document.querySelectorAll('header, footer, nav, [role=banner], [role=contentinfo], [role=navigation]'), ...menuEls, ...(footerEl ? [footerEl] : [])];
  const linesOf = (el) => (el.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
  const inRoot = new Set(linesOf(root));
  const inChrome = new Set(chrome.flatMap(linesOf));
  const textOutsideContent = root === document.body ? [] : visibleTextLines.filter((l) => !inRoot.has(l) && !inChrome.has(l)).slice(0, 60);

  return {
    meta: { title: document.title, description: meta('description'), ogImage: meta('og:image'), canonical: document.querySelector('link[rel=canonical]')?.href || null, lang: document.documentElement.lang || null, alternates, published },
    textOutsideContent,
    contentRoot: root === document.body ? 'body (no main element found)' : `${root.tagName.toLowerCase()}${root.id ? '#' + root.id : ''}${root.className ? '.' + String(root.className).trim().split(/\s+/).slice(0, 3).join('.') : ''}`,
    textLength: textLen(root),
    headings, nav, menus: menus.slice(0, 4), footer, outline, brand, images, backgroundImages, links, visibleTextLines, visibleLinks,
    iframes: [...document.querySelectorAll('iframe')].map((f) => abs(f.src)).filter(Boolean),
    html: clone.innerHTML.replace(/\n\s*\n+/g, '\n'),
  };
}

function extractLayout(precise = false) {
  const MAX = 700;
  const PROPS = ['display', 'position', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'gap', 'maxWidth', 'fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'textTransform', 'textAlign', 'color', 'backgroundColor', 'borderTopWidth', 'borderBottomWidth'];
  const BORING = new Set(['0px', 'normal', 'none', 'auto', 'rgba(0, 0, 0, 0)', 'static', 'block', 'start', '400', 'left']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TEMPLATE', 'BR']);
  const TEXTY = /^(H[1-6]|P|LI|A|BUTTON|FIGCAPTION|BLOCKQUOTE|LABEL|DT|DD|TD|TH|SPAN)$/;
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
  const out = [];
  const round = (v) => (precise ? Math.round(v * 10) / 10 : Math.round(v));
  const textOf = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const walk = (el, depth, parentRect, parentEntry) => {
    for (const child of el.children) {
      if (out.length >= MAX) return;
      if (SKIP.has(child.tagName)) continue;
      const r = child.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { walk(child, depth, parentRect, parentEntry); continue; }
      const s = getComputedStyle(child);
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      const sameBox = parentRect && ['top', 'left', 'width', 'height'].every((k) => Math.abs(r[k] - parentRect[k]) < 1);
      const blockish = /block|flex|grid|table|list-item/.test(s.display) || child.tagName === 'IMG';
      if (sameBox && parentEntry && (TEXTY.test(child.tagName) || child.tagName === 'IMG')) {
        // Same box as the recorded wrapper: keep the wrapper's box, but the inner element's text,
        // image and typography (that's what the visitor sees and what a rebuild must match).
        parentEntry.el += ` > ${label(child)}`;
        if (TEXTY.test(child.tagName)) parentEntry.text = textOf(child);
        if (child.tagName === 'IMG') parentEntry.src = (child.currentSrc || child.src).split('/').pop().slice(0, 60);
        for (const p of PROPS) if (!BORING.has(s[p])) parentEntry[p] = s[p];
        if (!TEXTY.test(child.tagName) || child.tagName === 'LI') walk(child, depth, parentRect, parentEntry);
      } else if (!sameBox && blockish && r.height >= 4) {
        const entry = { depth, el: label(child), x: round(r.left), y: round(r.top + scrollY), w: round(r.width), h: round(r.height) };
        if (TEXTY.test(child.tagName)) entry.text = textOf(child);
        if (child.tagName === 'IMG') entry.src = (child.currentSrc || child.src).split('/').pop().slice(0, 60);
        for (const p of PROPS) if (!BORING.has(s[p])) entry[p] = s[p];
        out.push(entry);
        if (!TEXTY.test(child.tagName) || child.tagName === 'LI') walk(child, depth + 1, r, entry);
      } else {
        walk(child, depth, sameBox ? parentRect : r, sameBox ? parentEntry : null);
      }
    }
  };
  walk(document.body, 0, null, null);
  return { viewport: innerWidth, pageHeight: document.documentElement.scrollHeight, truncated: out.length >= MAX, blocks: out };
}

function measureSelectors(selectors) {
  const PROPS = ['display', 'position', 'top', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'width', 'height', 'maxWidth', 'fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'letterSpacing', 'textTransform', 'color', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'borderRadius', 'boxShadow', 'opacity', 'transform', 'zIndex'];
  const result = {};
  for (const sel of selectors) {
    let els = [];
    try { els = [...document.querySelectorAll(sel)].slice(0, 5); } catch (e) { result[sel] = { error: String(e.message) }; continue; }
    result[sel] = els.map((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || '').trim().slice(0, 50), ...Object.fromEntries(PROPS.map((p) => [p, s[p]])) };
    });
  }
  return result;
}

async function captureInteractions(page, dir, width) {
  const out = { width, hoverRuleCount: 0, hoverRuleSamples: [], hover: [], submenus: [], stickyHeader: null, mobileMenu: null };
  const isPhone = width <= 600;

  // Which selectors have :hover styles at all (from same-origin stylesheets)?
  const hoverRules = await page.evaluate(() => {
    const sels = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => { for (const r of list) { if (r.selectorText?.includes(':hover')) sels.add(r.selectorText.slice(0, 160)); if (r.cssRules) walk(r.cssRules); } };
      walk(rules);
    }
    return [...sels];
  });
  out.hoverRuleCount = hoverRules.length;
  out.hoverRuleSamples = hoverRules.slice(0, 40);

  const visible = (h) => h.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  }).catch(() => false);

  if (!isPhone) {
    // Hover states: record computed style changes on the element and its children, plus a screenshot.
    // Mark repeated image tiles (cards in a grid: >= 3 siblings with the same class) so they can be hovered.
    await page.evaluate(() => {
      let n = 0;
      const seenGrids = new Set();
      for (const img of document.querySelectorAll('img')) {
        if (n >= 3) break;
        const r = img.getBoundingClientRect();
        if (r.width < 150 || img.closest('header, nav, footer')) continue;
        let node = img;
        for (let up = 0; up < 6 && node.parentElement; up++) {
          const parent = node.parentElement;
          const same = [...parent.children].filter((c) => c.className && c.className === node.className);
          if (node !== img && same.length >= 3) {
            if (!seenGrids.has(parent) || n === 0) {
              node.setAttribute('data-snap-tile', String(++n));
              seenGrids.add(parent);
            }
            break;
          }
          node = parent;
        }
      }
    });
    const groups = { 'nav-link': 'nav a, header a', button: 'button, .button, .btn, a[class*="button"], input[type=submit]', 'image-tile': '[data-snap-tile]' };
    const PROPS = ['color', 'backgroundColor', 'opacity', 'visibility', 'transform', 'scale', 'translate', 'rotate', 'boxShadow', 'textDecorationLine', 'borderColor', 'filter'];
    for (const [kind, sel] of Object.entries(groups)) {
      let n = 0;
      for (const h of await page.$$(sel)) {
        if (n >= 3) break;
        if (!(await visible(h))) continue;
        const ok = await h.evaluate((el, kind) => {
          if (kind === 'nav-link') return !!el.innerText.trim();
          if (kind === 'image-tile') return true;
          return true;
        }, kind);
        if (!ok) continue;
        try {
          await h.scrollIntoViewIfNeeded();
          // For cards, hover effects often live on a wrapper (overlay siblings), so measure the card.
          const read = () => h.evaluate((el, [props, kind]) => {
            const root = el;
            const r = (e) => { const s = getComputedStyle(e); return Object.fromEntries(props.map((p) => [p, s[p]])); };
            const kids = [...root.querySelectorAll('*')].slice(0, 60);
            return { self: r(el), kids: kids.map(r), names: kids.map((k) => `${k.tagName.toLowerCase()}.${String(k.className).trim().split(/\s+/)[0] || ''}`) };
          }, [PROPS, kind]);
          const before = await read();
          // Tile effects usually hang on the image or its link (a:hover img), so hover the image itself.
          const target = kind === 'image-tile' ? (await h.$('img')) ?? h : h;
          await target.hover({ timeout: 3000 });
          await page.waitForTimeout(500);
          const after = await read();
          const diff = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => [k, [a[k], b[k]]]));
          const changes = diff(before.self, after.self);
          const childChanges = before.kids.map((b, i) => ({ element: before.names[i], ...diff(b, after.kids[i] || b) })).filter((d) => Object.keys(d).length > 1).slice(0, 6);
          const label = await h.evaluate((el) => (el.innerText || el.getAttribute('aria-label') || el.querySelector('img')?.alt || '').trim().slice(0, 60));
          const file = path.join(dir, `hover-${kind}-${n + 1}-${width}.png`);
          if (has('hover-shots')) await h.screenshot({ path: file }).catch(() => {});
          out.hover.push({ kind, label, changes, childChanges, screenshot: has('hover-shots') ? file : null });
          await page.mouse.move(0, 0);
          await page.waitForTimeout(200);
          n++;
        } catch {}
      }
    }

    // Dropdown submenus: hover top-level items that contain a nested list.
    let m = 0;
    for (const h of await page.$$('nav li:has(ul) > a, header li:has(ul) > a')) {
      if (m >= 3) break;
      if (!(await visible(h))) continue;
      try {
        await page.evaluate(() => window.scrollTo(0, 0));
        await h.hover({ timeout: 3000 });
        await page.waitForTimeout(500);
        const label = (await h.innerText()).trim().slice(0, 60);
        const file = path.join(dir, `submenu-${m + 1}-${width}.png`);
        await page.screenshot({ path: file });
        out.submenus.push({ label, screenshot: file });
        await page.mouse.move(0, 0);
        m++;
      } catch {}
    }

    // Sticky / fixed header after scrolling.
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, Math.min(800, document.documentElement.scrollHeight)));
    await page.waitForTimeout(700);
    const sticky = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((el) => {
        // A header: at the top, inside the viewport, visible, and not taller than half the window
        // (excludes closed off-canvas panels and full-screen overlays).
        const r = el.getBoundingClientRect();
        return ['fixed', 'sticky'].includes(getComputedStyle(el).position) && r.top <= 1 && r.height > 20 && r.height < innerHeight * 0.5 && r.left < innerWidth && r.right > 0 && el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true });
      })
      .slice(0, 3).map((el) => {
        // The visible background often sits on a child (e.g. an inner bar), so report the first painted one.
        const painted = [el, ...el.querySelectorAll('*')].slice(0, 50).find((e) => !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor));
        return { tag: el.tagName.toLowerCase(), class: String(el.className).slice(0, 100), position: getComputedStyle(el).position, height: Math.round(el.getBoundingClientRect().height), background: painted ? getComputedStyle(painted).backgroundColor : 'transparent', backgroundOn: painted && painted !== el ? `${painted.tagName.toLowerCase()}.${String(painted.className).trim().split(/\s+/)[0] || ''}` : 'self' };
      }));
    const file = path.join(dir, `scrolled-${width}.png`);
    await page.screenshot({ path: file });
    out.stickyHeader = { elements: sticky, screenshot: file };
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // Menu toggle (hamburger): always at phone widths; on desktop only when no inline menu links are
  // visible (some themes use the off-canvas menu everywhere).
  const inlineNav = await page.evaluate(() => [...document.querySelectorAll('nav a, header a')].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.top < 200 && r.left >= 0 && r.right <= innerWidth && a.innerText.trim() && a.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }); }).length);
  if (isPhone || inlineNav < 2) {
    // Heuristic for icon toggles without telling names: a small element near the top with 2-4 thin bars.
    await page.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.top > 160 || r.width < 16 || r.width > 80 || r.height < 12 || r.height > 80 || !el.checkVisibility?.()) continue;
        const kids = [...el.children];
        const bars = kids.filter((k) => { const b = k.getBoundingClientRect(); return b.height > 0 && b.height <= 5 && b.width >= 12; });
        if (kids.length >= 2 && kids.length <= 4 && bars.length === kids.length) el.setAttribute('data-snap-toggle', String(++n));
      }
    });
    const toggleSel = ['button[aria-label*="menu" i]', 'button[aria-label*="menü" i]', 'button[aria-controls]', '[aria-expanded="false"]', '.menu-toggle', '.navbar-toggler', '[class*="hamburger"]', '[class*="burger"]', '[class*="mobile-menu-button"]', '[class*="mobile-menu"] a', '[class*="menu-button"]', '[class*="menu-trigger"]', '[class*="menu-toggle"]', '[class*="trigger"]', '[class*="toggle"]', '[id*="menu-toggle"]', '[data-snap-toggle]'].join(', ');
    // Rank candidates: visible, inside the viewport, near the top, not a link to another page;
    // bar icons and anything named menu/burger/nav first. Try at most five.
    const count = await page.evaluate((sel) => {
      const cands = [];
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 12 || r.height < 12 || r.width > 160 || r.height > 120 || r.top > 200 || r.left < 0 || r.right > innerWidth) continue;
        if (!el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) continue;
        const href = el.closest('a')?.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) continue;
        const name = `${el.className} ${el.id} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        const score = (el.hasAttribute('data-snap-toggle') ? 3 : 0) + (/menu|menü|burger|nav/.test(name) ? 3 : 0) + (el.tagName === 'BUTTON' ? 1 : 0);
        cands.push([score, el]);
      }
      cands.sort((a, b) => b[0] - a[0]);
      cands.slice(0, 5).forEach(([, el], i) => el.setAttribute('data-snap-cand', String(i + 1)));
      return Math.min(cands.length, 5);
    }, toggleSel);
    for (let i = 1; i <= count && !out.mobileMenu; i++) {
      const h = await page.$(`[data-snap-cand="${i}"]`);
      if (!h) continue;
      try {
        await page.evaluate(() => window.scrollTo(0, 0));
        const urlBefore = page.url();
        await h.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        if (page.url() !== urlBefore) { await page.goBack().catch(() => {}); continue; }
        const file = path.join(dir, `menu-open-${width}.png`);
        await page.screenshot({ path: file });
        const desc = await h.evaluate((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().split(/\s+/).slice(0, 2).join('.') : ''}`);
        out.mobileMenu = { toggle: desc, screenshot: file };
      } catch {}
    }
    if (!out.mobileMenu) out.mobileMenu = { toggle: null, note: 'No menu toggle found or it could not be clicked; check manually.' };
  }
  await writeFile(path.join(dir, `interactions-${width}.json`), JSON.stringify(out, null, 2));
  return out;
}

// Registrable-domain approximation: last two labels (good enough for .com/.at/.de; not for .co.uk-style).
const siteOf = (host) => host.replace(/^www\./, '').split('.').slice(-2).join('.');

async function collectPrivacy(page, url, requests) {
  const own = siteOf(new URL(url).hostname);
  const hosts = new Map();
  for (const r of requests) {
    let host;
    try { host = new URL(r.url).hostname; } catch { continue; }
    if (!host || siteOf(host) === own) continue;
    const h = hosts.get(host) ?? { host, requests: 0, types: new Set() };
    h.requests++;
    h.types.add(r.type);
    hosts.set(host, h);
  }
  const cookies = (await page.context().cookies()).map((c) => ({
    name: c.name,
    domain: c.domain,
    firstParty: siteOf(c.domain.replace(/^\./, '')) === own,
    expires: c.expires > 0 ? `${Math.round((c.expires * 1000 - Date.now()) / 86400000)} days` : 'session',
  }));
  const storage = await page.evaluate(() => {
    const keys = (s) => { try { return Object.keys(s); } catch { return []; } };
    return { localStorage: keys(localStorage), sessionStorage: keys(sessionStorage) };
  });
  return {
    url,
    note: 'First visit in a fresh browser profile, page scrolled, no clicks (no consent given).',
    thirdPartyHosts: [...hosts.values()].map((h) => ({ ...h, types: [...h.types] })).sort((a, b) => b.requests - a.requests),
    cookies,
    ...storage,
  };
}

const { browser, used: browserUsed } = await launchBrowser();
console.log(`Browser: ${browserUsed}`);
const results = [];
for (const url of urls) {
  const slug = slugFor(url);
  const dir = path.join(OUT, slug);
  await mkdir(dir, { recursive: true });
  const record = { url, slug, files: [] };
  for (const [i, width] of WIDTHS.entries()) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }); // fresh context = first visit
    const requests = [];
    if (i === 0 && has('privacy')) page.on('request', (req) => requests.push({ url: req.url(), type: req.resourceType() }));
    try {
      if (has('no-animations')) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => page.goto(url, { waitUntil: 'load', timeout: 60000 }));
      if (opt('click')) {
        await page.click(opt('click'), { timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      const hideSel = [opt('hide'), has('hide-consent') ? CONSENT_SELECTORS : null].filter(Boolean).join(', ');
      if (hideSel) await page.addStyleTag({ content: `${hideSel} { display: none !important; } html, body { overflow: auto !important; }` }).catch(() => {});
      await autoScroll(page);
      if (has('no-animations')) {
        await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }' });
        // Scroll-reveal libraries leave not-yet-revealed elements at opacity 0 / shifted; show them.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('body *')) {
            const s = getComputedStyle(el);
            if (Number(s.opacity) === 0 && el.getBoundingClientRect().height > 0 && !el.closest('[aria-hidden="true"], dialog, [role="dialog"]')) {
              const looksLikeReveal = /reveal|animate|aos|wow|fade|appear|inview|scroll/i.test(String(el.className) + ' ' + [...el.attributes].map((a) => a.name).join(' '));
              if (looksLikeReveal) { el.style.setProperty('opacity', '1', 'important'); el.style.setProperty('transform', 'none', 'important'); }
            }
          }
        });
      }
      await page.waitForTimeout(WAIT);
      if (!has('no-screenshots')) {
        const file = path.join(dir, `${width <= 600 ? 'phone' : 'desktop'}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        record.files.push(file);
      }
      if (i === 0 && has('styles')) {
        const styles = await page.evaluate(extractStyles);
        await writeFile(path.join(dir, 'styles.json'), JSON.stringify(styles, null, 2));
        record.files.push(path.join(dir, 'styles.json'));
      }
      if (i === 0 && has('content')) {
        const computedNumbers = await page.evaluate(detectComputedNumbers);
        const { html, ...pageData } = await page.evaluate(extractContent);
        if (computedNumbers.length) pageData.computedNumbers = computedNumbers;
        if (pageData.brand?.logo?.inlineSvg) {
          await writeFile(path.join(dir, 'logo.svg'), pageData.brand.logo.inlineSvg);
          pageData.brand.logo = { file: 'logo.svg', shownAt: pageData.brand.logo.shownAt };
        }
        await writeFile(path.join(dir, 'raw.html'), await page.content());
        await writeFile(path.join(dir, 'content.html'), html);
        await writeFile(path.join(dir, 'page.json'), JSON.stringify({ url, ...pageData }, null, 2));
        record.files.push(path.join(dir, 'content.html'), path.join(dir, 'page.json'));
        record.textLength = pageData.textLength;
        record.contentRoot = pageData.contentRoot;
      }
      if (has('layout')) {
        const layout = await page.evaluate(extractLayout, has('precise'));
        await writeFile(path.join(dir, `layout-${width}.json`), JSON.stringify(layout, null, 1));
        record.files.push(path.join(dir, `layout-${width}.json`));
      }
      if (i === 0 && opt('css-rules')) {
        const rules = await page.evaluate((src) => {
          const re = new RegExp(src);
          const out = [];
          for (const sheet of document.styleSheets) {
            let list;
            try { list = sheet.cssRules; } catch { continue; }
            const walk = (rules, media) => {
              for (const r of rules) {
                if (r.selectorText && re.test(r.selectorText)) out.push({ media: media || null, selector: r.selectorText, css: r.style.cssText, sheet: (sheet.href || '(inline)').split('/').pop() });
                if (r.cssRules) walk(r.cssRules, r.conditionText || r.media?.mediaText || media);
              }
            };
            walk(list, null);
            if (out.length > 2000) break;
          }
          return out;
        }, opt('css-rules'));
        await writeFile(path.join(dir, 'css-rules.json'), JSON.stringify(rules, null, 1));
        record.files.push(path.join(dir, 'css-rules.json'));
      }
      if (opt('measure')) {
        const sels = opt('measure').split(';;').map((x) => x.trim()).filter(Boolean);
        const measured = await page.evaluate(measureSelectors, sels);
        await writeFile(path.join(dir, `measure-${width}.json`), JSON.stringify(measured, null, 1));
        record.files.push(path.join(dir, `measure-${width}.json`));
      }
      if (i === 0 && has('privacy')) {
        const priv = await collectPrivacy(page, url, requests);
        await writeFile(path.join(dir, 'privacy.json'), JSON.stringify(priv, null, 2));
        record.files.push(path.join(dir, 'privacy.json'));
        record.privacy = { thirdPartyHosts: priv.thirdPartyHosts.length, cookies: priv.cookies.length };
      }
      if (has('interactions')) {
        const r = await captureInteractions(page, dir, width);
        record.interactions ??= [];
        record.interactions.push({ width, hover: r.hover.length, submenus: r.submenus.length, mobileMenu: r.mobileMenu?.toggle ?? null, sticky: r.stickyHeader?.elements?.length ?? null });
      }
    } catch (e) {
      record.error = String(e.message || e);
    } finally {
      await page.close();
    }
  }
  results.push(record);
  console.log(`${record.error ? '✗' : '✓'} ${url} -> ${dir}${record.contentRoot ? ` (content: ${record.contentRoot}, ${record.textLength} chars)` : ''}${record.error ? ` ERROR: ${record.error}` : ''}`);
}
await browser.close();
// Keep a log across runs (later runs replace entries for the same URL).
const previous = JSON.parse(await readFile(path.join(OUT, 'snapshots.json'), 'utf8').catch(() => '[]'));
const merged = [...previous.filter((p) => !results.some((r) => r.url === p.url)), ...results];
await writeFile(path.join(OUT, 'snapshots.json'), JSON.stringify(merged, null, 2));
