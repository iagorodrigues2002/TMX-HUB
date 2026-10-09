import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildTrackerScript } from '../src/services/tracker-script.js';

function browser(origin: string) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ active: false }) });
  const sendBeacon = vi.fn().mockReturnValue(true);
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) };
  };
  const window: any = {};
  const document = {
    currentScript: { src: 'https://theminex.com/v1/track/t.js?key=test' },
    cookie: '', title: 'Transport test', referrer: '', documentElement: {},
    querySelectorAll: () => [], addEventListener: () => {},
  };
  runInNewContext(buildTrackerScript('test'), {
    window, document, fetch, navigator: { sendBeacon }, URL, Blob,
    location: new URL(origin + '/landing'), localStorage: storage(), sessionStorage: storage(),
    crypto: { randomUUID: () => 'test-id' }, history: { pushState() {}, replaceState() {} },
    MutationObserver: class { observe() {} }, addEventListener() {}, queueMicrotask,
  });
  window.tmx.track('PageView');
  return { fetch, sendBeacon };
}

describe('public tracker transport', () => {
  it('uses credential-free keepalive fetch on an external landing page', () => {
    const b = browser('https://clearmeadowx.online');
    expect(b.sendBeacon).not.toHaveBeenCalled();
    expect(b.fetch).toHaveBeenCalledWith('https://theminex.com/v1/track/events', expect.objectContaining({
      method: 'POST', keepalive: true, credentials: 'omit',
    }));
  });
  it('retains beacon transport on the TMX origin', () => {
    const b = browser('https://theminex.com');
    expect(b.sendBeacon).toHaveBeenCalledWith('https://theminex.com/v1/track/events', expect.any(Blob));
  });
});
