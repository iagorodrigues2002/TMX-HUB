import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { LibraryAd } from '../src/lib/spy-library-reader';
import {
  enrollLibraryOffers,
  initialLibraryState,
  setSpyMonitoring,
} from '../src/lib/spy-library-store';
import {
  persistSpyMedia,
  readSpyImage,
  retainSpyMedia,
  spyImageType,
} from '../src/lib/spy-media-cache';
test('Spy persists raster images privately, reuses disk cache, and retains saved images when later metadata is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-media-'));
  const ad: LibraryAd = {
    id: '1',
    pageId: '10',
    pageName: 'Page',
    startedAt: null,
    url: 'https://www.facebook.com/ads/library/?id=1',
    thumbnailUrl: 'https://scontent.xx.fbcdn.net/ad.jpg',
    pagePictureUrl: 'https://scontent.xx.fbcdn.net/page.jpg',
  };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1kAAAAASUVORK5CYII=',
    'base64',
  );
  let calls = 0;
  try {
    await persistSpyMedia(root, 'alice', [ad], async () => {
      calls++;
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    assert.equal(calls, 2);
    assert.ok(ad.thumbnailKey);
    assert.ok(ad.pagePictureKey);
    assert.equal((await readSpyImage(root, 'alice', ad.pagePictureKey))?.type, 'image/png');
    assert.equal(await readSpyImage(root, 'bob', ad.pagePictureKey), null);
    assert.equal(await readSpyImage(root, 'alice', '../.key'), null);
    const again = { ...ad, thumbnailKey: undefined, pagePictureKey: undefined };
    await persistSpyMedia(root, 'alice', [again], async () => {
      throw Error('Expired upstream');
    });
    assert.equal(again.pagePictureKey, ad.pagePictureKey);
    assert.equal(calls, 2);
    const next: LibraryAd = {
      id: '1',
      pageId: '10',
      pageName: 'Page',
      startedAt: null,
      url: ad.url,
    };
    retainSpyMedia([next], [ad]);
    assert.equal(next.thumbnailKey, ad.thumbnailKey);
    assert.equal(next.pagePictureKey, ad.pagePictureKey);
    const rotated = {
      ...next,
      thumbnailKey: undefined,
      thumbnailUrl: 'https://scontent-else.fbcdn.net/ad.jpg?new-signature=1',
    };
    retainSpyMedia([rotated], [ad]);
    assert.equal(rotated.thumbnailKey, ad.thumbnailKey);
    const changed = {
      ...rotated,
      thumbnailKey: undefined,
      thumbnailUrl: 'https://scontent.xx.fbcdn.net/new-creative.jpg',
    };
    retainSpyMedia([changed], [ad]);
    assert.equal(changed.thumbnailKey, undefined);
    assert.equal(spyImageType(Buffer.from('<svg onload="alert(1)"/>')), undefined);
    let unsafeCalls = 0;
    await persistSpyMedia(
      root,
      'alice',
      [{ ...next, thumbnailKey: undefined, thumbnailUrl: 'https://127.0.0.1/internal' }],
      async () => {
        unsafeCalls++;
        throw Error('must not fetch');
      },
    );
    assert.equal(unsafeCalls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Parallel image batches share a global download pool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-pool-'));
  let active = 0;
  let maximum = 0;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz1kAAAAASUVORK5CYII=',
    'base64',
  );
  try {
    await Promise.all(
      Array.from({ length: 10 }, (_, batch) =>
        persistSpyMedia(
          root,
          'alice',
          Array.from({ length: 8 }, (_, i) => ({
            id: `${batch}-${i}`,
            pageId: '1',
            pageName: 'Page',
            startedAt: null,
            url: 'https://www.facebook.com/ads/library/',
            thumbnailUrl: `https://scontent.xx.fbcdn.net/${batch}-${i}.png`,
          })),
          async () => {
            active++;
            maximum = Math.max(maximum, active);
            await new Promise((r) => setTimeout(r, 25));
            active--;
            return new Response(png);
          },
        ),
      ),
    );
    assert.ok(maximum > 1);
    assert.ok(maximum <= 32);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Bulk monitoring is atomic and idempotent, preserves history, and never starts an API request', () => {
  const source = 'https://www.facebook.com/ads/library/?q=example.com';
  const initial = enrollLibraryOffers(initialLibraryState('alice'), [
    { id: 'a', name: 'A', sources: [source] },
    { id: 'b', name: 'B', sources: [source] },
  ]);
  const enabled = setSpyMonitoring(
    initial,
    ['a', 'b', 'a'],
    true,
    new Date('2026-11-09T12:00:00Z'),
  );
  assert.equal(initial.jobs.a.optedIn, false);
  assert.equal(enabled.jobs.a.optedIn, true);
  assert.equal(enabled.jobs.b.optedIn, true);
  const repeated = setSpyMonitoring(enabled, ['a', 'b'], true, new Date('2026-11-09T18:00:00Z'));
  assert.equal(repeated.jobs.a.nextAt, enabled.jobs.a.nextAt);
  const stopped = setSpyMonitoring(enabled, ['a', 'b'], false);
  assert.equal(stopped.jobs.a.status, 'paused');
  assert.equal(stopped.jobs.b.nextAt, null);
  assert.deepEqual(stopped.jobs.a.snapshots, enabled.jobs.a.snapshots);
  assert.throws(() => setSpyMonitoring(enabled, ['a', 'missing'], false));
  assert.equal(enabled.jobs.a.optedIn, true);
});
