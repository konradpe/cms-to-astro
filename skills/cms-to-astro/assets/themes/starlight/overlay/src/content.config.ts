// Content collections: Starlight's `docs` collection with the migration kit's fields (Starlight recipe).
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsSchema } from '@astrojs/starlight/schema';
import { lenientGlob } from './migration/lenient-glob';
import { migrationFields } from './migration/schema';
import { docsId } from './migration/starlight/ids';

// Starlight's `template` (doc | splash) wins over the kit's named page templates.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { template, ...fields } = migrationFields;

export const collections = {
  docs: defineCollection({
    // Like Starlight's docsLoader, but a broken file is skipped with a warning, and the id (= the URL)
    // comes from `oldUrl`, so every page keeps its old path (src/migration/starlight/ids.ts).
    loader: lenientGlob({ pattern: '**/[^_.]*.{md,mdx}', base: './src/content/docs', generateId: docsId }),
    schema: docsSchema({ extend: z.looseObject(fields) }),
  }),
};
