import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storyFrameTimes } from '../src/lib/spy-visual-frames';
import { structureGroups, type StructureAd } from '../src/lib/spy-structure';
test('hook and ending samples stay within exact windows, including short videos', () => {
  assert.deepEqual(storyFrameTimes(35), [0, 2, 4.9, 30, 33, 34.85]);
  for (const duration of [0.1, 1, 3, 5, 600]) {
    const times = storyFrameTimes(duration);
    assert.equal(times.length, new Set(times).size);
    assert.ok(times.every((t) => t >= 0 && t < duration));
    assert.ok(times.at(-1)! >= duration - 0.2);
  }
  assert.throws(() => storyFrameTimes(Number.NaN));
});
test('counts unique analyzed IDs, excludes unknowns and separates style from identical audio', () => {
  const ad = (id: string, kind = 'music', fingerprint = 'audio-a') =>
    ({
      id,
      name: id,
      available: true,
      saved: {
        result: { trophy: 'gold_cup', hookType: 'presenter' },
        audio: { kind, fingerprint, musicStyle: 'pop' },
      },
    }) as StructureAd;
  const ads = [
    ad('1'),
    ad('1'),
    ad('2'),
    ad('3', 'speech_music'),
    { id: '4', name: 'pending', available: true },
  ];
  assert.deepEqual(structureGroups(ads, 'audio'), [{ key: 'audio-a', ids: ['1', '2'] }]);
  assert.equal(structureGroups(ads, 'musicStyle')[0]!.ids.length, 3);
  assert.equal(structureGroups(ads, 'trophy')[0]!.ids.length, 3);
});
