#!/usr/bin/env node
// Inventory of a live website: CMS, theme, plugins, URL list, features that need a decision.
// No dependencies; Node >= 22 (global fetch).
//
//   node inventory.mjs https://example.com [--out inventory.json] [--max-pages 300] [--concurrency 4]

const HELP = `Usage: node inventory.mjs <site-url> [options]

  --out <file>          Write the full inventory JSON here (default: inventory.json)
  --max-pages <n>       Max pages to fetch and scan for features (default: 300)
  --max-urls <n>        Max URLs to collect from sitemaps/crawl (default: 5000)
  --concurrency <n>     Parallel requests (default: 4)
  --help                Show this help

Prints a Markdown summary to stdout.`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const startUrl = new URL(args.find((a) => !a.startsWith('--') && /^https?:/.test(a)) ?? args[0]);
const OUT = opt('out', 'inventory.json');
const MAX_PAGES = Number(opt('max-pages', 300));
const MAX_URLS = Number(opt('max-urls', 5000));
const CONCURRENCY = Number(opt('concurrency', 4));
const UA = 'Mozilla/5.0 (compatible; site-inventory/0.1; static-migration)';

// ---------- helpers ----------
async function get(url, { asText = true } = {}) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const body = asText ? await res.text() : null;
    return { ok: res.ok, status: res.status, url: res.url, headers: res.headers, body };
  } catch (e) {
    return { ok: false, status: 0, url, headers: new Headers(), body: '', error: String(e.message || e) };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

const uniq = (xs) => [...new Set(xs)];
const sameHost = (u, base) => {
  try {
    const a = new URL(u, base);
    return a.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
};
const normalize = (u) => {
  const x = new URL(u);
  x.hash = '';
  return x.toString();
};
const ASSET_RE = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3|webm|css|js|json|xml|txt|woff2?|ttf|eot|kml|kmz|gpx|rss|atom|csv|ics)(\?|$)/i;

// ---------- 1. home page + CMS detection ----------
const home = await get(startUrl.toString());
if (!home.ok) {
  console.error(`Could not load ${startUrl}: ${home.status} ${home.error ?? ''}`);
  process.exit(2);
}
const base = new URL(home.url);
const html = home.body;
const generators = [...html.matchAll(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/gi)].map((m) => m[1]);
// Only a generator tag that names a CMS (plugins like "Site Kit" or "Elementor" add their own).
const generator = generators.find((g) => /^(wordpress|typo3|joomla|drupal|ghost|contao|craft|wix|squarespace|webflow|jimdo)/i.test(g)) ?? null;

const CMS_SIGNS = [
  ['WordPress', [/\/wp-content\//, /\/wp-includes\//, /api\.w\.org/, /generator[^>]+WordPress/i]],
  ['TYPO3', [/generator[^>]+TYPO3/i, /\/typo3temp\//, /\/typo3conf\//, /This website is powered by TYPO3/i]],
  ['Joomla', [/generator[^>]+Joomla/i, /\/media\/jui\//, /\/components\/com_/]],
  ['Drupal', [/generator[^>]+Drupal/i, /\/sites\/default\/files\//, /data-drupal-/, /Drupal\.settings/]],
  ['Wix', [/static\.wixstatic\.com/, /wix-code/i, /_wixCssImports/]],
  ['Squarespace', [/static1\.squarespace\.com/, /Squarespace/]],
  ['Jimdo', [/jimdo/i, /jimcdn\.com/]],
  ['Webflow', [/data-wf-site/, /webflow\.js/, /assets\.website-files\.com/]],
  ['Shopify', [/cdn\.shopify\.com/, /Shopify\.theme/]],
  ['Ghost', [/generator[^>]+Ghost/i, /ghost-(portal|sdk)/]],
  ['Contao', [/generator[^>]+Contao/i, /\/assets\/contao\//]],
  ['Craft CMS', [/generator[^>]+Craft/i]],
];
let cms = 'unknown (possibly static HTML or a custom system)';
for (const [name, res] of CMS_SIGNS) {
  if (res.some((r) => r.test(html))) {
    cms = name;
    break;
  }
}

const headers = Object.fromEntries(
  ['server', 'x-powered-by', 'x-generator', 'x-pingback', 'link'].map((h) => [h, home.headers.get(h)]).filter(([, v]) => v),
);

// ---------- 2. WordPress API ----------
let wpApi = null;
if (cms === 'WordPress') {
  const api = new URL('/wp-json/', base).toString();
  const root = await get(api);
  wpApi = { available: root.ok && root.body.trim().startsWith('{'), endpoint: api, totals: {}, types: [] };
  if (wpApi.available) {
    try {
      const types = JSON.parse((await get(new URL('/wp-json/wp/v2/types', base))).body || '{}');
      wpApi.types = Object.values(types)
        .filter((t) => t && t.rest_base && !['wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face', 'nav_menu_item'].includes(t.slug))
        .map((t) => ({ slug: t.slug, rest_base: t.rest_base, name: t.name }));
    } catch {}
    const bases = uniq(['pages', 'posts', 'media', 'categories', 'tags', ...wpApi.types.map((t) => t.rest_base)]);
    for (const b of bases) {
      const r = await get(new URL(`/wp-json/wp/v2/${b}?per_page=1`, base));
      const total = r.headers.get('x-wp-total');
      if (total !== null) wpApi.totals[b] = Number(total);
    }
  }
}

// ---------- 3. URL discovery: sitemaps, else crawl ----------
const skippedForeignSitemaps = [];
async function sitemapUrls() {
  const candidates = [];
  const robots = await get(new URL('/robots.txt', base));
  // Only this site's sitemaps: shared hosting often lists other customers' sitemaps in one robots.txt.
  if (robots.ok) {
    for (const m of robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
      if (sameHost(m[1], base)) candidates.push(m[1]);
      else skippedForeignSitemaps.push(m[1]);
    }
  }
  candidates.push(...['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/page-sitemap.xml'].map((p) => new URL(p, base).toString()));
  const seenMaps = new Set();
  const urls = new Set();
  const queue = uniq(candidates);
  const found = [];
  while (queue.length && urls.size < MAX_URLS) {
    const sm = queue.shift();
    if (seenMaps.has(sm)) continue;
    seenMaps.add(sm);
    const r = await get(sm);
    if (!r.ok || !/<(urlset|sitemapindex)/i.test(r.body)) continue;
    found.push(sm);
    const locs = [...r.body.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(r.body)) queue.push(...locs.filter((l) => sameHost(l, base)));
    else for (const l of locs) {
      if (urls.size >= MAX_URLS) break;
      if (sameHost(l, base) && !ASSET_RE.test(l)) urls.add(normalize(l));
    }
  }
  return { sitemaps: found, urls: [...urls] };
}

async function crawl(limit) {
  const seen = new Set([normalize(base.toString())]);
  const queue = [base.toString()];
  const pages = [];
  while (queue.length && pages.length < limit) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await pool(batch, CONCURRENCY, (u) => get(u));
    for (const r of results) {
      if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) continue;
      pages.push(normalize(r.url));
      for (const m of r.body.matchAll(/href=["']([^"'#]+)["']/gi)) {
        let abs;
        try {
          abs = normalize(new URL(m[1], r.url).toString());
        } catch {
          continue;
        }
        if (!sameHost(abs, base) || ASSET_RE.test(abs) || /\/(wp-admin|wp-login|wp-json|feed)\b|\?replytocom=|\/xmlrpc\.php/.test(abs)) continue;
        if (!seen.has(abs)) {
          seen.add(abs);
          queue.push(abs);
        }
      }
    }
  }
  return pages;
}

let { sitemaps, urls } = await sitemapUrls();
let discovery = 'sitemap';
if (!urls.length) {
  discovery = 'crawl (no sitemap found)';
  urls = await crawl(Math.min(MAX_URLS, 1000));
}

// Pages linked from the home page (menus, footer) and language alternates (hreflang) that the
// sitemap doesn't list: noindex pages, other languages with their own sitemap, forgotten pages.
const notInSitemap = [];
{
  // Same page if host (without www), path (without trailing slash) and query match; protocol ignored.
  const slashless = (u) => { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}${x.search}`; };
  const known = new Set(urls.map((u) => slashless(normalize(u))));
  const add = (u, why) => {
    const n = normalize(u);
    if (known.has(slashless(n)) || !sameHost(n, base) || ASSET_RE.test(n) || /\/(wp-admin|wp-login|wp-json|feed)\b|\?replytocom=|\/xmlrpc\.php|#/.test(n)) return;
    known.add(slashless(n));
    urls.push(n);
    notInSitemap.push({ url: n, why });
  };
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try { add(new URL(m[1], base).toString(), 'linked from the home page'); } catch {}
  }
  for (const m of html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)) {
    const href = (m[0].match(/href=["']([^"']+)/i) || [])[1];
    if (href && /hreflang=/i.test(m[0])) try { add(new URL(href, base).toString(), 'language version (hreflang)'); } catch {}
  }
}
urls = uniq([normalize(base.toString()), ...urls]);

// URL classification: real content vs. generated archive pages
function classify(u) {
  const p = new URL(u).pathname + new URL(u).search;
  if (/\/(category|tag|author|[a-z]+_(category|cat|tag|type))\//.test(p)) return 'archive';
  if (/\/page\/\d+\/?$|[?&]paged?=\d+/.test(p)) return 'archive';
  if (/\/\d{4}\/(\d{2}\/)?(\d{2}\/)?$/.test(p)) return 'archive';
  if (/\/feed\/?$|\/attachment\/|[?&]attachment_id=/.test(p)) return 'generated';
  if (/\/\d{4}\/\d{2}\/(\d{2}\/)?[^/]+\/?$/.test(p) || /\/(blog|news|aktuelles|neuigkeiten)\/[^/]+\/?$/.test(p)) return 'post';
  return 'page';
}
const classified = urls.map((u) => ({ url: u, kind: classify(u) }));

// ---------- 4. scan pages for features ----------
const FEATURES = [
  // [category, label, regex]
  ['forms', 'Contact Form 7', /wpcf7/],
  ['forms', 'Gravity Forms', /gform_wrapper|gravityforms/],
  ['forms', 'WPForms', /wpforms/],
  ['forms', 'Ninja Forms', /ninja-forms/],
  ['forms', 'Formidable Forms', /frm_forms|formidable/],
  ['forms', 'Elementor form', /elementor-form/],
  ['forms', 'TYPO3 powermail / form', /powermail|tx-form|typo3-form/],
  ['forms', 'Generic <form> (non-search)', /<form(?![^>]*(role=["']search|searchform|search-form))[^>]*>/i],
  ['newsletter', 'Mailchimp / MC4WP', /mc4wp|mailchimp|list-manage\.com/],
  ['newsletter', 'Brevo / Sendinblue', /sendinblue|brevo/i],
  ['newsletter', 'CleverReach', /cleverreach/i],
  ['search', 'Site search', /role=["']search|name=["']s["']|type=["']search|searchform|search-form|ivory-search/],
  ['comments', 'Comments', /id=["']comments["']|comment-form|comment-respond|disqus/],
  ['shop', 'WooCommerce', /woocommerce|add_to_cart|wc-block/],
  ['shop', 'Shopify / other shop embed', /shopify-buy|ecwid|snipcart/i],
  ['members', 'Login / member area', /wp-login\.php|memberpress|ultimate-member|felogin|\/login\b/],
  ['sliders', 'Slider Revolution', /revslider|rev_slider/],
  ['sliders', 'LayerSlider', /layerslider/i],
  ['sliders', 'Master Slider', /masterslider/],
  ['sliders', 'Smart Slider', /smart-slider|n2-ss-/],
  ['sliders', 'Swiper / Slick / Flexslider', /swiper|slick-slider|slick-track|flexslider|owl-carousel/],
  ['galleries', 'Gallery plugin', /envira|ngg-gallery|nextgen|foogallery|modula|wp-block-gallery|gallery-item|elementor-gallery/],
  ['galleries', 'Lightbox', /lightbox|fancybox|photoswipe|magnific|ilightbox|data-lightbox|strip\.js/i],
  ['maps', 'Google Maps', /maps\.google\.|google\.com\/maps|maps\.googleapis|wpgmp|wp-google-map/],
  ['maps', 'OpenStreetMap / Leaflet', /openstreetmap|leaflet/i],
  ['video', 'YouTube', /youtube\.com\/embed|youtube-nocookie|youtu\.be/],
  ['video', 'Vimeo', /player\.vimeo\.com/],
  ['booking', 'Booking / calendar widget', /<iframe[^>]+(calendly|simplybook|doctolib|eventbrite|bookingkit|timify|etermin)|calendly-inline-widget|bookly-form|amelia-(app|booking)|tribe-events|simplybook-widget/i],
  ['multilingual', 'hreflang alternates (translated versions)', /hreflang=/i],
  ['multilingual', 'Translation plugin (WPML / Polylang / TranslatePress)', /wpml|polylang|pll_|trp-language|translatepress/i],
  ['multilingual', 'Translation service (Weglot)', /weglot/i],
  ['multilingual', 'Live machine translation (GTranslate / Google widget): no stored translations', /gtranslate|translate\.google\.com\/translate_a|google_translate_element/i],
  ['tracking', 'Google Analytics / Tag Manager', /googletagmanager|google-analytics|gtag\(/],
  ['tracking', 'Matomo', /matomo|piwik/i],
  ['tracking', 'Meta Pixel', /connect\.facebook\.net|fbq\(/],
  ['tracking', 'Hotjar / Clarity', /hotjar|clarity\.ms/],
  ['consent', 'Cookie banner', /cookiebot|borlabs|complianz|cookie-notice|cookieyes|usercentrics|klaro|cookie-law-info|moove_gdpr/i],
  ['captcha', 'reCAPTCHA / hCaptcha', /recaptcha|hcaptcha/],
  ['fonts', 'Google Fonts (GDPR issue in the EU)', /fonts\.googleapis\.com|fonts\.gstatic\.com/],
  ['fonts', 'Adobe Fonts', /use\.typekit\.net/],
  ['social', 'Social feed embed', /instagram-feed|sbi_|smash-balloon|twitter-timeline|elfsight/i],
  ['downloads', 'File downloads (PDF etc.)', /href=["'][^"']+\.(pdf|docx?|xlsx?|zip)["']/i],
];
const PAGE_BUILDERS = [
  ['Elementor', /elementor/],
  ['Divi', /et_pb_|et-boc/],
  ['WPBakery', /vc_row|wpb_wrapper|js_composer/],
  ['Beaver Builder', /fl-builder|fl-row/],
  ['GoodLayers', /gdlr-core/],
  ['Avada / Fusion', /fusion-builder|fusion-layout/],
  ['Oxygen', /oxygen-|ct-section/],
  ['Bricks', /brxe-/],
  ['SiteOrigin', /panel-grid|siteorigin/],
  ['Gutenberg blocks', /wp-block-/],
];

// Language prefixes (/en/, /de-at/): a dimension, not a content type. A 2-letter first segment counts
// as a language prefix when at least 3 URLs use it.
const LANG_SEG = /^[a-z]{2}([-_][a-z]{2})?$/i;
const langPrefixes = new Set();
// Recomputed once more pages are known (language versions often arrive via links and hreflang).
const refreshLangPrefixes = () => {
  const c = {};
  for (const x of classified) {
    const seg = new URL(x.url).pathname.split('/').filter(Boolean)[0];
    if (seg && LANG_SEG.test(seg)) c[seg] = (c[seg] || 0) + 1;
  }
  for (const [k, n] of Object.entries(c)) if (n >= 3) langPrefixes.add(k);
};
refreshLangPrefixes();
const segsNoLang = (u) => {
  const seg = new URL(u).pathname.split('/').filter(Boolean);
  return seg.length && langPrefixes.has(seg[0]) ? seg.slice(1) : seg;
};
// Sample round-robin across URL groups (content types, languages) so a capped scan still sees every kind of page.
const groupKey = (u) => {
  const seg = new URL(u).pathname.split('/').filter(Boolean);
  return seg.length ? `${langPrefixes.has(seg[0]) ? seg[0] + ':' : ''}${segsNoLang(u)[0] ?? '/'}` : '/';
};
const buckets = new Map();
for (const c of classified.filter((c) => c.kind === 'page' || c.kind === 'post')) {
  const k = groupKey(c.url);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(c);
}
const scanTargets = [];
const homeEntry = classified.find((c) => c.url === normalize(base.toString()));
if (homeEntry) scanTargets.push(homeEntry);
for (let round = 0; scanTargets.length < MAX_PAGES; round++) {
  let added = false;
  for (const list of buckets.values()) {
    if (round < list.length && scanTargets.length < MAX_PAGES && list[round] !== homeEntry) {
      scanTargets.push(list[round]);
      added = true;
    }
  }
  if (!added) break;
}
const features = {};
const plugins = new Set();
const themes = new Set();
const builders = new Set();
const iframes = new Set();
const externalScripts = new Set();
let scanned = 0;
// Stop words for a cheap "which language is this text" check against <html lang>.
const STOP = {
  de: 'der die und das ist mit für nicht auf ein eine zu den von wir sie dem des im sich auch',
  en: 'the and of to is in for with on our we are this that you be as by from',
  fr: 'le la les et des est pour une dans nous vous avec sur du au par qui',
  it: 'il di che per con una sono del della non gli nel dei alla questo',
  es: 'el los las para con una es por del que nuestro como más sus este',
  nl: 'de het een en van is dat op te zijn voor met niet ook wij uw',
  pt: 'o os as de do da em para com uma não por mais dos das nosso',
  pl: 'i w na z do nie się jest że to dla od po przez oraz jak',
  cs: 'a je v na se že s z do pro jako by jsou které ale',
  hu: 'a az és hogy nem egy is van meg csak ezt mint vagy',
  ro: 'și în de la cu pe pentru nu sunt care este din mai',
  hr: 'i u je na se da za od s su ili kao koji ne',
  tr: 've bir bu için ile da de olarak daha çok gibi en',
  sv: 'och att det som en är på för med av till inte vi',
};
// Non-Latin scripts: if most letters are in one of these, the text is not a Latin-script language.
const SCRIPTS = [['Cyrillic (ru/uk/bg/sr)', /\p{Script=Cyrillic}/gu, /^(ru|uk|bg|sr|mk|be|kk)/i], ['Greek', /\p{Script=Greek}/gu, /^el/i], ['Arabic', /\p{Script=Arabic}/gu, /^(ar|fa|ur)/i], ['Hebrew', /\p{Script=Hebrew}/gu, /^he/i], ['Chinese/Japanese', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, /^(zh|ja)/i], ['Korean', /\p{Script=Hangul}/gu, /^ko/i], ['Thai', /\p{Script=Thai}/gu, /^th/i]];
const STOP_SETS = Object.fromEntries(Object.entries(STOP).map(([l, w]) => [l, new Set(w.split(' '))]));
const langMismatch = [];
const mediaFiles = new Set();
// Categories whose normal form IS a script/stylesheet/link (no visible markup needed to count as used).
const ASSET_IS_USE = new Set(['tracking', 'consent', 'fonts', 'captcha', 'multilingual']);
const htmlLangs = {};
const hreflangSets = new Map();
let failed = [];

// Links found on scanned pages: list pages (news, projects, events) often link to detail pages that
// neither the sitemap nor the home page lists.
const linkedFrom = new Map();
const queryLinks = new Set();
const scanPage = async ({ url }) => {
  const r = url === normalize(base.toString()) ? home : await get(url);
  if (!r.ok) {
    failed.push({ url, status: r.status });
    return;
  }
  scanned++;
  const h = r.body;
  for (const m of h.matchAll(/<a\b[^>]*\shref=["']([^"'#]+)["']/gi)) {
    let u;
    try { u = new URL(m[1].replace(/&amp;/g, '&'), url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || !sameHost(u.toString(), base) || ASSET_RE.test(u.pathname) || /\/(wp-admin|wp-login|wp-json|feed)\b|\/typo3\/|\/xmlrpc\.php|\/(fileadmin|uploads|wp-content|typo3temp)\//.test(u.pathname)) continue;
    if (u.search) { queryLinks.add(u.pathname + u.search); continue; } // filters, paging, legacy ids: not followed
    const n = normalize(u.toString());
    if (!linkedFrom.has(n)) linkedFrom.set(n, url);
  }
  for (const m of h.matchAll(/\/wp-content\/plugins\/([a-z0-9._-]+)\//gi)) plugins.add(m[1]);
  for (const m of h.matchAll(/\/wp-content\/themes\/([a-z0-9._-]+)\//gi)) themes.add(m[1]);
  for (const m of h.matchAll(/\/typo3conf\/ext\/([a-z0-9._-]+)\//gi)) plugins.add(`typo3:${m[1]}`);
  for (const m of h.matchAll(/<iframe[^>]+src=["']([^"']+)/gi)) {
    try {
      iframes.add(new URL(m[1], url).hostname);
    } catch {}
  }
  for (const m of h.matchAll(/<script[^>]+src=["']([^"']+)/gi)) {
    try {
      const host = new URL(m[1], url).hostname;
      if (!sameHost(`https://${host}`, base)) externalScripts.add(host);
    } catch {}
  }
  for (const [name, re] of PAGE_BUILDERS) if (re.test(h)) builders.add(name);
  const lang = (h.match(/<html[^>]*\slang=["']([^"']+)/i) || [])[1];
  if (lang) htmlLangs[lang] = (htmlLangs[lang] || 0) + 1;
  {
    const text = h.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').toLowerCase();
    const letters = (text.match(/\p{L}/gu) || []).length;
    const script = letters > 200 && SCRIPTS.find(([, re]) => (text.match(re) || []).length > letters * 0.4);
    if (script) {
      if (lang && !script[2].test(lang)) langMismatch.push({ url, lang, textLooks: script[0] });
    } else {
      const words = text.match(/\p{L}+/gu) || [];
      const scores = Object.entries(STOP_SETS).map(([l, set]) => [l, words.filter((w) => set.has(w)).length]).sort((a, b) => b[1] - a[1]);
      const [[top, n1], [, n2]] = scores;
      if (lang && n1 >= 15 && n1 > 1.8 * n2 && !lang.toLowerCase().startsWith(top)) langMismatch.push({ url, lang, textLooks: top });
    }
  }
  const alts = [...h.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)]
    .map((m) => [(m[0].match(/hreflang=["']([^"']+)/i) || [])[1], (m[0].match(/href=["']([^"']+)/i) || [])[1]])
    .filter(([l, href]) => l && href);
  if (alts.length) hreflangSets.set(url, alts);
  for (const m of h.matchAll(/<(video|source|audio)\b[^>]*\ssrc=["']([^"']+)["']/gi)) {
    try { mediaFiles.add(new URL(m[2], url).toString()); } catch {}
  }
  // "Used" = visible markup: opening tags in <body> (no scripts, styles, links, comments, no text).
  // "Loaded" = the plugin's files or code in <head> or <script>/<link> tags: installed, maybe unused.
  const bodyStart = h.search(/<body[\s>]/i);
  const headPart = bodyStart >= 0 ? h.slice(0, bodyStart) : '';
  const bodyPart = bodyStart >= 0 ? h.slice(bodyStart) : h;
  const bodyNoCode = bodyPart
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Skip <body>/<html> themselves: plugins add marker classes there (e.g. "_masterslider") without any visible element.
  const uiTags = (bodyNoCode.match(/<(?!link\b|body\b|html\b)[a-z][^>]*>/gi) || []).join('\n');
  const assetText = [headPart, ...(bodyPart.match(/<script\b[\s\S]*?<\/script>|<link\b[^>]*>|<style\b[\s\S]*?<\/style>/gi) || [])].join('\n');
  for (const [cat, label, re] of FEATURES) {
    const used = re.test(uiTags) || (ASSET_IS_USE.has(cat) && re.test(assetText));
    const loaded = !used && re.test(assetText);
    if (!used && !loaded) continue;
    features[cat] ??= {};
    const f = (features[cat][label] ??= { used: { count: 0, pages: [] }, loadedOnly: { count: 0, pages: [] } });
    const bucket = used ? f.used : f.loadedOnly;
    bucket.count++;
    if (bucket.pages.length < 20) bucket.pages.push(url);
  }
};
await pool(scanTargets, CONCURRENCY, scanPage);
// Follow links to pages nobody listed, in rounds (list page -> detail pages -> ...), within the cap.
let linkRounds = 0, unscannedLinked = 0;
{
  const slashless = (u) => { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}`; };
  const known = new Set(classified.map((c) => slashless(c.url)));
  let total = scanTargets.length;
  for (let round = 0; round < 4; round++) {
    const fresh = [...linkedFrom.entries()].filter(([u]) => !known.has(slashless(u)));
    if (!fresh.length) break;
    linkRounds++;
    const batch = [];
    for (const [u, from] of fresh) {
      known.add(slashless(u));
      classified.push({ url: u, kind: classify(u) });
      notInSitemap.push({ url: u, why: `linked from ${new URL(from).pathname}` });
      if (total < MAX_PAGES) { batch.push({ url: u }); total++; } else unscannedLinked++;
    }
    await pool(batch, CONCURRENCY, scanPage);
  }
}

// Generic form only matters if no specific form plugin was found on the same page
if (features.forms?.['Generic <form> (non-search)']) {
  const specific = new Set(Object.entries(features.forms).filter(([k]) => !k.startsWith('Generic')).flatMap(([, v]) => v.used.pages));
  const generic = features.forms['Generic <form> (non-search)'];
  generic.used.pages = generic.used.pages.filter((u) => !specific.has(u));
  generic.used.count = Math.min(generic.used.count, generic.used.pages.length || 0);
  if (!generic.used.count && !generic.loadedOnly.count) delete features.forms['Generic <form> (non-search)'];
}

// Used on (almost) every page = part of the header/footer or a site-wide element.
for (const cat of Object.values(features)) {
  for (const f of Object.values(cat)) {
    f.sitewide = scanned >= 5 && f.used.count >= 0.9 * scanned;
  }
}

// Language versions referenced by hreflang on scanned pages but missing from the URL list.
{
  const known = new Set(classified.map((c) => c.url));
  for (const alts of hreflangSets.values()) {
    for (const [l, href] of alts) {
      if (l === 'x-default') continue;
      let n;
      try { n = normalize(new URL(href, base).toString()); } catch { continue; }
      if (!known.has(n) && sameHost(n, base)) {
        known.add(n);
        classified.push({ url: n, kind: 'page' });
        notInSitemap.push({ url: n, why: `language version (hreflang ${l})` });
      }
    }
  }
}

refreshLangPrefixes();
const homeLang = ((html.match(/<html[^>]*\slang=["']([^"']+)/i) || [])[1] || '').slice(0, 2).toLowerCase() || null;
// Content-type group per URL, the same for all languages: a translated page (/en/solutions/x) joins the
// group of its unprefixed version (/leistungen/x) via hreflang; otherwise the first segment after the
// language prefix decides. plan.mjs and the urls-<group>.txt files use it.
{
  const slashless = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/$/, '')}`; } catch { return u; } };
  const defaultVersion = new Map();
  for (const [page, alts] of hreflangSets) {
    const urlsOf = [page, ...alts.map(([, href]) => { try { return new URL(href, page).toString(); } catch { return null; } }).filter(Boolean)];
    const main = urlsOf.find((u) => { const seg = new URL(u).pathname.split('/').filter(Boolean)[0]; return !seg || !langPrefixes.has(seg); });
    if (main) for (const u of urlsOf) if (!defaultVersion.has(slashless(u))) defaultVersion.set(slashless(u), main);
  }
  for (const c of classified) {
    const seg = segsNoLang(defaultVersion.get(slashless(c.url)) ?? c.url);
    c.group = !seg.length ? 'home' : /^\d{4}$/.test(seg[0]) ? 'posts-dated' : seg.length === 1 ? 'pages' : seg[0].replace(/[^a-z0-9_-]+/gi, '-');
    const first = new URL(c.url).pathname.split('/').filter(Boolean)[0];
    if (first && langPrefixes.has(first)) c.lang = first;
    else if (langPrefixes.size && homeLang) c.lang = homeLang; // unprefixed pages are in the home page's language
  }
}
const kinds = classified.reduce((acc, c) => ((acc[c.kind] = (acc[c.kind] || 0) + 1), acc), {});
// Group content URLs by first path segment: reveals content types (e.g. /portfolio/, /team/, /events/).
const urlGroups = {};
for (const c of classified.filter((c) => c.kind === 'page' || c.kind === 'post')) {
  const key = c.group === 'home' ? '/' : c.group === 'posts-dated' ? '/YYYY/… (dated posts)' : c.group === 'pages' ? '/<single page>' : `/${c.group}/…`;
  urlGroups[key] = (urlGroups[key] || 0) + 1;
}
// Large self-hosted media: hosts have per-file limits (Cloudflare: 25 MiB) and git gets heavy.
const largeMedia = [];
for (const u of [...mediaFiles].filter((u) => sameHost(u, base)).slice(0, 40)) {
  try {
    const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    const size = Number(r.headers.get('content-length') || 0);
    if (size) largeMedia.push({ url: u, mb: +(size / 1048576).toFixed(1) });
  } catch {}
}
largeMedia.sort((a, b) => b.mb - a.mb);

// Language picture: html lang values, hreflang clusters, language-like URL prefixes.
const prefixCounts = {};
for (const c of classified) {
  const seg = new URL(c.url).pathname.split('/').filter(Boolean)[0];
  if (seg && /^[a-z]{2}(-[a-z]{2})?$/i.test(seg)) prefixCounts[seg] = (prefixCounts[seg] || 0) + 1;
}
const hreflangLangs = {};
for (const alts of hreflangSets.values()) for (const [l] of alts) hreflangLangs[l] = (hreflangLangs[l] || 0) + 1;
const languages = {
  htmlLangs,
  hreflangLanguages: hreflangLangs,
  pagesWithHreflang: hreflangSets.size,
  hreflangClusters: [...hreflangSets.entries()].slice(0, 50).map(([page, alts]) => ({ page, alternates: Object.fromEntries(alts) })),
  languagePrefixes: [...langPrefixes],
  urlPrefixes: prefixCounts,
};
const langKinds = Object.keys(htmlLangs).map((l) => l.slice(0, 2).toLowerCase());
languages.multipleLanguages = new Set(langKinds).size > 1 || Object.keys(hreflangLangs).filter((l) => l !== 'x-default').length > 1 || Object.keys(prefixCounts).length > 0;

const inventory = {
  site: base.toString(),
  scannedAt: new Date().toISOString(),
  cms,
  generator,
  headers,
  theme: [...themes],
  pageBuilders: [...builders],
  languages,
  langMismatch,
  plugins: [...plugins].sort(),
  wpApi,
  discovery,
  sitemaps,
  urlCounts: kinds,
  notInSitemap,
  skippedForeignSitemaps,
  mediaFiles: largeMedia,
  urlGroups,
  urls: classified,
  // Every scanned page's hreflang alternates (absolute URLs): plan.mjs groups translations together.
  translations: Object.fromEntries([...hreflangSets.entries()].map(([page, alts]) => [page, Object.fromEntries(alts.map(([l, href]) => { try { return [l, new URL(href, page).toString()]; } catch { return [l, href]; } }))])),
  queryLinksNotFollowed: queryLinks.size,
  pagesScanned: scanned,
  pagesFailed: failed,
  features,
  iframeHosts: [...iframes].sort(),
  externalScriptHosts: [...externalScripts].sort(),
};

const { writeFile, mkdir } = await import('node:fs/promises');
const pathMod = await import('node:path');
const outDir = pathMod.dirname(OUT);
await mkdir(outDir, { recursive: true });
await writeFile(OUT, JSON.stringify(inventory, null, 2));

// One URL list per content group, for snapshot.mjs --urls-file (e.g. urls-portfolio.txt, urls-pages.txt).
// All languages of a group go into the same list (language prefixes are not groups).
const groupFiles = {};
for (const c of classified.filter((c) => c.kind === 'page' || c.kind === 'post')) (groupFiles[c.group] ??= []).push(c.url);
for (const [name, list] of Object.entries(groupFiles)) await writeFile(pathMod.join(outDir, `urls-${name}.txt`), list.join('\n') + '\n');
inventory.urlFiles = Object.keys(groupFiles).map((n) => `urls-${n}.txt`);

// ---------- 5. Markdown summary ----------
const lines = [];
lines.push(`# Inventory: ${base.host}`, '');
lines.push(`- **CMS:** ${cms}${generator ? ` (generator: ${generator})` : ''}`);
if (themes.size) lines.push(`- **Theme:** ${[...themes].join(', ')}`);
if (builders.size) lines.push(`- **Page builder / blocks:** ${[...builders].join(', ')}`);
if (wpApi) lines.push(`- **WordPress REST API:** ${wpApi.available ? 'available' : 'not reachable'}${Object.keys(wpApi.totals).length ? ` — ${Object.entries(wpApi.totals).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}`);
lines.push(`- **URLs found:** ${classified.length} (${discovery}${notInSitemap.length ? ` + ${notInSitemap.length} not in the sitemap` : ''}) — ${Object.entries(kinds).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
if (skippedForeignSitemaps.length) lines.push(`- **Sitemaps of other sites in robots.txt (ignored):** ${skippedForeignSitemaps.length}`);
if (notInSitemap.length) lines.push(`- **Pages not in the sitemap but linked or language versions:** ${notInSitemap.length} (added), e.g. ${notInSitemap.slice(0, 4).map((n) => `${new URL(n.url).pathname} (${n.why})`).join(', ')}`);
if (largeMedia.length) lines.push(`- **Self-hosted video/audio:** ${largeMedia.length} file(s)${largeMedia.filter((m) => m.mb > 20).length ? `, ${largeMedia.filter((m) => m.mb > 20).length} over 20 MB (largest ${largeMedia[0].mb} MB): too big for some hosts, see incompatibilities.md` : ''}`);
lines.push(`- **URL groups (content types):** ${Object.entries(urlGroups).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
if (wpApi?.available) {
  const restTypes = new Set(wpApi.types.map((t) => t.slug));
  const candidates = Object.keys(urlGroups).filter((k) => /^\/[a-z0-9_-]+\/…$/.test(k) && !restTypes.has(k.slice(1, -2)) && !['category', 'tag'].includes(k.slice(1, -2)));
  // A group like /services/… may just be child pages: ask the API for one page of the group by slug.
  const unexposed = [];
  for (const g of candidates) {
    const sample = classified.find((c) => new URL(c.url).pathname.startsWith(g.slice(0, -1)) && new URL(c.url).pathname.split('/').filter(Boolean).length > 1);
    const slug = sample && new URL(sample.url).pathname.split('/').filter(Boolean).pop();
    const r = slug ? await get(new URL(`/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id`, base)) : null;
    let isPage = false;
    try { isPage = !!(r?.ok && JSON.parse(r.body).length); } catch {}
    if (!isPage) unexposed.push(g);
  }
  if (unexposed.length) lines.push(`- **Not in the REST API (take from rendered pages):** ${unexposed.join(', ')} — custom content types without API access`);
}
lines.push(`- **Pages scanned for features and links:** ${scanned}${failed.length ? ` (${failed.length} failed)` : ''}${scanTargets.length >= MAX_PAGES || unscannedLinked ? ` — capped at ${MAX_PAGES}${unscannedLinked ? `; ${unscannedLinked} linked pages found but not scanned, so pages linked only from them are unknown (rerun with a higher --max-pages)` : ''}` : ''}`);
if (linkRounds) lines.push(`- **Pages found only through links on other pages** (list pages → detail pages): ${notInSitemap.filter((n) => n.why.startsWith('linked from /') && n.why !== 'linked from the home page').length}, in ${linkRounds} round(s)`);
if (queryLinks.size) lines.push(`- **Links with query strings not followed:** ${queryLinks.size} (filters, paging or legacy ids such as ?id=12; check whether any of them are real pages)`);
if (plugins.size) lines.push(`- **Plugins / extensions seen in the HTML:** ${[...plugins].sort().join(', ')}`);
if (iframes.size) lines.push(`- **Embedded iframes from:** ${[...iframes].sort().join(', ')}`);
if (externalScripts.size) lines.push(`- **External scripts from:** ${[...externalScripts].sort().join(', ')}`);
{
  const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', ') || 'none';
  if (langMismatch.length) lines.push(`- **Language attribute looks wrong** on ${langMismatch.length} page(s): marked "${langMismatch[0].lang}", text looks "${langMismatch[0].textLooks}" (e.g. ${langMismatch[0].url}). Matters for screen readers, SEO and search stemming; fix it in the new site.`);
  lines.push(`- **Languages:** html lang: ${fmt(htmlLangs)}; hreflang: ${fmt(hreflangLangs)}${Object.keys(prefixCounts).length ? `; URL prefixes: ${fmt(prefixCounts)}` : ''} → ${languages.multipleLanguages ? 'multilingual, see references/multilingual.md' : 'single language (check pages for mixed-language content)'}`);
}
lines.push('', '## Features in use (need a decision)', '');
const usedCats = Object.entries(features).filter(([, c]) => Object.values(c).some((f) => f.used.count));
if (!usedCats.length) lines.push('None detected.');
for (const [cat, c] of usedCats) {
  lines.push(`### ${cat}`);
  for (const [label, f] of Object.entries(c)) {
    if (!f.used.count) continue;
    if (f.sitewide) lines.push(`- ${label} — on every page (${ASSET_IS_USE.has(cat) ? 'loaded site-wide' : 'probably in the header or footer'})`);
    else lines.push(`- ${label} — on ${f.used.count} page(s), e.g. ${f.used.pages.slice(0, 3).join(', ')}`);
  }
  lines.push('');
}
const loadedOnly = Object.entries(features).flatMap(([cat, c]) => Object.entries(c).filter(([, f]) => !f.used.count && f.loadedOnly.count).map(([label, f]) => [cat, label, f]));
if (loadedOnly.length) {
  lines.push('## Installed, but no visible use found', '');
  lines.push('Their files load, but no page markup uses them. Usually leftovers to drop; check one page visually to be sure.', '');
  for (const [cat, label, f] of loadedOnly) lines.push(`- ${label} (${cat}) — files load on ${f.loadedOnly.count}/${scanned} scanned page(s)`);
  lines.push('');
}
lines.push(`Full data: ${OUT}; URL lists per group: ${Object.keys(groupFiles).map((n) => `urls-${n}.txt`).join(', ')} (same folder)`);
console.log(lines.join('\n'));
