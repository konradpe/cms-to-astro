// Only for build.format 'directory' with several languages: Astro writes the 404 page of /en/ as
// en/404/index.html, but hosts that serve the nearest 404 page (Cloudflare) look for en/404.html.
// This moves each <prefix>/404/index.html to <prefix>/404.html after the build. A no-op otherwise.
//
//   import locale404 from './src/migration/locale-404.mjs';
//   integrations: [..., locale404()]   // after sitemap()

import { readdir, rename, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function locale404() {
  let format = 'directory';
  return {
    name: 'locale-404',
    hooks: {
      'astro:config:done': ({ config }) => {
        format = config.build.format;
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (format !== 'directory') return;
        const out = fileURLToPath(dir);
        let moved = 0;
        for (const e of await readdir(out, { withFileTypes: true })) {
          const from = path.join(out, e.name, '404', 'index.html');
          if (!e.isDirectory() || !(await stat(from).catch(() => null))) continue;
          await rename(from, path.join(out, e.name, '404.html'));
          await rmdir(path.dirname(from)).catch(() => {}); // only if empty
          moved++;
        }
        if (moved) logger.info(`${moved} language 404 page(s) moved to <prefix>/404.html`);
      },
    },
  };
}
