import assert from 'node:assert/strict';
import test from 'node:test';
import type { LibraryAd } from '../src/lib/spy-library-reader';
import type { StructureRecord } from '../src/lib/spy-structure';
import {
  savedSpyStructure,
  savedSpyStructureSource,
  spyStructureAssetKey,
} from '../src/lib/spy-structure-cache';

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

test('new readings recover saved patterns from their original media, explicitly as history', () => {
  const old = {
    id: '1',
    creativeAssets: [
      { kind: 'video', url: 'https://video.fbcdn.net/old.mp4', sha256: 'a'.repeat(64) },
    ],
  } as LibraryAd;
  const record = { ads: ['1'], assetKey: spyStructureAssetKey(old) } as StructureRecord;
  const selected = { at: '2026-11-13T12:00:00Z', scope: 'offer' };
  const snapshot = { at: '2026-11-12T12:00:00Z', scope: 'offer', ads: [old] };
  const current = { id: '1' } as LibraryAd;
  const recovered = savedSpyStructureSource([record], current, [snapshot], selected);
  assert.equal(recovered?.saved, record);
  assert.equal(recovered?.source, old);
  assert.equal(recovered?.historicalAt, snapshot.at);
  assert.equal(
    savedSpyStructureSource([record], old, [snapshot], selected)?.historicalAt,
    undefined,
  );
  assert.equal(
    savedSpyStructureSource([record], { id: '2' } as LibraryAd, [snapshot], selected),
    undefined,
  );
  assert.equal(
    savedSpyStructureSource([record], current, [{ ...snapshot, scope: 'other' }], selected),
    undefined,
  );
  assert.equal(
    savedSpyStructureSource(
      [record],
      current,
      [{ ...snapshot, at: '2026-11-14T12:00:00Z' }],
      selected,
    ),
    undefined,
  );
});
