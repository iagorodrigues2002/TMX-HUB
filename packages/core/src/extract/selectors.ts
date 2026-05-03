import type { AnyNode, Element } from 'domhandler';
import { isTag } from 'domhandler';
import type { CheerioAPI } from 'cheerio';

export interface SelectorOptions {
  preferIdRoot?: boolean;
  maxDepth?: number;
}

export function generateSelector(
  $: CheerioAPI,
  el: Element,
  opts: SelectorOptions = {},
): string {
  const id = el.attribs?.['id'];
  if (id && isSafeIdent(id)) {
    return `#${cssEscape(id)}`;
  }
  const name = el.attribs?.['name'];
  if (name && isSafeIdent(name)) {
    const tag = el.tagName.toLowerCase();
    return `${tag}[name="${cssEscapeAttr(name)}"]`;
  }

  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  const max = opts.maxDepth ?? 6;

  while (current && depth < max) {
    const segment = describeNode($, current);
    parts.unshift(segment);
    if (segment.startsWith('#')) break;
    const parent = parentElement(current);
    if (!parent) break;
    if (parent.tagName.toLowerCase() === 'html') break;
    current = parent;
    depth += 1;
  }

  return parts.join(' > ');
}

function describeNode($: CheerioAPI, el: Element): string {
  const id = el.attribs?.['id'];
  if (id && isSafeIdent(id)) return `#${cssEscape(id)}`;
  const tag = el.tagName.toLowerCase();
  const action = el.attribs?.['action'];
  if (tag === 'form' && action) {
    const idx = nthOfTypeIndex($, el);
    return `form[action="${cssEscapeAttr(action)}"]${idx > 1 ? `:nth-of-type(${idx})` : ''}`;
  }
  const name = el.attribs?.['name'];
  if (name && isSafeIdent(name)) {
    return `${tag}[name="${cssEscapeAttr(name)}"]`;
  }
  const idx = nthOfTypeIndex($, el);
  return idx > 1 ? `${tag}:nth-of-type(${idx})` : tag;
}

function parentElement(el: Element): Element | null {
  let p: AnyNode | null = el.parent ?? null;
  while (p) {
    if (isElement(p)) return p;
    p = p.parent ?? null;
  }
  return null;
}

function isElement(n: AnyNode): n is Element {
  return isTag(n);
}

function nthOfTypeIndex($: CheerioAPI, el: Element): number {
  const parent = parentElement(el);
  if (!parent) return 1;
  const tag = el.tagName.toLowerCase();
  let idx = 0;
  let target = 0;
  for (const child of parent.children) {
    if (!isElement(child)) continue;
    if (child.tagName.toLowerCase() !== tag) continue;
    idx += 1;
    if (child === el) {
      target = idx;
      break;
    }
  }
  return target || 1;
}

const SAFE_IDENT_RE = /^[A-Za-z_][\w-]{0,127}$/;

function isSafeIdent(v: string): boolean {
  return SAFE_IDENT_RE.test(v);
}

function cssEscape(v: string): string {
  return v.replace(/([^\w-])/g, '\\$1');
}

function cssEscapeAttr(v: string): string {
  return v.replace(/(["\\])/g, '\\$1');
}
