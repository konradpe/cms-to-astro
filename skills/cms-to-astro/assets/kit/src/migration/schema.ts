import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { lenientGlob } from './lenient-glob';

/**
 * Fields of migrated content (scripts/content-to-md.mjs and wp-export.mjs write them).
 * Deliberately lenient: a malformed value is dropped (`.catch()`), never fatal, so one odd file
 * can't break the build. Unknown fields are kept (looseObject): wpId, author etc. document provenance.
 * Tighten a type's schema once its content is cleaned up.
 */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** A list whose invalid items are dropped one by one, with a warning. */
const lenientList = <T extends z.ZodType>(item: T, what: string) =>
  z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((value) => {
        const parsed = item.safeParse(value);
        if (!parsed.success) console.warn(`[content] dropped invalid ${what}: ${JSON.stringify(value)}`);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }),
    )
    .optional()
    .catch(undefined);

/** A content block: `type` picks the component (theme/index.ts `blocks`); the other fields are its props. */
const block = z.looseObject({ type: z.string() });
export type Block = z.output<typeof block>;

export const migrationFields = {
  title: z.string().catch(''),
  description: lenient(z.string()),
  excerpt: lenient(z.string()),
  date: lenient(z.coerce.date()),
  updated: lenient(z.coerce.date()),
  /** /media/… */
  featuredImage: lenient(z.string()),
  /** Absolute URL on the old site; its path is the route. */
  oldUrl: lenient(z.url()),
  order: lenient(z.number()),
  draft: z.boolean().default(false).catch(false),
  needsReview: lenient(z.boolean()),
  /** Rendered in the draft layout until the type gets its styled template. */
  wireframe: lenient(z.boolean()),
  /** Language of the page (de, en …); else the locale folder or URL prefix decides. */
  lang: lenient(z.string()),
  /** The same value on all language versions of one page. */
  translationKey: lenient(z.coerce.string()),
  /** Further old paths of the same page: one page each, with a canonical link to the main URL. */
  aliases: lenientList(z.string(), 'alias'),
  /** robots noindex; left out of the sitemap and of other pages' hreflang. */
  noindex: lenient(z.boolean()),
  /** Page template name (theme/index.ts `templates`); default 'page'. */
  template: lenient(z.string()),
  /** Page built from blocks instead of (or before) the Markdown body. */
  blocks: lenientList(block, 'block'),
};

/**
 * A content collection of migrated pages under src/content/<name>/ (mirrored URL paths).
 * `extra` adds type-specific fields: migrationCollection('projects', { client: z.string().optional() }).
 * List the name in site.config.ts `collections` to serve it at its old URLs.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}`: no extra fields keeps the base types exact
export function migrationCollection<E extends Record<string, z.ZodType> = {}>(name: string, extra?: E) {
  return defineCollection({
    loader: lenientGlob({ pattern: '**/[^_.]*.md', base: `./src/content/${name}` }),
    schema: z.looseObject({ ...migrationFields, ...(extra ?? ({} as E)) }),
  });
}
