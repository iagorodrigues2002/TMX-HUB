import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertSafeOutboundUrl } from '../src/lib/url-safety.js';

vi.mock('node:dns', () => ({
  promises: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

import { promises as dns } from 'node:dns';

const mockDns = dns as {
  resolve4: ReturnType<typeof vi.fn>;
  resolve6: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  // Default: public DNS resolves to a safe address
  mockDns.resolve4.mockResolvedValue(['93.184.216.34']); // example.com
  mockDns.resolve6.mockRejectedValue(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('assertSafeOutboundUrl', () => {
  it('allows a public HTTPS URL', async () => {
    await expect(assertSafeOutboundUrl('https://example.com/path')).resolves.toBeUndefined();
  });

  it('allows a public HTTP URL', async () => {
    await expect(assertSafeOutboundUrl('http://example.com/')).resolves.toBeUndefined();
  });

  it('blocks localhost by hostname', async () => {
    await expect(assertSafeOutboundUrl('http://localhost/admin')).rejects.toThrow(/not allowed/i);
  });

  it('blocks 127.0.0.1 directly', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1/')).rejects.toThrow(/private/i);
  });

  it('blocks AWS metadata IP 169.254.169.254', async () => {
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private/i,
    );
  });

  it('blocks 10.x.x.x private range', async () => {
    await expect(assertSafeOutboundUrl('http://10.0.0.1/')).rejects.toThrow(/private/i);
  });

  it('blocks 192.168.x.x private range', async () => {
    await expect(assertSafeOutboundUrl('http://192.168.1.1/')).rejects.toThrow(/private/i);
  });

  it('blocks 172.16.x.x private range', async () => {
    await expect(assertSafeOutboundUrl('http://172.16.0.1/')).rejects.toThrow(/private/i);
  });

  it('blocks file:// scheme', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow(/scheme/i);
  });

  it('blocks javascript: scheme', async () => {
    await expect(assertSafeOutboundUrl('javascript:alert(1)')).rejects.toThrow(/scheme/i);
  });

  it('blocks DNS rebinding — public hostname resolving to private IP', async () => {
    mockDns.resolve4.mockResolvedValue(['127.0.0.1']);
    mockDns.resolve6.mockRejectedValue(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));

    await expect(assertSafeOutboundUrl('https://evil.example.com/')).rejects.toThrow(/private/i);
  });

  it('blocks unresolvable hostname', async () => {
    mockDns.resolve4.mockRejectedValue(
      Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }),
    );
    mockDns.resolve6.mockRejectedValue(
      Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }),
    );

    await expect(assertSafeOutboundUrl('https://this-host-does-not.exist/')).rejects.toThrow(
      /could not be resolved/i,
    );
  });
});
