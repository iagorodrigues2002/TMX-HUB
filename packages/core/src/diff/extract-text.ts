import * as cheerio from 'cheerio';

/**
 * Extract user-visible text from an HTML document, normalized for diffing.
 *
 * - Strips script/style/noscript/svg/template
 * - Collapses whitespace within each text node
 * - Splits on block-level boundaries so the diff is paragraph-level (not
 *   one giant string), but doesn't fragment to per-word noise.
 *
 * Returns an array of trimmed lines in document order.
 */
export function extractVisibleText(html: string): string[] {
  const $ = cheerio.load(html);

  $('script, style, noscript, svg, template, iframe').remove();

  const lines: string[] = [];
  // Treat these as block-level boundaries so each one becomes its own line(s).
  const BLOCKS = new Set([
    'p',
    'div',
    'section',
    'article',
    'header',
    'footer',
    'nav',
    'main',
    'aside',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'tr',
    'td',
    'th',
    'blockquote',
    'pre',
    'figcaption',
    'button',
    'a',
    'label',
    'span',
  ]);

  // Walk the DOM iteratively. Each frame has the cheerio-wrapped element
  // plus the index in `lines` we were at when we entered (for coalescing).
  function walk(root: ReturnType<typeof $>): void {
    root.contents().each((_, el) => {
      const node = el as { type?: string; data?: string; tagName?: string; name?: string };
      if (node.type === 'text') {
        const norm = (node.data ?? '').replace(/\s+/g, ' ').trim();
        if (norm.length > 0) lines.push(norm);
        return;
      }
      const tag = (node.tagName ?? node.name ?? '').toLowerCase();
      if (!tag) return;
      if (tag === 'br') {
        lines.push('');
        return;
      }
      // biome-ignore lint/suspicious/noExplicitAny: cheerio's typing is too strict here
      const wrapped = $(el as any);
      if (BLOCKS.has(tag)) {
        const before = lines.length;
        walk(wrapped);
        if (lines.length > before + 1) {
          const joined = lines.slice(before).join(' ').replace(/\s+/g, ' ').trim();
          lines.length = before;
          if (joined) lines.push(joined);
        }
      } else {
        walk(wrapped);
      }
    });
  }

  walk($('body'));

  // Strip empty lines + collapse adjacent duplicates (common with CSS-only
  // styling wrappers).
  const out: string[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    if (out.length > 0 && out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}
