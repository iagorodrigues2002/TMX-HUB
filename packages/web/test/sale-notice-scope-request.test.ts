import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveSaleNoticeScope } from '../src/components/hub/sale-notice-scope-menu';

test('sends personal sale preferences as a JSON object, not an encoded string', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.method, 'PUT');
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body, { scope: 'own' });
    return Response.json(body);
  };
  try {
    assert.deepEqual(await saveSaleNoticeScope('own'), { scope: 'own' });
  } finally {
    globalThis.fetch = original;
  }
});
