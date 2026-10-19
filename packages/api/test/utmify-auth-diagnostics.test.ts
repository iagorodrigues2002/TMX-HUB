import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: {} }));
import { safeAdsImportError } from '../src/services/ads-intelligence.js';
import { UtmifyAuthenticationError, authenticate } from '../src/services/utmify-sync.js';
afterEach(() => vi.unstubAllGlobals());
describe('safe UTMify authentication diagnostics without retry', () => {
  it.each([400, 401, 403, 429, 500])(
    'records HTTP %s without retaining credentials or upstream body',
    async (status) => {
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ reason: 'private-login\nprivate-password', token: 'private-token' }),
            { status },
          ),
      );
      vi.stubGlobal('fetch', fetch);
      let failure: unknown;
      try {
        await authenticate('private-login', 'private-password');
      } catch (e) {
        failure = e;
      }
      expect(failure).toBeInstanceOf(UtmifyAuthenticationError);
      expect(failure).toMatchObject({ authCode: 'AUTH_HTTP_REJECTED', httpStatus: status });
      const stored = safeAdsImportError(failure, 'authentication');
      expect(stored).toContain(`AUTH_HTTP_REJECTED HTTP ${status}`);
      expect(JSON.stringify(failure) + stored).not.toMatch(/private|\n/);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('identifies missing token in a successful response', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ message: 'private-body' })));
    await expect(authenticate('l', 'p')).rejects.toMatchObject({
      authCode: 'AUTH_TOKEN_MISSING',
      httpStatus: 200,
    });
  });
  it.each([
    ['TimeoutError', 'AUTH_TIMEOUT'],
    ['AbortError', 'AUTH_ABORTED'],
    ['TypeError', 'AUTH_NETWORK'],
    ['OtherError', 'AUTH_UNEXPECTED'],
  ])('classifies %s without retaining arbitrary exception text', async (name, code) => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new Error('private-password\nprivate-url'), { name });
    });
    vi.stubGlobal('fetch', fetch);
    let failure: unknown;
    try {
      await authenticate('l', 'p');
    } catch (e) {
      failure = e;
    }
    expect(failure).toMatchObject({ authCode: code });
    expect(safeAdsImportError(failure, 'authentication')).toContain(code);
    expect(JSON.stringify(failure)).not.toContain('private');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains a whitelisted network code, but not arbitrary cause properties', async () => {
    vi.stubGlobal('fetch', async () => {
      throw Object.assign(new TypeError('private'), {
        cause: { code: 'ENOTFOUND', hostname: 'private-host', message: 'private' },
      });
    });
    await expect(authenticate('l', 'p')).rejects.toMatchObject({
      authCode: 'AUTH_NETWORK',
      networkCode: 'ENOTFOUND',
    });
  });
});
