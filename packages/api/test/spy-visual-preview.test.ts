import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { test } from 'vitest';
import {
  registerSpyVisualPreview,
  visualFingerprint,
  visualInput,
} from '../src/services/spy-visual-preview.js';
const companyId = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
const input = {
  companyId,
  offerId: '995e6bfd-8c26-47fb-9614-0a02a7dd97b0',
  ads: ['123', '456'].map((id) => ({
    id,
    text: 'Copy',
    frames: [{ second: 0, image: 'data:image/jpeg;base64,YWJj' }],
  })),
};
test('cache includes company, media, copy and comparison direction; rejects remote images', () => {
  const parsed = visualInput.parse(input);
  assert.notEqual(
    visualFingerprint(parsed),
    visualFingerprint({ ...parsed, companyId: '69706e9a-95ad-493e-b4ab-4a6de7541add' }),
  );
  assert.notEqual(
    visualFingerprint(parsed),
    visualFingerprint({ ...parsed, ads: [...parsed.ads].reverse() }),
  );
  assert.notEqual(
    visualFingerprint(parsed),
    visualFingerprint({ ...parsed, ads: parsed.ads.map((a) => ({ ...a, text: 'Changed' })) }),
  );
  assert.equal(
    visualInput.safeParse({
      ...input,
      ads: input.ads.map((a) => ({
        ...a,
        frames: [{ second: 0, image: 'https://example.com/x.jpg' }],
      })),
    }).success,
    false,
  );
});
test('company guard, persistence across restart, no repeated billing, pending attempts fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-visual-test-'));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let enabled = true;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                classification: 'variation',
                reason: 'Alteração no texto do quadro.',
                similarities: ['Mesma cena'],
                differences: ['Texto diferente'],
                limitations: ['Quadros amostrados, áudio não analisado.'],
              }),
            },
          ],
        },
      ],
    });
  };
  const make = () => {
    const app = Fastify();
    app.decorate('redis', { eval: async () => 1 } as never);
    registerSpyVisualPreview(app, {
      root,
      recheck: async () => true,
      access: () => ({ companyId, canManage: enabled, allOffers: true, spy: true }) as never,
      config: async () => ({
        enabled: true,
        dailyLimitCents: 2000,
        headers: { authorization: 'Bearer test' },
      }),
    });
    return app;
  };
  let app = make();
  const call = (body = input) =>
    app.inject({ method: 'POST', url: '/meta-control/traffic/ai/spy-visual', payload: body });
  try {
    assert.equal(
      (await call({ ...input, companyId: '69706e9a-95ad-493e-b4ab-4a6de7541add' })).statusCode,
      403,
    );
    assert.equal(calls, 0);
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/spy-visual?cachedOnly=1',
          payload: input,
        })
      ).statusCode,
      412,
    );
    assert.equal(calls, 0);
    assert.equal((await call()).json().cached, false);
    assert.equal(calls, 1);
    await app.close();
    app = make();
    assert.equal((await call()).json().cached, true);
    assert.equal(calls, 1);
    enabled = false;
    assert.equal((await call()).statusCode, 403);
    enabled = true;
    globalThis.fetch = async () => {
      calls++;
      throw Error('timeout');
    };
    const other = { ...input, ads: input.ads.map((a) => ({ ...a, text: 'new input' })) };
    assert.equal((await call(other)).statusCode, 502);
    assert.equal((await call(other)).statusCode, 409);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
