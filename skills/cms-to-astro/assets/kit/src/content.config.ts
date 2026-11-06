// Content collections. If the project already has this file, add the import and the two entries there.
import { migrationCollection } from './migration/schema';

export const collections = {
  pages: migrationCollection('pages'),
  news: migrationCollection('news'),
  // A further type: migrationCollection('projects', { client: z.string().optional() }) (z from 'astro/zod'),
  // and add its name to `collections` in src/migration/site.config.ts.
};
