/**
 * Helpers for the AstroWind adapters in this folder (cms-to-astro recipe). AstroWind widgets render
 * most text props with `set:html`, so plain values are escaped here, and Markdown fields of blocks
 * go through the kit's small Markdown (../markdown.ts), which escapes everything else.
 */
import { markdown } from '../markdown';

export const esc = (s = ''): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// AstroWind widgets wrap their sections in `not-prose`, so Tailwind's prose styles never reach Markdown
// inside them; these helpers put the theme's text styles on the tags themselves.
const inlineStyles = (html: string) =>
  html
    .replace(/<a href=/g, '<a class="text-primary underline underline-offset-2 hover:no-underline" href=')
    .replace(/<code>/g, '<code class="rounded bg-gray-100 px-1 dark:bg-slate-800">');

/** A block's Markdown field as HTML with the theme's text styles, for content inside AstroWind widgets. */
export const richText = (text?: string): string =>
  inlineStyles(markdown(text))
    .replace(/<p>/g, '<p class="mb-4 last:mb-0">')
    .replace(/<ul>/g, '<ul class="mb-4 list-disc space-y-1 pl-6">')
    .replace(/<ol>/g, '<ol class="mb-4 list-decimal space-y-1 pl-6">')
    .replace(/<h([2-6])>/g, '<h$1 class="mb-3 mt-6 font-heading text-xl font-bold text-heading">');

/**
 * Markdown for a widget prop rendered inside a <p> (Hero subtitle, Headline subtitle, card text):
 * paragraphs become line breaks. Undefined when the text has lists or headings (they can't sit in a
 * <p>); use `richText()` for those.
 */
export function inlineMd(text?: string): string | undefined {
  const html = markdown(text);
  if (!html || /<(ul|ol|h\d)\b/.test(html)) return undefined;
  return inlineStyles(html.replace(/^<p>|<\/p>$/g, '').replace(/<\/p>\n<p>/g, '<br /><br />'));
}

/** A multi-line value (address, opening hours) as escaped HTML lines. */
export const lines = (s?: string): string | undefined => (s?.trim() ? s.trim().split(/\r?\n/).map(esc).join('<br />') : undefined);

/** The theme's typography for Markdown (AstroWind's MarkdownLayout classes); not inside widgets (see above). */
export const PROSE =
  'prose prose-lg max-w-none dark:prose-invert dark:prose-headings:text-slate-300 prose-headings:font-heading prose-headings:leading-tighter prose-headings:tracking-tighter prose-headings:font-bold prose-a:text-primary dark:prose-a:text-blue-400 prose-img:rounded-md';

/** Interface texts of the adapters that the kit's strings.ts doesn't have. Add a language like there. */
const LABELS: Record<string, { more: string; hours: string }> = {
  en: { more: 'Read more', hours: 'Opening hours' },
  de: { more: 'Weiterlesen', hours: 'Öffnungszeiten' },
};
export const labels = (locale = 'en') => LABELS[locale] ?? LABELS[locale.split('-')[0]] ?? LABELS.en;

/** Grid columns for n items: 2 for 2 or 4 items, else 3. */
export const columnsFor = (n: number) => (n === 2 || n === 4 ? 2 : 3);
