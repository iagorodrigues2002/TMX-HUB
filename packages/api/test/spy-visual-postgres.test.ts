import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import postgres from 'postgres';
import { test } from 'vitest';
import { registerSpyVisualPreview } from '../src/services/spy-visual-preview.js';

test.skipIf(!process.env.SPY_VISUAL_TEST_DATABASE_URL)(
  'durable production cache: concurrent requests, restart, company isolation and no rebilling',
  async () => {
    const url = new URL(process.env.SPY_VISUAL_TEST_DATABASE_URL!);
    assert.ok(
      ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/tmx_spy_visual_test',
    );
    const sql = postgres(url.toString(), { max: 2 });
    const company = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
    const other = '69706e9a-95ad-493e-b4ab-4a6de7541add';
    const offerId = '995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
    const original = globalThis.fetch;
    let calls = 0;
    let actor = company;
    let permitted = true;
    await sql`CREATE TABLE IF NOT EXISTS companies(id uuid PRIMARY KEY)`;
    await sql.unsafe(
      await readFile(new URL('../migrations/124_spy_visual_analysis.sql', import.meta.url), 'utf8'),
    );
    await sql`INSERT INTO companies(id) VALUES(${company}),(${other}) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM company_spy_visual_analyses`;
    const input = {
      companyId: company,
      offerId,
      ads: ['123', '456'].map((id) => ({
        id,
        text: 'test',
        frames: [{ second: 0, image: 'data:image/jpeg;base64,YWJj' }],
      })),
    };
    globalThis.fetch = async (target) => {
      assert.equal(target, 'https://api.openai.com/v1/responses');
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  classification: 'reused',
                  reason: 'same sampled frames',
                  similarities: [],
                  differences: [],
                  limitations: ['no audio'],
                }),
              },
            ],
          },
        ],
      });
    };
    const make = () => {
      const app = Fastify();
      app.decorate('db', sql as never);
      app.decorate('redis', { eval: async () => 1 } as never);
      registerSpyVisualPreview(app, {
        root: '/unused',
        production: true,
        access: () =>
          ({ companyId: actor, canManage: permitted, allOffers: true, spy: true }) as never,
        recheck: async () => true,
        config: async () => ({
          enabled: true,
          dailyLimitCents: 2000,
          headers: { authorization: 'Bearer test' },
        }),
      });
      return app;
    };
    let app = make();
    const call = () =>
      app.inject({ method: 'POST', url: '/meta-control/traffic/ai/spy-visual', payload: input });
    try {
      const responses = await Promise.all([call(), call()]);
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
      assert.equal(calls, 1);
      await app.close();
      app = make();
      assert.equal((await call()).json().cached, true);
      assert.equal(calls, 1);
      const list = () =>
        app.inject({
          method: 'GET',
          url: `/meta-control/traffic/ai/spy-visual/results?offerId=${offerId}`,
        });
      assert.equal((await list()).json().records.length, 1);
      actor = other;
      assert.equal((await list()).json().records.length, 0);
      assert.equal((await call()).statusCode, 403);
      actor = company;
      permitted = false;
      assert.equal((await call()).statusCode, 403);
      assert.equal((await list()).statusCode, 403);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
      await app.close();
      await sql.end();
    }
  },
);
