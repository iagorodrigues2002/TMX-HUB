import { describe, expect, it } from 'vitest';
import {
  isValidPrefixedUlid,
  isValidUlid,
  newBuildId,
  newFormId,
  newLinkId,
} from '../src/lib/ids.js';

describe('id helpers', () => {
  it('generates valid raw ULIDs', () => {
    for (let i = 0; i < 10; i += 1) {
      const id = newFormId();
      expect(id.startsWith('frm_')).toBe(true);
      expect(isValidPrefixedUlid(id, 'frm')).toBe(true);
    }
  });

  it('generates valid prefixed ULIDs', () => {
    expect(isValidPrefixedUlid(newFormId(), 'frm')).toBe(true);
    expect(isValidPrefixedUlid(newLinkId(), 'lnk')).toBe(true);
    expect(isValidPrefixedUlid(newBuildId(), 'bld')).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isValidUlid('not-a-ulid')).toBe(false);
    expect(isValidPrefixedUlid('frm_garbage', 'frm')).toBe(false);
    expect(isValidPrefixedUlid('lnk_01HW3K9P2N7XQK4D6V5RYMC1ZB', 'frm')).toBe(false);
  });
});
