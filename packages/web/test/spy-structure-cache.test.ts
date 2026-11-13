import assert from 'node:assert/strict';
import test from 'node:test';
import type { LibraryAd } from '../src/lib/spy-library-reader';
import type { StructureRecord } from '../src/lib/spy-structure';
import { savedSpyStructure, spyStructureAssetKey } from '../src/lib/spy-structure-cache';

test('saved patterns reuse exact media and copy across IDs, never unverified or changed content', () => {
  const old = {
    id: '1',
    creativeText: 'Copy',
    creativeAssets: [
      { kind: 'video', url: 'https://video.fbcdn.net/a.mp4', sha256: 'a'.repeat(64) },
    ],
  } as LibraryAd;
  const record = { ads: ['1'], assetKey: spyStructureAssetKey(old) } as StructureRecord;
  const current = { ...old, id: '2' };
  assert.equal(savedSpyStructure([record], current, [old]), record);
  assert.equal(
    savedSpyStructure([record], { ...current, creativeText: 'Different' }, [old]),
    undefined,
  );
  assert.equal(
    savedSpyStructure(
      [record],
      { ...current, creativeAssets: [{ ...old.creativeAssets![0]!, sha256: 'b'.repeat(64) }] },
      [old],
    ),
    undefined,
  );
  assert.equal(savedSpyStructure([record], current, []), undefined);
  const unverified = {
    ...old,
    creativeAssets: [{ kind: 'video', url: 'https://video.fbcdn.net/a.mp4' }],
  } as LibraryAd;
  const unverifiedRecord = {
    ads: ['1'],
    assetKey: spyStructureAssetKey(unverified),
  } as StructureRecord;
  assert.equal(
    savedSpyStructure([unverifiedRecord], { ...unverified, id: '2' }, [unverified]),
    undefined,
  );
  assert.equal(savedSpyStructure([record], old, [old]), record);
});
