import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompanyMemberAccess } from '../src/components/admin/company-member-access';
import { CompanyMemberPlatformRole } from '../src/components/admin/company-member-platform-role';
import { type CompanyMember, companyMemberSchema } from '../src/lib/api-client/endpoints-companies';
import { endpoints } from '../src/lib/api-client/endpoints-users';

const member: CompanyMember = {
  user_id: 'local-member',
  name: 'Membro de teste',
  email: 'member@example.test',
  role: 'admin',
  platform_role: 'admin',
  status: 'active',
  tools: [],
  all_offers: true,
  offer_ids: [],
};

test('global administration and company role are displayed separately', () => {
  const html = renderToStaticMarkup(
    <CompanyMemberAccess member={member} offers={[]} canEdit isOwner save={async () => {}} />,
  );
  assert.match(html, /Administrador da empresa/);
  assert.match(html, /Administrador global/);
  assert.match(html, /Papel na plataforma/);
  assert.doesNotMatch(html, /Alterar acesso global/);
});

test('only the explicit global editor can change platform roles', () => {
  const html = renderToStaticMarkup(
    <CompanyMemberPlatformRole member={member} save={async () => {}} />,
  );
  assert.match(html, /Alterar acesso global de Membro de teste/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /<form/);
  const companyAdmin = renderToStaticMarkup(
    <CompanyMemberPlatformRole member={{ ...member, platform_role: 'user' }} />,
  );
  assert.match(companyAdmin, /Sem administração global/);
  assert.doesNotMatch(companyAdmin, /<button/);
});

test('missing platform role is not guessed or editable when an older API responds', () => {
  for (const role of [null, undefined]) {
    const html = renderToStaticMarkup(
      <CompanyMemberPlatformRole
        member={{ ...member, platform_role: role }}
        save={async () => {}}
      />,
    );
    assert.match(html, /Papel global indisponível/);
    assert.doesNotMatch(html, /<button|Administrador global/);
  }
  assert.equal(companyMemberSchema.safeParse({ ...member, platform_role: 'owner' }).success, false);
  assert.equal(companyMemberSchema.safeParse({ ...member, role: 'global-admin' }).success, false);
});

test('global role mutation reuses the admin endpoint without sending company permissions', async (t) => {
  let request: { url?: string; method?: string; body?: unknown } = {};
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = {
      url: String(url),
      method: options?.method,
      body: JSON.parse(String(options?.body)),
    };
    return Response.json({
      id: member.user_id,
      name: member.name,
      email: member.email,
      role: 'admin',
      created_at: '2026-11-03',
    });
  });
  const updated = await endpoints.updateUser(member.user_id, { role: 'admin' });
  assert.ok(request.url?.endsWith(`/v1/users/${member.user_id}`));
  assert.equal(request.method, 'PATCH');
  assert.deepEqual(request.body, { role: 'admin' });
  assert.equal(updated.role, 'admin');
});

test('global controls require confirmation, await server acceptance, and refresh both views', () => {
  const control = readFileSync(
    new URL('../src/components/admin/company-member-platform-role.tsx', import.meta.url),
    'utf8',
  );
  const container = readFileSync(
    new URL('../src/components/admin/company-members.tsx', import.meta.url),
    'utf8',
  );
  assert.match(control, /if \(!changed \|\| !confirmed \|\| saving \|\| !role\) return/);
  assert.match(control, /await save\(member\.user_id, role\);\s*setEditing\(false\)/);
  assert.match(
    control,
    /setRole\(event\.target\.value as 'admin' \| 'user'\);\s*setConfirmed\(false\)/,
  );
  assert.match(container, /user\?\.role === 'admin' \? savePlatformRole : undefined/);
  for (const key of ['company-members', 'users-list', 'admin-overview']) {
    assert.ok(container.includes(`invalidateQueries({ queryKey: ['${key}'] })`));
  }
  assert.match(container, /if \(id === userId\) await refreshAuth\(\)/);
});
