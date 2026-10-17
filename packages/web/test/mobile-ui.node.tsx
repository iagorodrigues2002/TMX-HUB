import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../src/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../src/components/ui/tabs';
import { DialogHeader } from '../src/components/ui/dialog';
import { MicroFooter } from '../src/components/hub/micro-footer';

test('compact buttons retain mobile touch targets without changing disabled semantics', () => {
  const html = renderToStaticMarkup(<Button size="sm" disabled>Salvar</Button>);
  assert.match(html, /min-h-11/);
  assert.match(html, /min-w-11/);
  assert.match(html, /sm:min-h-0/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Salvar/);
});

test('mobile tabs remain keyboard accessible inside a bounded horizontal strip', () => {
  const html = renderToStaticMarkup(<Tabs defaultValue="one">
    <TabsList aria-label="Áreas"><TabsTrigger value="one">Primeira área</TabsTrigger>
      <TabsTrigger value="two">Segunda área</TabsTrigger></TabsList>
  </Tabs>);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /max-w-full/);
  assert.match(html, /aria-selected="true"/);
});

test('dialog titles reserve space for the close button', () => {
  const html = renderToStaticMarkup(<DialogHeader><h2>Configuração com título longo</h2></DialogHeader>);
  assert.match(html, /min-w-0/);
  assert.match(html, /pr-11/);
  assert.match(html, /Configuração com título longo/);
});

test('mobile footer stays in document flow, leaving fixed positioning to desktop', () => {
  const html = renderToStaticMarkup(<MicroFooter />);
  assert.match(html, /aria-label="Status"/);
  assert.match(html, /relative/);
  assert.match(html, /sm:fixed/);
  assert.doesNotMatch(html, /class="[^"]*(?<!:)\bfixed\s/);
});
