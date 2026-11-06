import { site } from './site.config';

/**
 * URL rules of the kit. Pure functions, no Astro imports.
 *
 * A page has three forms:
 *   old path  as the old site linked it: /about/, /kontakt, /en/, /about.html
 *   key       its identity for lookups, the same in every URL style: /about, /kontakt, /en, /
 *   href      the link the new site uses: the old path itself, so old links keep working.
 *             Exception: build.format 'file' cannot write directory indexes, so /en/ becomes /en.html.
 */

export type Locale = string;
export const LOCALES: readonly Locale[] = site.locales;
export const DEFAULT_LOCALE: Locale = site.locales[0];

const pathOnly = (p: string) => '/' + p.split(/[?#]/)[0].replace(/^\/+/, '');

export function keyOf(path: string): string {
  let p = pathOnly(path);
  try {
    p = decodeURI(p);
  } catch {
    // keep malformed escapes as they are
  }
  p = p
    .replace(/\/{2,}/g, '/')
    .replace(/\/index\.html?$/i, '/')
    .replace(/\.html?$/i, '')
    .replace(/\/+$/, '');
  return p || '/';
}

/** `/`, `/en/` and `/en/index.html` are directory indexes; `/kontakt` and `/about.html` are not. */
export function isIndexPath(path: string): boolean {
  return /\/(index\.html?)?$/i.test(pathOnly(path));
}

/** The href for a page known by its old path. */
export function hrefOfPath(oldPath: string): string {
  const p = pathOnly(oldPath);
  if (site.urlStyle === 'file' && isIndexPath(p) && keyOf(p) !== '/') return `${encodeURI(keyOf(p))}.html`;
  return p;
}

/** The href for a page without an old path (no oldUrl), in the site's URL style. */
export function hrefOfKey(key: string, index = false): string {
  if (key === '/') return '/';
  const k = encodeURI(key);
  if (site.urlStyle === 'directory') return `${k}/`;
  if (site.urlStyle === 'file') return `${k}.html`;
  return index ? `${k}/` : k;
}

/**
 * Which catch-all route builds a path, and with which param. Directory indexes go through
 * src/pages/[...path]/index.astro, everything else through src/pages/[...path].astro: with
 * build.format 'preserve' only an index route is written as en/index.html, a plain one as kontakt.html.
 */
export function routeParams(oldPath: string): { index: boolean; path: string | undefined } {
  return { index: isIndexPath(oldPath), path: keyOf(oldPath).slice(1) || undefined };
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value);
}

/** URL prefix of a locale without slashes: '' for an unprefixed default locale. */
export function prefixOf(locale: Locale): string {
  return locale === DEFAULT_LOCALE && !site.prefixDefaultLocale ? '' : locale;
}

/** Href of a locale's home page: /, /en/ (or /en.html in file style). */
export function homeOf(locale: Locale): string {
  const prefix = prefixOf(locale);
  return prefix ? hrefOfKey(`/${prefix}`, true) : '/';
}

export function localeOfPath(path: string): Locale {
  const first = keyOf(path).split('/')[1] ?? '';
  return isLocale(first) && prefixOf(first) ? first : DEFAULT_LOCALE;
}

/** `<html lang>` / hreflang value of a locale. The codes are BCP 47 tags already (de, en, pt-br). */
export function htmlLang(locale: Locale): string {
  return locale;
}

/** Absolute URL on the new site (astro.config `site`, else the old origin). */
export function absoluteUrl(href: string): string {
  return new URL(href, import.meta.env.SITE || site.oldOrigin).href;
}
