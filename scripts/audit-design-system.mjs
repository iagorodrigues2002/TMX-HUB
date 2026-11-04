import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'packages/web/src');
const utility =
  /^(.*?)(text|bg|border(?:-[tblrxy])?|ring|divide|from|via|to|fill|stroke)-(white|black|cyan|slate|zinc|gray|neutral|emerald|green|red|rose|amber|yellow)(?:-\d{2,3})?(?:\/(\[[\d.]+\]|\d+))?$/;

export function migrateClassTokens(value) {
  // Imported HTML and document templates are business content, not application chrome.
  if (/<[a-z/!]/i.test(value)) return value;
  const tokens = value.split(/\s+/);
  const primary = new Set(
    tokens.flatMap((token) => {
      const semantic = token.match(/^(.*?)bg-primary$/);
      if (semantic) return [semantic[1]];
      const match = token.match(utility);
      if (!match || match[2] !== 'bg' || match[3] !== 'cyan') return [];
      const alpha = match[4]
        ? Number(match[4].replace(/[\[\]]/g, '')) / (match[4].startsWith('[') ? 1 : 100)
        : 1;
      return alpha >= 0.4 ? [match[1]] : [];
    }),
  );
  return value.replace(/\S+/g, (token) => {
    const match = token.match(utility);
    if (!match) {
      const foreground = token.match(/^(.*?)text-(?:foreground|muted-foreground)$/);
      if (foreground && primary.has(foreground[1]))
        return `${foreground[1]}text-primary-foreground`;
      const hex = token.match(/^(.*?)(bg|border|text)-\[#([\da-f]{6})\](?:\/\d+)?$/i);
      if (!hex) return token;
      const rgb = hex[3].match(/../g).map((channel) => Number.parseInt(channel, 16));
      if (hex[2] === 'bg' && Math.max(...rgb) < 70) return `${hex[1]}bg-background`;
      return token;
    }
    const [, prefix, kind, color, opacity] = match;
    if (prefix && !prefix.endsWith(':')) return token;
    const alpha = opacity
      ? Number(opacity.replace(/[\[\]]/g, '')) / (opacity.startsWith('[') ? 1 : 100)
      : 1;
    const state = /^(emerald|green)$/.test(color)
      ? 'success'
      : /^(red|rose)$/.test(color)
        ? 'danger'
        : /^(amber|yellow)$/.test(color)
          ? 'warning'
          : null;
    let next;
    if (state)
      next =
        kind === 'bg'
          ? `bg-${state}/10`
          : kind.startsWith('border')
            ? `${kind}-${state}/30`
            : `${kind}-${state}`;
    else if (kind === 'text')
      next =
        color === 'cyan'
          ? 'text-primary'
          : primary.has(prefix) && color === 'white'
            ? 'text-primary-foreground'
            : (color === 'white' && alpha >= 0.75) || color === 'black'
              ? 'text-foreground'
              : 'text-muted-foreground';
    else if (kind.startsWith('border') || kind === 'divide') next = `${kind}-border`;
    else if (kind === 'ring') next = 'ring-ring';
    else if (kind === 'bg')
      next =
        color === 'cyan'
          ? alpha >= 0.4
            ? 'bg-primary'
            : 'bg-accent'
          : alpha >= 0.6
            ? 'bg-background'
            : alpha >= 0.05
              ? 'bg-accent'
              : 'bg-muted';
    else next = `${kind}-primary`;
    return prefix + next;
  });
}

export function migrateSource(text, filename) {
  const ast = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  function visit(node) {
    if (ts.isTemplateExpression(node) && /<[a-z/!]/i.test(node.getText(ast))) return;
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      let next = migrateClassTokens(node.text);
      const attribute = node.parent;
      const tag =
        attribute && ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === 'className'
          ? attribute.parent.parent.tagName.getText(ast)
          : '';
      if (
        /^(section|article|form|div|header|aside)$/.test(tag) &&
        /\bborder\b/.test(next) &&
        (/\brounded-(?:xl|2xl)\b/.test(next) ||
          (/\brounded-lg\b/.test(next) &&
            /\bp-[4568]\b|\boverflow-(?:auto|x-auto|hidden)\b/.test(next))) &&
        !/glass-card|bg-(?:success|danger|warning)/.test(next)
      )
        next = `glass-card ${next}`;
      if (next !== node.text) {
        let raw = node.getText(ast);
        const addedSurface = next.startsWith('glass-card ') && !node.text.startsWith('glass-card ');
        const oldTokens = node.text.split(/\s+/);
        const newTokens = (addedSurface ? next.slice(11) : next).split(/\s+/);
        const replacements = oldTokens
          .map((token, index) => [token, newTokens[index]])
          .filter(([before, after]) => before && before !== after)
          .sort((a, b) => b[0].length - a[0].length);
        for (const [before, after] of replacements) raw = raw.split(before).join(after);
        if (addedSurface) raw = `${raw[0]}glass-card ${raw.slice(1)}`;
        edits.push({ start: node.getStart(ast), end: node.end, value: raw });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}

export function uiFiles(directory = source) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory())
        return entry.name === 'api' ||
          filename.endsWith('/components/design-system') ||
          filename.endsWith('/lib') ||
          filename.endsWith('/hooks')
          ? []
          : uiFiles(filename);
      return /\.(tsx|ts)$/.test(filename) && !filename.endsWith('.d.ts') ? [filename] : [];
    })
    .sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.includes('--files')
    ? process.argv
        .slice(process.argv.indexOf('--files') + 1)
        .map((filename) => path.resolve(root, filename))
    : uiFiles();
  const changes = files.flatMap((filename) => {
    const before = readFileSync(filename, 'utf8');
    const after = migrateSource(before, filename);
    return before === after ? [] : [{ file: path.relative(root, filename), before, after }];
  });
  console.log(
    JSON.stringify(
      process.argv.includes('--patch-data') ? changes : changes.map(({ file }) => file),
    ),
  );
  if (process.argv.includes('--check') && changes.length) process.exitCode = 1;
}
