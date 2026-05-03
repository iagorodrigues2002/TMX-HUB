import postcss, { type AtRule, type Declaration, type Root } from 'postcss';
import valueParser from 'postcss-value-parser';
import { resolveUrl, shouldSkipUrl } from './url-utils.js';

export type UrlVisitor = (rawUrl: string, absUrl: string) => string | null | undefined;

export interface WalkOptions {
  cssBaseUrl: string;
  visit: UrlVisitor;
}

export interface WalkResult {
  css: string;
  imports: string[];
  collectedUrls: string[];
}

export function walkCss(css: string, opts: WalkOptions): WalkResult {
  const imports: string[] = [];
  const collectedUrls: string[] = [];
  const root: Root = postcss.parse(css);

  root.walkAtRules('import', (rule: AtRule) => {
    const { url, rest } = parseImportParams(rule.params);
    if (!url || shouldSkipUrl(url)) return;
    const abs = resolveUrl(url, opts.cssBaseUrl);
    imports.push(abs);
    collectedUrls.push(abs);
    const replaced = opts.visit(url, abs);
    const finalUrl = replaced ?? url;
    rule.params = `url("${escapeUrlForCss(finalUrl)}")${rest ? ' ' + rest : ''}`;
  });

  root.walkDecls((decl: Declaration) => {
    if (!decl.value.includes('url(')) return;
    const parsed = valueParser(decl.value);
    parsed.walk((node) => {
      if (node.type !== 'function' || node.value !== 'url') return;
      const arg = node.nodes[0];
      if (!arg) return;
      if (arg.type !== 'string' && arg.type !== 'word') return;
      const raw = arg.value;
      if (!raw || shouldSkipUrl(raw)) return;
      const abs = resolveUrl(raw, opts.cssBaseUrl);
      collectedUrls.push(abs);
      const replaced = opts.visit(raw, abs);
      const finalUrl = replaced ?? raw;
      // Replace the function's children with a single quoted-string node so
      // serialization is stable across special chars.
      const replacement = {
        type: 'string' as const,
        value: finalUrl,
        quote: '"' as const,
        before: '',
        after: '',
        sourceIndex: arg.sourceIndex,
      };
      node.nodes = [replacement as unknown as (typeof node.nodes)[number]];
    });
    decl.value = parsed.toString();
  });

  return {
    css: root.toString(),
    imports,
    collectedUrls,
  };
}

function parseImportParams(params: string): { url: string | null; rest: string } {
  const trimmed = params.trim();
  let url: string | null = null;
  let rest = '';
  const urlFn = /^url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(.*)$/i.exec(trimmed);
  if (urlFn) {
    url = urlFn[2] ?? null;
    rest = (urlFn[3] ?? '').trim();
    return { url, rest };
  }
  const quoted = /^(['"])([^'"]+)\1\s*(.*)$/.exec(trimmed);
  if (quoted) {
    url = quoted[2] ?? null;
    rest = (quoted[3] ?? '').trim();
    return { url, rest };
  }
  return { url: null, rest: trimmed };
}

function escapeUrlForCss(u: string): string {
  return u.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
