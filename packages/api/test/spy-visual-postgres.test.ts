import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import postgres from 'postgres';
import { test } from 'vitest';
import { registerSpyVisualPreview } from '../src/services/spy-visual-preview.js';

test('production startup includes the durable visual cache migration', async () => {
  assert.ok((await readFile(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8')).includes("'124_spy_visual_analysis.sql'"));
  assert.ok((await readFile(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8')).includes("'126_spy_transcriptions.sql'"));
});

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
    const offerId = 'sheet-33';
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
    await sql`INSERT INTO company_spy_visual_analyses(company_id,fingerprint,offer_id,record) VALUES(${company},${'a'.repeat(64)},'995e6bfd-8c26-47fb-9614-0a02a7dd97b0','{}')`;
    await sql.unsafe(await readFile(new URL('../migrations/125_spy_visual_legacy_offers.sql', import.meta.url), 'utf8'));
    assert.equal((await sql`SELECT offer_id FROM company_spy_visual_analyses`)[0]?.offer_id, '995e6bfd-8c26-47fb-9614-0a02a7dd97b0');
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
      assert.ok(responses.some((r) => r.statusCode === 200));
      assert.ok(responses.every((r) => [200, 409].includes(r.statusCode)));
      assert.equal(responses.filter((r) => r.statusCode === 200 && !r.json().cached).length, 1);
      assert.equal(calls, 1);
      permitted = true;
      await sql.unsafe(await readFile(new URL('../migrations/126_spy_transcriptions.sql', import.meta.url), 'utf8'));
      await sql`DELETE FROM company_spy_transcriptions`;
      const audio = Buffer.alloc(32044);
      audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
      audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(32000, 40);
      let audioCalls = 0;
      globalThis.fetch = async (target, opts) => {
        assert.equal(target, 'https://api.openai.com/v1/audio/transcriptions');
        assert.equal((opts?.body as FormData).get('model'), 'gpt-transcribe');
        audioCalls++;
        return Response.json({ text: 'Transcrição persistida.', usage: { type: 'duration', seconds: 1 } });
      };
      const transcribe = () => app.inject({ method: 'POST', url: '/meta-control/traffic/ai/spy-transcription', payload: { companyId: company, audio: audio.toString('base64') } });
      const transcripts = await Promise.all([transcribe(), transcribe()]);
      assert.ok(transcripts.every(r => [200,409].includes(r.statusCode)));
      assert.equal(audioCalls, 1);
      await app.close(); app = make();
      const savedTranscript = await transcribe();
      assert.equal(savedTranscript.json().cached, true);
      assert.equal(savedTranscript.json().text, 'Transcrição persistida.');
      assert.equal(audioCalls, 1);
      actor = other; assert.equal((await transcribe()).statusCode, 403); actor = company;
      const analysis = { kind: 'music', description: 'Instrumental', musicStyle: 'electronic', hook: 'Entrada instrumental', ending: 'Fade', text: '' };
      globalThis.fetch = async (target) => {
        assert.equal(target, 'https://api.openai.com/v1/chat/completions');
        audioCalls++;
        return Response.json({ model: 'gpt-audio-1.5', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(analysis) } }] });
      };
      const analyze = () => app.inject({ method: 'POST', url: '/meta-control/traffic/ai/spy-transcription', payload: { companyId: company, audio: audio.toString('base64'), analyze: true } });
      const analyzed = await Promise.all([analyze(), analyze()]);
      assert.ok(analyzed.every(r => [200,409].includes(r.statusCode)));
      assert.equal(audioCalls, 2);
      await app.close(); app = make();
      assert.equal((await analyze()).json().cached, true);
      assert.deepEqual((await analyze()).json().analysis, analysis);
      assert.equal(audioCalls, 2);
      actor = other; assert.equal((await analyze()).statusCode, 403); actor = company;
      const structure = { hookType: 'presenter', hook: 'Apresentadora', endingType: 'trophy', ending: 'Troféu dourado', trophy: 'gold_cup', trophyDescription: 'Taça dourada', limitations: ['Amostras de quadros'] };
      globalThis.fetch = async () => { calls++; return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(structure) }] }] }); };
      const structureInput = { ...input, kind: 'structure', assetKey: 'b'.repeat(64), ads: input.ads.slice(0,1), audio: null };
      const summarize = () => app.inject({ method: 'POST', url: '/meta-control/traffic/ai/spy-visual', payload: structureInput });
      const summaries = await Promise.all([summarize(), summarize()]);
      assert.ok(summaries.every(r => [200,409].includes(r.statusCode)), summaries.map(r => r.body).join('\n'));
      assert.equal(calls, 2);
      await app.close(); app = make();
      assert.equal((await summarize()).json().cached, true);
      assert.equal(calls, 2);
      actor = other; assert.equal((await summarize()).statusCode, 403); actor = company;
      globalThis.fetch = original;
      await app.close();
      app = make();
      assert.equal((await call()).json().cached, true);
      assert.equal(calls, 2);
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
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = original;
      await app.close();
      await sql.end();
    }
  },
);
