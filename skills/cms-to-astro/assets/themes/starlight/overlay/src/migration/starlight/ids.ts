import { keyOf } from '../urls';

/**
 * Collection id of a docs file (`generateId` in src/content.config.ts). Starlight builds every page
 * at /<id>/ and reads its language from the first segment, so the id is the page's old URL path:
 *   oldUrl https://www.example.com/en/kontakt   → en/kontakt
 *   oldUrl https://www.example.com/              → index
 *   no oldUrl: the file path (en/guide.md → en/guide, en/index.md → en)
 * Old paths keep capitals, umlauts and translated slugs even where the file name differs.
 */
export function docsId({ entry, data }: { entry: string; data: Record<string, unknown> }): string {
  let key: string | undefined;
  if (typeof data.oldUrl === 'string') {
    try {
      key = keyOf(new URL(data.oldUrl).pathname);
    } catch {
      // not a URL: fall back to the file path
    }
  }
  key ??= keyOf(`/${entry.replace(/\.(md|mdx)$/i, '').replace(/(^|\/)index$/i, '')}`);
  return key === '/' ? 'index' : key.slice(1);
}
