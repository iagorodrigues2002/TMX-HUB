import { describe, expect, it, vi } from 'vitest';
import { AuthUserCache } from '../src/lib/auth-user-cache.js';

describe('AuthUserCache', () => {
  it('serves cached permissions until the TTL expires', () => {
    vi.useFakeTimers();
    try {
      const cache = new AuthUserCache(20_000, 1_000);
      cache.set('user-1', { role: 'user', allowedTools: ['cloner'] });

      expect(cache.get('user-1')).toEqual({ role: 'user', allowedTools: ['cloner'] });
      vi.advanceTimersByTime(20_001);
      expect(cache.get('user-1')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the least recently used entry when it reaches max size', () => {
    const cache = new AuthUserCache(20_000, 2);
    cache.set('user-1', { role: 'user' });
    cache.set('user-2', { role: 'admin' });
    expect(cache.get('user-1')).toEqual({ role: 'user' });

    cache.set('user-3', { role: 'user', allowedTools: ['vsl'] });

    expect(cache.get('user-2')).toBeUndefined();
    expect(cache.get('user-1')).toEqual({ role: 'user' });
    expect(cache.get('user-3')).toEqual({ role: 'user', allowedTools: ['vsl'] });
  });

  it('invalidates a cached user explicitly', () => {
    const cache = new AuthUserCache(20_000, 1_000);
    cache.set('user-1', { role: 'admin' });

    cache.invalidate('user-1');

    expect(cache.get('user-1')).toBeUndefined();
  });
});
