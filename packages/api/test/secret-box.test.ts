import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/lib/secret-box.js';

describe('secret-box', () => {
  it('criptografa e recupera um token sem armazená-lo em texto puro', () => {
    const secret = 'tracking-secret-with-at-least-32-characters';
    const token = 'EAAB-meta-access-token';
    const encrypted = encryptSecret(token, secret);
    expect(encrypted).not.toContain(token);
    expect(decryptSecret(encrypted, secret)).toBe(token);
  });

  it('rejeita chave de criptografia incorreta', () => {
    const encrypted = encryptSecret('token', 'first-secret-with-at-least-32-chars');
    expect(() => decryptSecret(encrypted, 'other-secret-with-at-least-32-chars')).toThrow();
  });
});
