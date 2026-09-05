import { describe, expect, it } from 'vitest';
import { findVturbConversionKey } from '../src/services/vturb.js';

describe('VTurb conversion attribution', () => {
  it('prioritizes the parameter selected for the offer', () => {
    expect(findVturbConversionKey({ src: 'campaign', sub19: 'v3_session_player_770' }, 'sub19'))
      .toBe('v3_session_player_770');
  });

  it('finds a valid VTurb key without confusing the TMX src', () => {
    expect(findVturbConversionKey({ src: 'tmx-visitor', vtid: 'v3_session_player_720' }, 'src'))
      .toBe('v3_session_player_720');
  });

  it('does not deliver an ordinary attribution parameter', () => {
    expect(findVturbConversionKey({ src: 'facebook', ad_id: '123' }, 'src')).toBeNull();
  });
});
