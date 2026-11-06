/**
 * Small Markdown for text fields of blocks (frontmatter): paragraphs, ## headings, - and 1. lists,
 * [links](/x), **bold**, *italic*, `code`, line breaks (two trailing spaces or a backslash).
 * Everything else is escaped: block texts are plain content, not HTML. Page bodies go through Astro's
 * own Markdown pipeline instead.
 */
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^\s*javascript:/i.test(href) ? label : `<a href="${href}">${label}</a>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/( {2,}|\\)\n/g, '<br>\n');
}

export function markdown(text: string | undefined): string {
  if (!text?.trim()) return '';
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      const heading = block.match(/^(#{1,6})\s+(.*)$/s);
      if (heading) {
        const level = Math.max(2, heading[1].length); // the page's <h1> is the title
        return `<h${level}>${inline(heading[2].trim())}</h${level}>`;
      }
      if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*+]\s+/, ''))}</li>`).join('')}</ul>`;
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      return `<p>${inline(block)}</p>`;
    })
    .join('\n');
}
