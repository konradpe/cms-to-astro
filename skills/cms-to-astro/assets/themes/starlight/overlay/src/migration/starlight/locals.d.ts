// Per-request data of the Starlight recipe (route-data.ts, StarlightShell.astro, AliasPage.astro).
declare namespace App {
  interface Locals {
    migration?: {
      /** Head and language data of the page (kit meta.ts): canonical, hreflang, language switcher. */
      meta: import('../meta').PageMeta;
      /** The page brings its own <h1> (the kit's placeholder, 404 and status pages): no Starlight title. */
      ownHeading?: boolean;
    };
  }
}
