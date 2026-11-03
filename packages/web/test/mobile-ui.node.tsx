import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MicroFooter } from '../src/components/hub/micro-footer';
import { Button } from '../src/components/ui/button';
import { DateRangeFilter } from '../src/components/ui/date-range-filter';
import { DialogHeader } from '../src/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../src/components/ui/tabs';

test('compact buttons retain mobile touch targets without changing disabled semantics', () => {
  const html = renderToStaticMarkup(
    <Button size="sm" disabled>
      Salvar
    </Button>,
  );
  assert.match(html, /min-h-11/);
  assert.match(html, /min-w-11/);
  assert.match(html, /sm:min-h-0/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Salvar/);
});

test('mobile tabs remain keyboard accessible inside a bounded horizontal strip', () => {
  const html = renderToStaticMarkup(
    <Tabs defaultValue="one">
      <TabsList aria-label="Áreas">
        <TabsTrigger value="one">Primeira área</TabsTrigger>
        <TabsTrigger value="two">Segunda área</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /max-w-full/);
  assert.match(html, /aria-selected="true"/);
});

test('dialog titles reserve space for the close button', () => {
  const html = renderToStaticMarkup(
    <DialogHeader>
      <h2>Configuração com título longo</h2>
    </DialogHeader>,
  );
  assert.match(html, /min-w-0/);
  assert.match(html, /pr-11/);
  assert.match(html, /Configuração com título longo/);
});

test('wrapped date controls stay left aligned and preserve the selected range', () => {
  const html = renderToStaticMarkup(
    <DateRangeFilter
      value={{ from: '2026-10-27', to: '2026-11-02' }}
      onChange={() => undefined}
      onRefresh={() => undefined}
      max="2026-11-02"
    />,
  );
  assert.doesNotMatch(html, /xl:ml-auto/);
  assert.match(html, /flex w-full flex-wrap items-end gap-2 xl:w-auto/);
  assert.match(html, /h-11 w-full sm:h-9/);
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  assert.equal(inputs.length, 2);
  assert.match(inputs[0], /value="2026-10-27"/);
  assert.match(inputs[0], /max="2026-11-02"/);
  assert.match(inputs[1], /value="2026-11-02"/);
  assert.match(inputs[1], /min="2026-10-27"/);
  assert.match(inputs[1], /max="2026-11-02"/);
});

test('status footer stays below content on mobile and desktop', () => {
  const html = renderToStaticMarkup(<MicroFooter />);
  assert.match(html, /aria-label="Status"/);
  assert.match(html, /relative/);
  assert.match(html, /border-t/);
  assert.doesNotMatch(html, /\b(?:fixed|absolute)\b/);
  const editor = renderToStaticMarkup(<MicroFooter floating />);
  assert.match(editor, /absolute bottom-3/);
});

test('tabs use theme tokens and legible labels without forcing uppercase', () => {
  const html = renderToStaticMarkup(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTrigger value="one">Financeiro</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  assert.match(html, /bg-bg-elevated/);
  assert.match(html, /text-muted-foreground/);
  assert.doesNotMatch(html, /text-white|uppercase|tracking-\[0\.18em\]/);
});

test('reading surfaces avoid backdrop blur and sidebar resizing is not animated', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  for (const selector of ['glass-card', 'surface-panel', 'tmx-sidebar']) {
    const block = css.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))?.[1];
    assert.ok(block, `${selector} is present`);
    assert.doesNotMatch(block, /backdrop-filter|transition:\s*width/);
  }
});
