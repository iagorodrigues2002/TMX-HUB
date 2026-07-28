import { describe, expect, it } from 'vitest';
import {
  isDefinitelyInvalidMetaToken,
  metaCredentialDetail,
  readMetaGraphError,
} from '../src/services/meta-credentials.js';

describe('Meta credential validation', () => {
  it('rejects an explicitly invalid OAuth token', () => {
    const error = readMetaGraphError({
      error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 },
    });
    expect(isDefinitelyInvalidMetaToken(error)).toBe(true);
    expect(metaCredentialDetail(400, error)).toContain('Token inválido ou expirado');
  });

  it('does not reject a CAPI token merely because pixel GET is unsupported', () => {
    const error = readMetaGraphError({
      error: {
        message: 'Unsupported get request.',
        type: 'GraphMethodException',
        code: 100,
        error_subcode: 33,
      },
    });
    expect(isDefinitelyInvalidMetaToken(error)).toBe(false);
    expect(metaCredentialDetail(400, error)).toContain('Unsupported get request');
  });
});
