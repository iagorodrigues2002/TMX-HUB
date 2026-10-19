import { fetchPage } from '@page-cloner/core';
import { Worker } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStore } from '../src/services/job-store.js';
import { createRenderWorker } from '../src/workers/render.worker.js';

vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })) }));
vi.mock('../src/lib/redis.js', () => ({ makeRedis: vi.fn(() => ({})) }));
vi.mock('../src/env.js', () => ({
  env: { MAX_RENDER_TIMEOUT_MS: 10, MAX_ASSET_BYTES: 1024, MAX_TOTAL_BYTES: 1024 },
}));
vi.mock('../src/lib/logger.js', () => {
  const logger = { child: () => logger, info: vi.fn(), error: vi.fn() };
  return { logger };
});
vi.mock('../src/services/webhook.js', () => ({ fireWebhook: vi.fn() }));
vi.mock('@page-cloner/core', () => ({
  fetchPage: vi.fn(),
  sanitize: vi.fn(async (html: string) => ({ html, removed: {} })),
  resolveAssets: vi.fn(async (html: string) => ({ html, assets: { entries: [], byUrl: {} } })),
  extractForms: vi.fn(() => []),
  extractLinks: vi.fn(() => []),
}));

const sourceUrl = 'https://fixture.test/page';
const fetched = {
  html: '<html><body>Fixture</body></html>',
  finalUrl: sourceUrl,
  statusCode: 200,
  headers: {},
  detectedChallenge: null,
  renderedAt: '2026-10-18T12:00:00.000Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(fetchPage).mockReset().mockResolvedValue(fetched);
});
afterEach(() => vi.useRealTimers());

async function fixture() {
  const hashes = new Map<string, Record<string, string>>();
  const redis = {
    hgetall: async (key: string) => hashes.get(key) ?? {},
    hset: async (key: string, value: Record<string, string>) => {
      hashes.set(key, { ...hashes.get(key), ...value });
      return 1;
    },
  };
  const storage = { putJson: vi.fn() };
  const jobStore = new JobStore(redis as never, storage as never);
  await jobStore.createClone({ id: 'render-a', sourceUrl, options: { renderMode: 'static' } });
  createRenderWorker({ redisUrl: 'redis://fixture.invalid', jobStore, storage: storage as never });
  const processor = vi.mocked(Worker).mock.calls[0]?.[1];
  if (typeof processor !== 'function') throw new Error('Render processor was not registered.');
  const run = () => processor({ data: { jobId: 'render-a', url: sourceUrl } } as never);
  return { jobStore, storage, run };
}

describe('render worker cooperative cancellation', () => {
  it('retains timeout failure without saving or becoming ready after a late fetch', async () => {
    let resolveFetch!: (value: typeof fetched) => void;
    const lateFetch = new Promise<typeof fetched>((resolve) => {
      resolveFetch = resolve;
    });
    let markStarted!: (signal: AbortSignal) => void;
    const started = new Promise<AbortSignal>((resolve) => {
      markStarted = resolve;
    });
    vi.mocked(fetchPage).mockImplementationOnce(async (_url, options) => {
      markStarted(options!.signal!);
      return lateFetch;
    });
    const { jobStore, storage, run } = await fixture();
    const outcome = run().catch((error: unknown) => error);
    const signal = await started;
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(5010);
    expect(await outcome).toMatchObject({
      code: 'render_timeout',
      message: 'Operation timed out after 5010ms',
    });
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ code: 'render_timeout' });
    const failure = await jobStore.getCloneMeta('render-a');
    expect(failure).toMatchObject({ status: 'failed', errorCode: 'render_timeout', progress: 100 });

    // The dependency deliberately ignores abort and settles after the worker has failed.
    resolveFetch(fetched);
    await vi.advanceTimersByTimeAsync(0);
    expect(await jobStore.getCloneMeta('render-a')).toEqual(failure);
    expect(storage.putJson).not.toHaveBeenCalled();
  });

  it('preserves a fetch failure and cancels the shared signal', async () => {
    const failure = Object.assign(new Error('Fixture DNS failed.'), { code: 'dns_failure' });
    vi.mocked(fetchPage).mockRejectedValueOnce(failure);
    const { jobStore, storage, run } = await fixture();
    await expect(run()).rejects.toBe(failure);
    expect(await jobStore.getCloneMeta('render-a')).toMatchObject({
      status: 'failed',
      errorCode: 'dns_failure',
      errorMessage: failure.message,
    });
    const signal = vi.mocked(fetchPage).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toBe(failure);
    expect(storage.putJson).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('saves the state and reaches ready when fetching finishes before the deadline', async () => {
    const { jobStore, storage, run } = await fixture();
    await run();
    expect(storage.putJson).toHaveBeenCalledWith(
      'clones/render-a/state.json',
      expect.objectContaining({ jobId: 'render-a', status: 'ready', html: fetched.html }),
    );
    expect(await jobStore.getCloneMeta('render-a')).toMatchObject({
      status: 'ready',
      progress: 100,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
