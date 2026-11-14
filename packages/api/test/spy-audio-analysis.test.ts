import { describe, it, expect } from 'vitest';
import {
  audioAnalysisSchema,
  audioAnalysisCost,
  audioAnalysisRequest,
} from '../src/services/spy-audio-analysis.js';
import { structureInput, structureResult } from '../src/services/spy-visual-preview.js';
describe('Spy audio and creative patterns', () => {
  it('does not allow lyrics for music-only; keeps voice over music', () => {
    const base = {
      kind: 'music',
      description: 'Música instrumental',
      musicStyle: 'electronic',
      hook: 'Batida',
      ending: 'Fade',
      text: '',
    };
    expect(audioAnalysisSchema.safeParse(base).success).toBe(true);
    expect(audioAnalysisSchema.safeParse({ ...base, text: 'Invented lyrics' }).success).toBe(false);
    expect(
      audioAnalysisSchema.safeParse({ ...base, kind: 'speech_music', text: 'Fala real' }).success,
    ).toBe(true);
    expect(audioAnalysisRequest('QQ==').store).toBe(false);
    expect(audioAnalysisSchema.parse({...base,musicStyle:'hiphop'}).musicStyle).toBe('other');
    expect(audioAnalysisSchema.safeParse({...base,musicStyle:123}).success).toBe(false);
  });
  it('uses observed token usage and rejects unknown pricing', () => {
    const result = {
      model: 'gpt-audio-1.5',
      usage: {
        prompt_tokens: 120,
        completion_tokens: 20,
        prompt_tokens_details: { audio_tokens: 100 },
      },
    };
    expect(audioAnalysisCost(result)).toBe(3450);
    expect(audioAnalysisCost({ ...result, model: 'other' })).toBeNull();
    expect(audioAnalysisCost({})).toBeNull();
  });
  it('accepts only a single creative and bounded structure schema', () => {
    expect(
      structureInput.safeParse({
        companyId: '11111111-1111-4111-8111-111111111111',
        offerId: 'test',
        kind: 'structure',
        assetKey: 'a'.repeat(64),
        ads: [{ id: '1', text: '', frames: [{ second: 0, image: 'data:image/jpeg;base64,QQ==' }] }],
        audio: null,
      }).success,
    ).toBe(true);
    expect(
      structureResult.safeParse({
        hookType: 'other',
        hook: 'Intro',
        endingType: 'trophy',
        ending: 'Gold cup',
        trophy: 'gold_cup',
        trophyDescription: 'Duas alças',
        limitations: ['Amostras'],
      }).success,
    ).toBe(true);
  });
});
