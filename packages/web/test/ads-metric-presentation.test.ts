import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { importErrorPresentation, metricPresentation } from '../src/components/ads-intelligence/metric-presentation';

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
  assert.match(source,/className="min-h-0 overflow-clip"/);
  assert.doesNotMatch(source,/min-h-0 overflow-hidden/);
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
test('only known legacy partial summary is normalized; paused and real upstream errors remain untouched',()=>{
  const legacy='Cobertura parcial: contas com falha estão identificadas. ROAS/ROI indisponíveis até reparar as lacunas.';
  const fixed=importErrorPresentation('partial',legacy);
  assert.equal(fixed.warning,true);
  assert.match(fixed.message,/calculados com os custos conhecidos/);
  assert.deepEqual(importErrorPresentation('paused',legacy),{message:legacy,warning:false});
  assert.deepEqual(importErrorPresentation('retry_wait','UPSTREAM_ERROR HTTP 500'),{message:'UPSTREAM_ERROR HTTP 500',warning:false});
  assert.deepEqual(importErrorPresentation('partial','Outra falha'),{message:'Outra falha',warning:false});
});
test('advertiser page details use explicit source name/id without guessing the ad account',()=>{
  const source=readFileSync(new URL('../src/components/ads-intelligence/ads-intelligence-center.tsx',import.meta.url),'utf8');
  assert.match(source,/Página anunciante<\/dt><dd>\{source\.page_name \|\| 'Não informada'\}/);
  assert.match(source,/source\.page_id && <dd className="break-all">ID: \{source\.page_id\}/);
  assert.doesNotMatch(source,/source\.page_name \|\| source\.account_name/);
});
