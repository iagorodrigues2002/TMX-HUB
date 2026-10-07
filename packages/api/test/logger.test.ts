import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let loggerModule: typeof import('../src/lib/logger.js');

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
  loggerModule = await import('../src/lib/logger.js');
});

afterAll(() => vi.unstubAllEnvs());

describe('logger PII redaction', () => {
  it('redacts PII fields, auth headers, cookies and sensitive URL parameters', () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const log = loggerModule.createLogger({ destination, pretty: false });

    log.info({
      email: 'buyer@example.com',
      phone: '+5511999999999',
      cpf: '12345678901',
      cnpj: '12345678000199',
      document: 'passport-secret',
      ip: '203.0.113.5',
      user_agent: 'sensitive-browser',
      address: { street: 'Rua privada, 10' },
      authorization: 'Bearer top-secret',
      cookies: 'session=top-secret',
      buyer: { email: 'nested@example.com', phone: '11999999999' },
      req: {
        method: 'GET',
        url: '/checkout?email=url@example.com&cpf=98765432100&utm_source=test',
        headers: { authorization: 'Bearer request-secret', cookie: 'sid=request-secret' },
      },
    });

    const output = chunks.join('');
    for (const secret of [
      'buyer@example.com',
      '+5511999999999',
      '12345678901',
      '12345678000199',
      'passport-secret',
      '203.0.113.5',
      'sensitive-browser',
      'Rua privada, 10',
      'Bearer top-secret',
      'session=top-secret',
      'nested@example.com',
      'url@example.com',
      '98765432100',
      'request-secret',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('utm_source=test');
  });

  it('scrubs sensitive parameters from absolute and relative URLs', () => {
    expect(
      loggerModule.sanitizeLogUrl('https://example.com/pay?email=a%40b.com&utm_campaign=x&cpf=123'),
    ).toBe('https://example.com/pay?email=%5BREDACTED%5D&utm_campaign=x&cpf=%5BREDACTED%5D');
    expect(loggerModule.sanitizeLogUrl('/pay?phone=5511999&gclid=ok')).toBe(
      '/pay?phone=%5BREDACTED%5D&gclid=ok',
    );
  });
});
