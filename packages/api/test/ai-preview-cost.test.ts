import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import Redis from 'ioredis';
import {
  costMicros,
  reserveMicros,
  RESERVE_BUDGET,
  SETTLE_BUDGET,
  RELEASE_LOCK,
  budgetKey,
} from '../src/services/ai-preview-cost.js';
import { parseProviderRequest } from '../scripts/ai-preview-bridge.mjs';

let child: ChildProcess;
let redis: Redis;
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp('/tmp/tmx-ai-cost-test-');
  child = spawn(
    'redis-server',
    [
      '--port',
      '0',
      '--unixsocket',
      join(directory, 'redis.sock'),
      '--save',
      '',
      '--appendonly',
      'no',
    ],
    { stdio: 'pipe' },
  );
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(Error('Disposable Redis exited: ' + code)));
    child.stdout!.on('data', (chunk) => {
      if (/ready to accept connections/i.test(String(chunk))) resolve();
    });
  });
  redis = new Redis(join(directory, 'redis.sock'), { lazyConnect: true });
  await redis.connect();
}, 10000);
afterAll(async () => {
  if (redis) await redis.quit();
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('reserves worst-case cost and rejects oversized or invalid token counts', () => {
  expect(reserveMicros(1200)).toBe(33000);
  expect(reserveMicros(50000)).toBe(155000);
  for (const n of [-1, 1.5, 50001, NaN]) expect(() => reserveMicros(n)).toThrow();
});
it('prices ordinary, cached, cache-write and output tokens once, including reasoning in output', () => {
  const response = {
    model: 'gpt-6.1-sol',
    service_tier: 'default',
    usage: {
      input_tokens: 1200,
      output_tokens: 200,
      total_tokens: 1400,
      input_tokens_details: { cached_tokens: 400, cache_write_tokens: 500 },
      output_tokens_details: { reasoning_tokens: 100 },
    },
  };
  expect(costMicros(response)).toBe(3890);
  for (const value of [
    { ...response, service_tier: 'priority' },
    { ...response, model: 'other' },
    { ...response, usage: { ...response.usage, total_tokens: 1500 } },
    { ...response, usage: { input_tokens: 1200, output_tokens: 200 } },
    {
      ...response,
      usage: {
        ...response.usage,
        input_tokens_details: { cached_tokens: 900, cache_write_tokens: 500 },
      },
    },
  ])
    expect(costMicros(value)).toBeNull();
});
it('atomically rejects competing reservations beyond the company cap and isolates another company', async () => {
  const a = budgetKey('a', '2026-11-12'),
    b = budgetKey('b', '2026-11-12');
  const result = await Promise.all([
    redis.eval(RESERVE_BUDGET, 2, a, 'hold-a1', 600, 1000),
    redis.eval(RESERVE_BUDGET, 2, a, 'hold-a2', 600, 1000),
  ]);
  expect(result.sort()).toEqual([0, 1]);
  expect(await redis.get(a)).toBe('600');
  expect(await redis.eval(RESERVE_BUDGET, 2, b, 'hold-b1', 600, 1000)).toBe(1);
  expect(await redis.get(b)).toBe('600');
});
it('settles only once and keeps uncertain requests reserved', async () => {
  const k = budgetKey('c', '2026-11-12');
  await redis.eval(RESERVE_BUDGET, 2, k, 'hold-c1', 600, 1000);
  expect(await redis.eval(RESERVE_BUDGET, 2, k, 'hold-c1', 600, 1000)).toBe(-1);
  expect(await redis.get(k)).toBe('600');
  expect(await redis.eval(SETTLE_BUDGET, 2, k, 'hold-c1', 100)).toBe(1);
  expect(await redis.get(k)).toBe('100');
  expect(await redis.eval(SETTLE_BUDGET, 2, k, 'hold-c1', 100)).toBe(0);
  expect(await redis.get(k)).toBe('100');
});
it('never releases another request lock and keeps midnight budgets separate', async () => {
  await redis.set('lock', 'new-owner');
  await redis.eval(RELEASE_LOCK, 1, 'lock', 'old-owner');
  expect(await redis.get('lock')).toBe('new-owner');
  await redis.eval(RELEASE_LOCK, 1, 'lock', 'new-owner');
  expect(await redis.get('lock')).toBeNull();
  expect(budgetKey('a', '2026-11-12')).not.toBe(budgetKey('a', '2026-11-13'));
});
it('bridge allows only text counting/generation with fixed privacy, model and price tier', () => {
  const core = {
    model: 'gpt-6.1-sol',
    instructions: 'read only',
    input: [{ role: 'user', content: 'data' }],
  };
  const body = {
    ...core,
    store: false,
    service_tier: 'default',
    prompt_cache_options: { mode: 'explicit' },
    reasoning: { effort: 'low' },
    max_output_tokens: 3000,
  };
  expect(parseProviderRequest('/responses', body).success).toBe(true);
  expect(parseProviderRequest('/input-tokens', core).success).toBe(true);
  for (const extra of [
    { tools: [] },
    { background: true },
    { store: true },
    { service_tier: 'priority' },
    { prompt_cache_options: { mode: 'implicit' } },
    { conversation: 'other-company' },
    { previous_response_id: 'secret' },
    { model: 'other' },
    { input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'file-1' }] }] },
  ])
    expect(parseProviderRequest('/responses', { ...body, ...extra }).success).toBe(false);
});
