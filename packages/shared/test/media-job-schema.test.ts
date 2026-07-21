import { describe, expect, it } from 'vitest';
import { CreateMediaJobBodySchema } from '../src/schemas.js';

describe('CreateMediaJobBodySchema', () => {
  it('accepts the standard Creative Studio pipeline without Phase Cancel', () => {
    const result = CreateMediaJobBodySchema.safeParse({
      compression: 'balanced',
      aspect_ratio: '9:16',
      normalize_audio: true,
      phase_cancel: false,
    });
    expect(result.success).toBe(true);
  });

  it('requires a niche when Phase Cancel is enabled', () => {
    const result = CreateMediaJobBodySchema.safeParse({ phase_cancel: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'niche_id')).toBe(true);
    }
  });

  it('accepts the complete unified Phase Cancel pipeline', () => {
    const result = CreateMediaJobBodySchema.safeParse({
      compression: 'small',
      aspect_ratio: '1:1',
      strip_metadata: true,
      normalize_audio: true,
      extension_mode: 'freeze',
      target_seconds: 10,
      phase_cancel: true,
      niche_id: 'health',
      white_volume_db: -22,
      verify_transcript: true,
    });
    expect(result.success).toBe(true);
  });
});
