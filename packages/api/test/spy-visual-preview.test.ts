import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
  assert.equal(visualInput.safeParse({ ...input, offerId: 'sheet-33' }).success, true);
  assert.equal(visualInput.safeParse({ ...input, offerId: '../other-company' }).success, false);
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
test.each([false, true, 'creative'])(
  'company guard, persistence and no repeated billing (structure=%s)',
  async (structure) => {
    const payload = structure
      ? {
          ...input,
          kind: structure === 'creative' ? 'creative' : 'structure',
          ...(structure === 'creative' ? { creativeKey: 'PJR_ENG:AD01:L2' } : {}),
          assetKey: 'a'.repeat(64),
          ads: input.ads
            .slice(0, 1)
            .map((a) => ({ ...a, id: structure === 'creative' ? 'DriveFile123456' : a.id })),
          audio: null,
        }
      : input;
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
                text: JSON.stringify(
                  structure
                    ? {
                        hookType: 'text',
                        hook: 'Texto inicial',
                        endingType: 'trophy',
                        ending: 'Troféu final',
                        trophy: 'gold_cup',
                        trophyDescription: 'Taça dourada',
                        limitations: ['Quadros amostrados'],
                      }
                    : {
                        classification: 'variation',
                        reason: 'Alteração no texto do quadro.',
                        similarities: ['Mesma cena'],
                        differences: ['Texto diferente'],
                        limitations: ['Quadros amostrados, áudio não analisado.'],
                      },
                ),
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
        access: () =>
          ({
            companyId,
            canManage: enabled,
            allOffers: true,
            spy: true,
            ads: enabled,
            offerIds: [input.offerId],
          }) as never,
        config: async () => ({
          enabled: true,
          dailyLimitCents: 2000,
          headers: { authorization: 'Bearer test' },
        }),
      });
      return app;
    };
    let app = make();
    const call = (body = payload) =>
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
            payload,
          })
        ).statusCode,
        412,
      );
      assert.equal(calls, 0);
      assert.equal((await call()).json().cached, false);
      assert.equal(calls, 1);
      const results = await app.inject({
        method: 'GET',
        url: `/meta-control/traffic/ai/spy-visual/results?offerId=${input.offerId}${structure === 'creative' ? '&kind=creative' : structure ? '&kind=structure' : ''}`,
      });
      assert.equal(results.json().records.length, 1);
      const otherKind = await app.inject({
        method: 'GET',
        url: `/meta-control/traffic/ai/spy-visual/results?offerId=${input.offerId}${structure ? '' : '&kind=structure'}`,
      });
      assert.equal(otherKind.json().records.length, 0);
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
      const other = { ...payload, ads: payload.ads.map((a) => ({ ...a, text: 'new input' })) };
      assert.equal((await call(other)).statusCode, 502);
      assert.equal((await call(other)).statusCode, 409);
      assert.equal(calls, 2);
      const malformed = { status:'completed', output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}] };
      globalThis.fetch=async()=>{calls++;return Response.json(malformed);};
      const invalid={...payload,ads:payload.ads.map(a=>({...a,text:'invalid output'}))};
      assert.equal((await call(invalid)).statusCode,502);
      const directory=join(root,'spy-visual',companyId);
      const rows=await Promise.all((await readdir(directory)).map(async name=>JSON.parse(await readFile(join(directory,name),'utf8'))));
      const saved=rows.find(row=>row.provider);
      assert.deepEqual(saved.provider,malformed);
      assert.equal(saved.providerStatus,200);
      assert.equal((await call(invalid)).statusCode,409);
      assert.equal(calls,3);
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
