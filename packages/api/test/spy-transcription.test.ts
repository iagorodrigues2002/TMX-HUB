import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { test } from 'vitest';
import { registerSpyTranscription, spyWavDuration } from '../src/services/spy-transcription.js';

function wav() {
  const b = Buffer.alloc(32044);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(32000, 40);
  return b;
}
test('duration is measured from bounded PCM bytes, not user supplied duration', () => {
  assert.equal(spyWavDuration(wav()), 1);
  assert.throws(() => spyWavDuration(Buffer.from('fake')));
  const stereo = wav();
  stereo.writeUInt16LE(2, 22);
  assert.throws(() => spyWavDuration(stereo));
  const truncated = wav();
  truncated.writeUInt32LE(64000, 40);
  assert.throws(() => spyWavDuration(truncated));
  const long=Buffer.alloc(770*32000+44);wav().copy(long,0,0,44);
  long.writeUInt32LE(long.length-8,4);long.writeUInt32LE(long.length-44,40);
  assert.throws(()=>spyWavDuration(long));
  assert.equal(spyWavDuration(long,1800),770);
});
test.each([false, true])(
  'transcripts and audio analyses persist, deduplicate and isolate companies (analyze=%s)',
  async (analyze) => {
    const root = await mkdtemp(join(tmpdir(), 'tmx-audio-test-'));
    const oldFetch = globalThis.fetch;
    let calls = 0;
    let fail = false;
    let allowed = true;
    let recheck = true;
    let budget = 1;
    let companyId = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
    globalThis.fetch = async (_url, opts) => {
      calls++;
      assert.equal(
        JSON.parse(String(opts?.body)).model,
        analyze ? 'gpt-audio-1.5' : 'gpt-transcribe',
      );
      await new Promise((r) => setTimeout(r, 10));
      if (fail) throw Error('timeout');
      if (analyze)
        return Response.json({
          model: 'gpt-audio-1.5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  kind: 'music',
                  description: 'Instrumental',
                  musicStyle: 'electronic',
                  hook: 'Beat',
                  ending: 'Fade',
                  text: '',
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 20,
            prompt_tokens_details: { audio_tokens: 100 },
          },
        });
      return Response.json({
        text: 'Texto falado no vídeo.',
        usage: { type: 'duration', seconds: 1 },
      });
    };
    const make = () => {
      const app = Fastify();
      app.decorate('redis', { eval: async () => budget } as never);
      registerSpyTranscription(app, {
        root,
        access: () =>
          ({ companyId, canManage: allowed, allOffers: true, spy: true, revision: 'a' }) as never,
        recheck: async () => recheck,
        config: async () => ({
          enabled: true,
          dailyLimitCents: 100,
          headers: { authorization: 'Bearer synthetic' },
        }),
      });
      return app;
    };
    let app = make();
    const body = () => ({
      companyId,
      audio: wav().toString('base64'),
      ...(analyze ? { analyze: true } : {}),
    });
    const call = (cachedOnly = false) =>
      app.inject({
        method: 'POST',
        url: `/meta-control/traffic/ai/spy-transcription${cachedOnly ? '?cachedOnly=1' : ''}`,
        payload: body(),
      });
    try {
      assert.equal((await call(true)).statusCode, 412);
      assert.equal(calls, 0);
      allowed = false;
      assert.equal((await call()).statusCode, 403);
      allowed = true;
      const pair = await Promise.all([call(), call()]);
      assert.equal(pair.filter((r) => r.statusCode === 200).length, 1);
      assert.equal(calls, 1);
      assert.equal(pair.find((r) => r.statusCode === 200)!.json().costMicros, analyze ? 3450 : 75);
      await app.close();
      app = make();
      assert.equal((await call(true)).json().cached, true);
      assert.equal(calls, 1);
      companyId = '69706e9a-95ad-493e-b4ab-4a6de7541add';
      assert.equal((await call(true)).statusCode, 412);
      budget = 0;
      assert.equal((await call()).statusCode, 429);
      assert.equal(calls, 1);
      budget = 1;
      fail = true;
      assert.equal((await call()).statusCode, 502);
      fail = false;
      assert.equal((await call()).statusCode, 409);
      assert.equal(calls, 2);
      companyId = '69706e9a-95ad-493e-b4ab-4a6de7541ade';
      recheck = false;
      assert.equal((await call()).statusCode, 403);
      assert.equal(
        (
          await app.inject({
            method: 'POST',
            url: '/meta-control/traffic/ai/spy-transcription',
            payload: { ...body(), companyId: '69706e9a-95ad-493e-b4ab-4a6de7541adc' },
          })
        ).statusCode,
        403,
      );
    } finally {
      globalThis.fetch = oldFetch;
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
