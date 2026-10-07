import { describe, expect, it, vi } from 'vitest';
import {
  isRetryablePostgresError,
  withPostgresConnectionRetry,
} from '../src/lib/postgres-retry.js';

describe('Postgres connection retry', () => {
  it('retries connection errors with the configured exponential backoff', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(
        Object.assign(new Error('the database system is starting up'), { code: '57P03' }),
      )
      .mockResolvedValue('ready');
    const sleep = vi.fn(async () => undefined);

    await expect(withPostgresConnectionRetry(operation, { sleep })).resolves.toBe('ready');
    expect(operation).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([100, 500, 2_000]);
  });

  it('recognizes nested connection failures from AggregateError', () => {
    const connectionFailure = Object.assign(new Error('connect refused'), {
      code: 'ECONNREFUSED',
    });

    expect(isRetryablePostgresError(new AggregateError([connectionFailure]))).toBe(true);
  });

  it.each([
    ['syntax error', '42601'],
    ['unique constraint', '23505'],
  ])('does not retry %s failures', async (_label, code) => {
    const failure = Object.assign(new Error(_label), { code });
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(failure);
    const sleep = vi.fn(async () => undefined);

    await expect(withPostgresConnectionRetry(operation, { sleep })).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
