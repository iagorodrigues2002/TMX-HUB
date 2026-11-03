import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectScope, scopeToAllowedTools } from '../src/components/settings/users-section-support';
import { type AuthUser, canAccessTool } from '../src/lib/api-client/auth-types';
import { companyMemberSchema } from '../src/lib/api-client/endpoints-companies';
import { visibleToolCatalog } from '../src/lib/tool-catalog';

const user: AuthUser = {
  id: 'member',
  name: 'Member',
  email: 'm@example.test',
  role: 'user',
  createdAt: '',
};

test('explicit empty permissions deny every tool without converting to full access', () => {
  const restricted = { ...user, allowedTools: [] };
  assert.equal(canAccessTool(restricted, 'ofertas'), false);
  assert.equal(canAccessTool(restricted, 'creative-studio'), false);
  assert.deepEqual(visibleToolCatalog(restricted), []);
  assert.equal(detectScope(restricted), 'custom');
  assert.deepEqual(scopeToAllowedTools('custom', []), []);
  assert.equal(scopeToAllowedTools('full', []), null);
});

test('legacy absent permissions and explicit platform admins retain access', () => {
  assert.equal(canAccessTool(user, 'ofertas'), true);
  assert.equal(canAccessTool({ ...user, role: 'admin', allowedTools: [] }, 'ofertas'), true);
  assert.equal(canAccessTool({ ...user, allowedTools: ['video-shield'] }, 'creative-studio'), true);
  assert.equal(canAccessTool({ ...user, allowedTools: ['video-shield'] }, 'ofertas'), false);
});

test('unavailable member identity remains visible for access revocation', () => {
  assert.equal(
    companyMemberSchema.safeParse({
      user_id: 'deleted',
      name: 'Indisponível',
      email: null,
      role: 'member',
      status: 'suspended',
      tools: [],
      all_offers: false,
      offer_ids: [],
    }).success,
    true,
  );
});
