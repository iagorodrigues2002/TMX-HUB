import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Form, Link } from '@page-cloner/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormEditor } from '../src/components/editor/form-editor';
import { LinkEditor } from '../src/components/editor/link-editor';
import { OfferMemberPicker } from '../src/components/ofertas/offer-member-picker';
import type { AuthUser } from '../src/lib/api-client';

function assertUniqueLabelTargets(html: string, count: number) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const targets = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(targets.length, count);
  assert.equal(new Set(ids).size, ids.length, 'IDs must not collide between component instances');
  for (const target of targets) assert.ok(ids.includes(target), `Missing label target: ${target}`);
}

test('member labels target their own native checkbox across picker instances', () => {
  const member = {
    id: 'fixture-member',
    name: 'Fixture',
    email: 'member@example.invalid',
    role: 'user',
  } as AuthUser;
  const html = renderToStaticMarkup(
    <>
      <OfferMemberPicker members={[member]} selected={[]} onChange={() => {}} />
      <OfferMemberPicker members={[member]} selected={[member.id]} onChange={() => {}} />
    </>,
  );
  assertUniqueLabelTargets(html, 2);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
});

test('editor labels remain associated and unique for original and editable controls', () => {
  const form: Form = {
    id: 'form',
    selector: 'form',
    originalAction: '/before',
    currentAction: '/after',
    method: 'POST',
    mode: 'capture_redirect',
    redirectTo: '/done',
    fields: [],
  };
  const link: Link = {
    id: 'link',
    selector: 'a',
    originalHref: '/before',
    currentHref: '/after',
    text: 'Fixture',
    isExternal: false,
    isCta: false,
  };
  const client = new QueryClient();
  try {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <FormEditor jobId="fixture-job" form={form} />
        <FormEditor jobId="fixture-job" form={form} />
        <LinkEditor jobId="fixture-job" link={link} />
        <LinkEditor jobId="fixture-job" link={link} />
      </QueryClientProvider>,
    );
    assertUniqueLabelTargets(html, 12);
  } finally {
    client.clear();
  }
});

test('editor selection keys preserve reset when two selections have equal saved values', () => {
  const source = readFileSync(
    new URL('../src/components/editor/edit-panel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /<FormEditor\s+key=\{form\.id\}/);
  assert.match(source, /<LinkEditor\s+key=\{link\.id\}/);
});
