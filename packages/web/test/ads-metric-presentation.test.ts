import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { metricPresentation } from '../src/components/ads-intelligence/metric-presentation';

test('ROAS uses 1x and ROI uses zero as media break-even, not positive sign alone',()=>{
  assert.equal(metricPresentation('roas',0.9).cue,'▼');
  assert.equal(metricPresentation('roas',1).cue,'=');
  assert.equal(metricPresentation('roas',1.1).cue,'▲');
  assert.equal(metricPresentation('roi',-10).cue,'▼');
  assert.equal(metricPresentation('roi',0).cue,'=');
  assert.equal(metricPresentation('roi',10).cue,'▲');
});
test('privacy suppresses color, status and direction for every hidden financial value',()=>{
  for (const key of ['roas','roi','revenue','spend','cpc','cpm']) {
    const hidden=metricPresentation(key,-5,true);
    assert.deepEqual(hidden,metricPresentation(key,15,true));
    assert.equal(hidden.cue,'');
    assert.equal(hidden.tone,'text-foreground');
    assert.equal(hidden.description,'Valor oculto');
  }
});
test('unknown metrics are neutral and informational rates invent no performance threshold',()=>{
  assert.equal(metricPresentation('roas',null).cue,'');
  assert.equal(metricPresentation('roi',NaN).tone,'text-muted-foreground');
  assert.equal(metricPresentation('ctr',0.2).tone,metricPresentation('ctr',90).tone);
  assert.equal(metricPresentation('hook_rate',0.2).cue,'');
});
test('sticky first column is opaque and nested tables share explicit full column width',()=>{
  const source=readFileSync(new URL('../src/components/ads-intelligence/ads-intelligence-center.tsx',import.meta.url),'utf8');
  assert.match(source,/sticky left-0 bg-\[var\(--color-background\)\]/);
  assert.equal((source.match(/style=\{\{width:tableWidth,minWidth:tableWidth\}\}/g)||[]).length,2);
  assert.ok(source.indexOf('aria-label="Filtros dos anúncios"')<source.indexOf('aria-label="Estado da importação"'));
  assert.match(source,/<details className="space-y-3 rounded-xl/);
});
test('metric colors follow explicit app theme independently from operating-system dark mode',()=>{
  const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
  const helper=readFileSync(new URL('../src/components/ads-intelligence/metric-presentation.ts',import.meta.url),'utf8');
  assert.match(css,/html\[data-theme="light"\] \.ads-intelligence-metrics/);
  assert.match(css,/--ads-positive: #047857/);
  assert.match(css,/--ads-positive: #6ee7b7/);
  assert.doesNotMatch(helper,/dark:/);
  assert.match(metricPresentation('roas',2).tone,/var\(--ads-positive\)/);
});
