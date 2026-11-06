/**
 * Settings of the migration kit: the only kit file a project edits.
 * `urlStyle` must match `build.format` / `trailingSlash` in astro.config.mjs (table in KIT.md).
 */
export interface SiteConfig {
  /** The old website. Its URL paths are kept; links to it become relative (pending-pages). */
  oldOrigin: string;
  /** Site name: `<title>` suffix and the default header. */
  name: string;
  /** Language codes, default first. Each code is also that language's URL prefix (/en/…). */
  locales: readonly string[];
  /** true when the default language has its prefix too (/de/… instead of /…). */
  prefixDefaultLocale: boolean;
  /**
   * How the old URLs look, and so which files the build writes:
   *   directory  /about/          build.format 'directory', trailingSlash 'always'
   *   preserve   /kontakt, /en/   build.format 'preserve',  trailingSlash 'ignore'
   *   file       /about.html      build.format 'file',      trailingSlash 'never'
   */
  urlStyle: 'directory' | 'preserve' | 'file';
  /** Content collections served at their old URLs by src/pages/[...path].astro. */
  collections: readonly string[];
}

export const site: SiteConfig = {
  oldOrigin: 'https://www.example.com',
  name: 'Example',
  locales: ['en'],
  prefixDefaultLocale: false,
  urlStyle: 'directory',
  collections: ['pages', 'news'],
};
