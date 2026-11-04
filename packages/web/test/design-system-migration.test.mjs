import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateClassTokens, migrateSource } from '../../../scripts/audit-design-system.mjs';

test('semantic migration preserves modifiers and primary button contrast', () => {
  assert.equal(
    migrateClassTokens('bg-cyan-400 text-white hover:bg-cyan-300 hover:text-white'),
    'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
  );
  assert.equal(
    migrateClassTokens('text-white/45 text-white border-white/10'),
    'text-muted-foreground text-foreground border-border',
  );
  assert.equal(migrateClassTokens('text-emerald-300 bg-red-400/10'), 'text-success bg-danger/10');
});
test('migration leaves imported HTML, provider brands and business text intact', () => {
  for (const text of [
    '<html><body class="bg-white">Page</body></html>',
    'text-blue-500',
    'Valor de R$ 2.000,00',
  ])
    assert.equal(migrateClassTokens(text), text);
});
test('dynamic imported document templates are not themed as application controls', () => {
  const html = 'const page = `<div class="${type} text-white ${other}">Page</div>`;';
  assert.equal(migrateSource(html, 'view.tsx'), html);
});
test('existing glass classes and overlapping utilities are preserved without shifting tokens', () => {
  const source = `export const View = () => <section className="glass-card border border-white/10 rounded-xl text-white text-white/45"><button onClick={save}>Salvar</button></section>`;
  const result = migrateSource(source, 'view.tsx');
  assert.match(
    result,
    /className="glass-card border border-border rounded-xl text-foreground text-muted-foreground"/,
  );
  assert.match(result, /onClick=\{save\}/);
  assert.equal(migrateSource(result, 'view.tsx'), result);
});
