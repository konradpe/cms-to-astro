import { readdirSync } from 'node:fs';
import path from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import { site } from './site.config';
import { DEFAULT_LOCALE, LOCALES, homeOf, hrefOfKey, hrefOfPath, isLocale, keyOf, localeOfPath, prefixOf, routeParams, type Locale } from './urls';

/**
 * Migrated entries and the rules that map them to URLs. Routes, views and layouts ask here and never
 * parse `entry.id` or `oldUrl` themselves.
 */

/** Every migration collection shares the base schema (schema.ts); `pages` stands in for all of them. */
export type MigrationEntry = CollectionEntry<'pages'>;

/** Locale → href of the page in that language (including the page itself). */
export type Translations = Record<Locale, string>;

/** The old path of an entry: the path of its oldUrl, else derived from the file path. */
export function oldPathOf(entry: MigrationEntry): string {
  if (entry.data.oldUrl) {
    try {
      return new URL(entry.data.oldUrl).pathname;
    } catch {
      // fall through
    }
  }
  // en/services/consulting.md -> /en/services/consulting; news/en/item.md -> /en/news/item
  const segs = entry.id.split('/');
  const locale = isLocale(segs[0]) ? segs.shift()! : DEFAULT_LOCALE;
  const tail = segs.join('/').replace(/(^|\/)index$/, '');
  const prefix = prefixOf(locale);
  const base = entry.collection === site.collections[0] ? '' : `/${entry.collection}`;
  const key = keyOf(`${prefix ? `/${prefix}` : ''}${tail ? `${base}/${tail}` : base}`);
  return hrefOfKey(key, !tail);
}

/** The route key of an entry (/about, /en, /). */
export const routeOf = (entry: MigrationEntry) => keyOf(oldPathOf(entry));

/** The href to link to an entry. */
export const hrefOf = (entry: MigrationEntry) => hrefOfPath(oldPathOf(entry));

/** Locale of an entry: its `lang` (if it is a site locale), else its locale folder, else its URL prefix. */
export function localeOf(entry: MigrationEntry): Locale {
  const lang = entry.data.lang?.toLowerCase().replace('_', '-') ?? '';
  // A `lang` that isn't a site locale (a theme default like `de` on an English-only site) is ignored.
  for (const candidate of [lang, lang.split('-')[0], entry.id.split('/')[0]]) if (isLocale(candidate)) return candidate;
  return localeOfPath(oldPathOf(entry));
}

/** A readable title even for entries whose title is empty. */
export function titleOf(entry: MigrationEntry): string {
  return entry.data.title.trim() || routeOf(entry).split('/').filter(Boolean).at(-1)?.replace(/[-_]+/g, ' ') || site.name;
}

let cached: Promise<MigrationEntry[]> | undefined;

/**
 * Every routable entry (no drafts), one per route. When two files claim the same route, the first
 * (collections in site.config order, then by id) wins and the other is reported.
 */
export function getEntries(): Promise<MigrationEntry[]> {
  // Several routes ask during one build; in dev, content changes between requests.
  if (import.meta.env.DEV) return loadEntries();
  return (cached ??= loadEntries());
}

async function loadEntries(): Promise<MigrationEntry[]> {
  const byRoute = new Map<string, MigrationEntry>();
  for (const name of site.collections) {
    const entries = ((await getCollection(name as 'pages')) ?? []).filter((e) => !e.data.draft).sort((a, b) => a.id.localeCompare(b.id));
    for (const entry of entries) {
      const route = routeOf(entry);
      const existing = byRoute.get(route);
      if (existing) {
        console.warn(`[migration] ${entry.collection}/${entry.id} has the same route ${route} as ${existing.collection}/${existing.id}; skipped.`);
        continue;
      }
      byRoute.set(route, entry);
    }
  }
  return [...byRoute.values()];
}

/** The entry served at a path (any URL form), e.g. for a designed page that replaces the catch-all. */
export async function entryAt(path: string): Promise<MigrationEntry | undefined> {
  const key = keyOf(path);
  return (await getEntries()).find((e) => routeOf(e) === key);
}

/** The page in every language that has it: itself plus the entries with the same translationKey. */
export function translationsOf(entry: MigrationEntry, all: MigrationEntry[]): Translations {
  const own = localeOf(entry);
  const result: Translations = { [own]: hrefOf(entry) };
  const key = entry.data.translationKey;
  if (!key || entry.data.noindex) return result;
  for (const other of all) {
    if (other === entry || other.data.translationKey !== key || other.data.noindex) continue;
    const locale = localeOf(other);
    result[locale] ??= hrefOf(other);
  }
  return result;
}

/** Further old paths of an entry (`aliases`, paths or full URLs), without its main path. */
export function aliasPathsOf(entry: MigrationEntry): string[] {
  const main = routeOf(entry);
  const paths = (entry.data.aliases ?? []).map((a) => a.replace(/^[a-z]+:\/\/[^/]+/i, '') || '/');
  return [...new Map(paths.filter((p) => keyOf(p) !== main && keyOf(p) !== '/').map((p) => [keyOf(p), p])).values()];
}

/**
 * Keys served by real page files (src/pages/about.astro, a theme's index.astro, 404.astro …):
 * those win over the catch-all, so it doesn't generate them. Assumes Astro's default srcDir.
 */
function pageFileKeys(): Set<string> {
  const dir = path.resolve('src/pages');
  const keys = new Set<string>();
  let files: string[] = [];
  try {
    files = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  } catch {
    return keys;
  }
  for (const file of files) {
    const rel = file.split(path.sep).join('/');
    if (!/\.(astro|md|mdx|html)$/.test(rel) || rel.split('/').some((s) => s.startsWith('_') || s.includes('['))) continue;
    keys.add(keyOf(`/${rel.replace(/\.[a-z]+$/, '').replace(/(^|\/)index$/, '/')}`));
  }
  return keys;
}

export type RouteProps =
  | { kind: 'entry'; entry: MigrationEntry; path?: string }
  | { kind: 'home'; locale: Locale; path: string }
  | { kind: 'root'; path: string };

/**
 * getStaticPaths of the two catch-all routes: entries at their old paths, alias paths, a
 * "not moved yet" home for each language without a home entry, and with prefixed default locale
 * a redirect page at /. `index` selects the directory indexes (see routeParams in urls.ts).
 */
export async function staticPaths(index: boolean) {
  const all = await getEntries();
  const reserved = pageFileKeys();
  for (const locale of LOCALES) if (prefixOf(locale)) reserved.add(`/${prefixOf(locale)}/404`);
  const taken = new Set(all.map(routeOf));
  const seen = new Set<string>();
  const out: { params: { path: string | undefined }; props: RouteProps }[] = [];
  const add = (oldPath: string, props: RouteProps) => {
    const key = keyOf(oldPath);
    const params = routeParams(oldPath);
    if (params.index !== index || reserved.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push({ params: { path: params.path }, props });
  };

  for (const entry of all) add(oldPathOf(entry), { kind: 'entry', entry });
  for (const entry of all) {
    for (const alias of aliasPathsOf(entry)) {
      if (taken.has(keyOf(alias))) continue; // a real entry lives there
      add(alias, { kind: 'entry', entry, path: hrefOfPath(alias) });
    }
  }
  for (const locale of LOCALES) {
    const home = homeOf(locale);
    if (!taken.has(keyOf(home))) add(home, { kind: 'home', locale, path: home });
  }
  if (site.prefixDefaultLocale && !taken.has('/')) add('/', { kind: 'root', path: '/' });
  return out;
}
