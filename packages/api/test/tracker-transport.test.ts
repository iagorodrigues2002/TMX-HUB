import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildTrackerScript } from '../src/services/tracker-script.js';

function browser(origin: string, query = '', cookies = '') {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ active: false }) });
  const sendBeacon = vi.fn().mockReturnValue(true);
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    };
  };
  const window = {} as { tmx: { track(event: string): void } };
  const cookieJar = new Map(
    cookies
      .split('; ')
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
  const document = {
    currentScript: { src: 'https://theminex.com/v1/track/t.js?key=test' },
    get cookie() {
      return [...cookieJar].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      const first = value.split(';')[0]!;
      const index = first.indexOf('=');
      cookieJar.set(first.slice(0, index), first.slice(index + 1));
    },
    title: 'Transport test',
    referrer: '',
    documentElement: {},
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  runInNewContext(buildTrackerScript('test'), {
    window,
    document,
    fetch,
    navigator: { sendBeacon },
    URL,
    Blob,
    location: new URL(`${origin}/landing${query}`),
    localStorage: storage(),
    sessionStorage: storage(),
    crypto: { randomUUID: () => 'test-id' },
    history: { pushState() {}, replaceState() {} },
    MutationObserver: class {
      observe() {}
    },
    addEventListener() {},
    queueMicrotask,
  });
  window.tmx.track('PageView');
  return { fetch, sendBeacon };
}

describe('public tracker transport', () => {
  it('captures explicit composite ad IDs in the actual generated script', () => {
    const b = browser(
      'https://landing.example',
      '?utm_source=fb&utm_content=AD06%7C123456789012345',
    );
    const call = b.fetch.mock.calls.find(([url]) => url.endsWith('/track/events'));
    expect(JSON.parse(call![1].body).source.ad_id).toBe('123456789012345');
  });
  it('uses the current fbclid rather than an older click cookie', () => {
    const b = browser('https://landing.example', '?fbclid=new-click', '_fbc=fb.1.123.old-click');
    const call = b.fetch.mock.calls.find(([url]) => url.endsWith('/track/events'));
    expect(JSON.parse(call![1].body).source._fbc).toMatch(/^fb\.1\.\d+\.new-click$/);
  });
  it('uses credential-free keepalive fetch on an external landing page', () => {
    const b = browser('https://clearmeadowx.online');
    expect(b.sendBeacon).not.toHaveBeenCalled();
    expect(b.fetch).toHaveBeenCalledWith(
      'https://theminex.com/v1/track/events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        credentials: 'omit',
      }),
    );
  });
  it('retains beacon transport on the TMX origin', () => {
    const b = browser('https://theminex.com');
    expect(b.sendBeacon).toHaveBeenCalledWith(
      'https://theminex.com/v1/track/events',
      expect.any(Blob),
    );
  });
});
