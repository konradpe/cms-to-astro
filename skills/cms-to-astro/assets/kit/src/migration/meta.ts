import { site } from './site.config';
import { DEFAULT_LOCALE, LOCALES, absoluteUrl, homeOf, htmlLang, type Locale } from './urls';

/** Everything a page's `<head>` and frame need. Built by buildMeta(), passed to the Shell. */
export interface PageMeta {
  /** Full `<title>`: "Page | Site", or the site name alone. */
  title: string;
  /** Page title without the site name. */
  heading: string;
  description?: string;
  locale: Locale;
  /** `<html lang>` */
  lang: string;
  /** Href of the page being built (an alias path for alias pages). */
  path?: string;
  /** Absolute canonical URL (the main URL for alias pages); none on 404 and placeholder pages. */
  canonical?: string;
  /** hreflang links incl. x-default; empty unless the page exists in more than one language. */
  alternates: { hreflang: string; href: string }[];
  /** Language switcher: each language's version of this page, else that language's home page. */
  languages: { locale: Locale; lang: string; href: string; current: boolean; translated: boolean }[];
  noindex: boolean;
  /** Absolute og:image URL. */
  image?: string;
}

export interface MetaInput {
  title?: string;
  description?: string;
  locale?: Locale;
  path?: string;
  /** Href of the canonical page when it differs from `path` (aliases). */
  canonical?: string;
  /** Locale → href of each language version, including this page (translationsOf()). */
  translations?: Record<Locale, string>;
  noindex?: boolean;
  image?: string;
}

export function buildMeta(input: MetaInput): PageMeta {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const heading = input.title?.trim() || site.name;
  const translations = input.translations ?? {};
  const present = LOCALES.filter((l) => translations[l]);
  // hreflang only for real translations; x-default is the default language's version, else the first.
  const alternates =
    present.length > 1
      ? [
          ...present.map((l) => ({ hreflang: htmlLang(l), href: absoluteUrl(translations[l]) })),
          { hreflang: 'x-default', href: absoluteUrl(translations[DEFAULT_LOCALE] ?? translations[present[0]]) },
        ]
      : [];
  return {
    title: heading === site.name ? site.name : `${heading} | ${site.name}`,
    heading,
    description: input.description?.trim() || undefined,
    locale,
    lang: htmlLang(locale),
    path: input.path,
    canonical: input.canonical || input.path ? absoluteUrl(input.canonical ?? input.path!) : undefined,
    alternates,
    languages: LOCALES.map((l) => ({
      locale: l,
      lang: htmlLang(l),
      href: translations[l] ?? homeOf(l),
      current: l === locale,
      translated: !!translations[l],
    })),
    noindex: !!input.noindex,
    image: input.image ? absoluteUrl(input.image) : undefined,
  };
}
