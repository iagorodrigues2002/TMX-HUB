import assert from 'node:assert/strict';
import test from 'node:test';
import { loginDestination, loginFailure } from '../src/lib/login-presentation.ts';
test('login preserves internal destination and rejects external or ambiguous redirects', () => {
  assert.equal(loginDestination('/ofertas?status=ativa'), '/ofertas?status=ativa');
  for (const value of [
    null,
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/\nexample',
  ])
    assert.equal(loginDestination(value), '/');
});
test('login failures are actionable and never echo raw server details', () => {
  assert.match(loginFailure({ status: 401 }), /senha/);
  assert.match(loginFailure(new Error('HTTP 429')), /Aguarde/);
  assert.match(loginFailure({ status: 403 }), /administrador/);
  assert.doesNotMatch(loginFailure(new Error('HTTP 500 SECRET')), /HTTP|SECRET/);
});
