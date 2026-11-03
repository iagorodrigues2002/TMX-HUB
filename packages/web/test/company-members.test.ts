import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { companyApi, companyMemberSchema } from '../src/lib/api-client/endpoints-companies';

test('company membership rejects incomplete data and unknown permission keys', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ notifications: [], offers: [] }));
  await assert.rejects(companyApi.list());
  await assert.rejects(companyApi.members('company-a'));
  assert.equal(
    companyMemberSchema.safeParse({
      user_id: 'member',
      name: 'Member',
      email: 'm@example.test',
      role: 'admin',
      status: 'active',
      tools: ['global-admin'],
      all_offers: false,
      offer_ids: [],
    }).success,
    false,
  );
});

test('adding a member starts with no offers or tools and no global role', async (t) => {
  let sent: Record<string, unknown> = {};
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    sent = JSON.parse(String(options?.body));
    return Response.json({ member: { user_id: 'member' } });
  });
  await companyApi.add('company-a', 'member@example.test');
  assert.deepEqual(sent, {
    email: 'member@example.test',
    role: 'member',
    tools: [],
    all_offers: false,
    offer_ids: [],
  });
});

test('permission save waits for the server and propagates rejected authorization', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ title: 'Forbidden', detail: 'Acesso negado.' }, { status: 403 }),
  );
  await assert.rejects(
    companyApi.save('company-a', 'other-user', {
      role: 'member',
      status: 'active',
      tools: [],
      all_offers: false,
      offer_ids: [],
    }),
  );
});

test('real company page does not load demonstration state and scopes queries by principal', () => {
  const source = readFileSync(
    new URL('../src/components/admin/company-members.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /initialMembersPreview|localStorage|sessionStorage|MembersPreview/);
  assert.match(source, /\['company-members', userId, company\.id\]/);
  assert.match(source, /\['companies', user\?\.id\]/);
  assert.match(source, /company\.role === 'owner' \|\| company\.role === 'admin'/);
});
