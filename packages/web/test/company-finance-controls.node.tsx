import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanyMemberAccess } from '../src/components/admin/company-member-access';
import type { CompanyMember } from '../src/lib/api-client/endpoints-companies';

const member: CompanyMember = {
  user_id: 'synthetic-member',
  name: 'Colaborador de teste',
  email: 'member@example.test',
  role: 'member',
  status: 'active',
  tools: ['nav:scoped'],
  all_offers: false,
  offer_ids: [],
};

test('member permissions start collapsed with a named disclosure and unique panel target', () => {
  const html = renderToStaticMarkup(
    <>
      <CompanyMemberAccess member={member} offers={[]} canEdit isOwner save={async () => {}} />
      <CompanyMemberAccess
        member={{ ...member, user_id: 'another-member' }}
        offers={[]}
        canEdit
        isOwner
        save={async () => {}}
      />
    </>,
  );
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 2);
  const targets = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(targets).size, 2);
  assert.match(html, /Permissões/);
  assert.doesNotMatch(html, /<form/);
});

test('readonly members do not receive permission-edit controls', () => {
  const html = renderToStaticMarkup(
    <CompanyMemberAccess
      member={member}
      offers={[]}
      canEdit={false}
      isOwner={false}
      save={async () => {}}
    />,
  );
  assert.match(html, /Colaborador de teste/);
  assert.doesNotMatch(html, /<button|<form|aria-expanded/);
});

test('permission expansion preserves native selection and reduced-motion-safe feedback', () => {
  const source = readFileSync(
    new URL('../src/components/admin/company-member-access.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /id=\{panelId\}/);
  assert.match(source, /motion-safe:animate-\[tmx-tracking-section-in_/);
  assert.equal((source.match(/flex min-h-11 cursor-pointer/g) ?? []).length, 2);
  assert.match(source, /checked=\{access\.all_offers\}/);
  assert.match(source, /checked=\{access\.offer_ids\.includes\(offer\.id\)\}/);
  assert.match(source, /disabled=\{!isOwner\}/);
});

test('finance uses shared tab and action controls, with accessible native fields', () => {
  const source = readFileSync(
    new URL('../src/components/overview/finance-dashboard-preview.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /<TabsList aria-label="Seções do financeiro"/);
  assert.match(source, /<TabsContent key=\{tab\} value=\{tab\}/);
  assert.match(
    source,
    /onValueChange=\{\(value\) => \{\s+setTab\(value as \(typeof tabs\)\[number\]\);\s+setPage\(1\);/,
  );
  assert.match(source, /min-h-11 min-w-0/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-ring/);
  assert.match(source, /grid min-w-0 w-full gap-2 text-sm sm:max-w-xs sm:flex-1/);
  assert.match(source, /className="h-11 w-full sm:w-auto"/);
  assert.match(source, /aria-label="Páginas das movimentações"/);
  assert.match(source, /disabled=\{busy \|\| c\.status === 'disconnected'/);
  assert.doesNotMatch(source, /<button\b/);
});
