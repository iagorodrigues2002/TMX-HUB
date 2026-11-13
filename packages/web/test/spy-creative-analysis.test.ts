import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { adCreative, safeAdMedia } from '../src/lib/spy-ad-preview';
import { analyzeSpyCreatives } from '../src/lib/spy-creative-analysis';
import { fingerprintSpyCreatives, hydrateSpyThumbnails } from '../src/lib/spy-creative-media';
import { hydrateSpyRecovery } from '../src/lib/spy-creative-recovery';
import { spyHistoryFixture } from '../src/lib/spy-history-fixture';
import type { LibraryAd } from '../src/lib/spy-library-reader';
import { publicLibraryAds, publicLibraryNewLinks, publicLibraryState } from '../src/lib/spy-library-store';
import { persistSpyMedia } from '../src/lib/spy-media-cache';

const ad = (id: string, extra: Partial<LibraryAd> = {}): LibraryAd => ({
  id,
  pageId: '10',
  pageName: 'Page',
  startedAt: null,
  url: `https://www.facebook.com/ads/library/?id=${id}`,
  ...extra,
});
const full = {
  creativeComplete: true,
  creativeText: 'Copy',
  creativeAssets: [
    { kind: 'video' as const, url: 'https://x.fbcdn.net/a.mp4', sha256: 'a'.repeat(64) },
  ],
};
const reading = (at: string, ads: LibraryAd[], baseline = false) => ({
  at,
  scope: 'offer-a',
  ads,
  baseline,
  added: ads.map((a) => a.id),
});

test('Creative comparison uses full media and copy, never thumbnails alone', () => {
  const old = reading('2026-11-10', [ad('1', { ...full, thumbnailDigest: 'b'.repeat(64) })], true);
  const next = reading('2026-11-11', [
    ad('2', full),
    ad('3', { ...full, creativeText: 'Changed copy' }),
    ad('4', { thumbnailDigest: 'b'.repeat(64) }),
    ad('5'),
  ]);
  const { results, summary } = analyzeSpyCreatives([old, next], next);
  assert.equal(results.get('2')?.status, 'duplicate');
  assert.equal(results.get('3')?.status, 'variation');
  assert.equal(results.get('4')?.status, 'unverified');
  assert.equal(results.get('4')?.previous?.id, '1');
  assert.equal(results.get('5')?.reason, 'missing_media');
  assert.deepEqual(summary, {
    total: 4,
    new: 0,
    duplicate: 1,
    variation: 1,
    unverified: 2,
    candidates: 1,
  });
});
test('Incomplete history, future and other scopes cannot establish novelty or prior reuse', () => {
  const old = reading('2026-11-10', [ad('1')], true);
  const next = reading('2026-11-11', [ad('2', full)]);
  const future = reading('2026-11-12', [ad('3', full)]);
  assert.equal(
    analyzeSpyCreatives(
      [old, future, { ...old, scope: 'other', ads: [ad('4', full)] }],
      next,
    ).results.get('2')?.reason,
    'incomplete_history',
  );
  assert.equal(analyzeSpyCreatives([old, future], next).results.get('2')?.previous, undefined);
  const complete = reading(
    '2026-11-10',
    [
      ad('1', {
        ...full,
        creativeAssets: [{ ...full.creativeAssets[0]!, sha256: 'c'.repeat(64) }],
      }),
    ],
    true,
  );
  assert.equal(analyzeSpyCreatives([complete], next).results.get('2')?.status, 'new');
  assert.equal(analyzeSpyCreatives([old], old).summary.total, 0);
  assert.equal(analyzeSpyCreatives([old], reading('2026-11-11', [ad('1', full)])).summary.total, 0);
});
test('Monitoring totals and grouped cards preserve IDs without grouping missing media', () => {
  const state = spyHistoryFixture(1);
  const snapshots = state.jobs['sheet-34']!.snapshots;
  snapshots[0]!.ads = [ad('1', full)];
  snapshots[1]!.ads = [ad('2', full), ad('3', { ...full, creativeText: 'Different' }), ad('4'), ad('5')];
  snapshots[1]!.added = ['2', '3', '4', '5'];
  const page = publicLibraryAds(state, 'sheet-34', 0, false, undefined, true)!;
  assert.equal(page.total, 3);
  assert.equal(page.ads.flatMap((a) => a.relatedAds ?? []).length, 4);
  assert.equal(page.nextOffset, null);
  assert.equal(publicLibraryState(state).jobs['sheet-34']!.creativeSummary!.total, 4);
  const variations = publicLibraryAds(state, 'sheet-34', 0, false, 'variation', true)!;
  assert.equal(variations.total, 1);
  assert.equal(variations.ads[0]!.id, '3');
});
test('Same-reading matches are explicit and deterministic', () => {
  const next = reading('2026-11-11', [ad('3', full), ad('2', full)]);
  const result = analyzeSpyCreatives([], next).results.get('3');
  assert.equal(result?.status, 'duplicate');
  assert.equal(result?.previous?.id, '2');
  assert.equal(result?.previous?.sameReading, true);
});
test('Creative filters paginate only matching IDs and retain the full new-ID summary', () => {
  const state = spyHistoryFixture(1);
  const snapshots = state.jobs['sheet-34']!.snapshots;
  snapshots[0]!.ads = [ad('1', full)];
  snapshots[1]!.ads = Array.from({ length: 120 }, (_, i) => ad(String(i + 2), i < 60 ? full : {}));
  snapshots[1]!.added = snapshots[1]!.ads.map((a) => a.id);
  const first = publicLibraryAds(state, 'sheet-34', 0, false, 'duplicate')!;
  const last = publicLibraryAds(state, 'sheet-34', first.nextOffset!, false, 'duplicate')!;
  assert.equal(first.total, 60);
  assert.equal(first.ads.length, 50);
  assert.equal(last.ads.length, 10);
  assert.equal(last.nextOffset, null);
  assert.equal(new Set([...first.ads, ...last.ads].map((a) => a.id)).size, 60);
  assert.equal(first.creativeSummary.total, 120);
  const links = publicLibraryNewLinks(state, 'sheet-34')!;
  assert.equal(links.links.length, 120);
  assert.equal(new Set(links.links.map((l) => l.url)).size, 120);
  assert(
    links.links.every((l) => /^https:\/\/www\.facebook\.com\/ads\/library\/\?id=\d+$/.test(l.url)),
  );
  assert.equal(publicLibraryAds(state, 'sheet-34', 0, false, 'new')!.total, 0);
});
test('Creative extraction preserves full video reference and missing assets remain incomplete', () => {
  assert.equal(typeof adCreative({ body: null }).creativeText, 'string');
  assert.equal(adCreative({}).creativeText, undefined);
  const result = adCreative({
    body: { text: 'Hello' },
    videos: [{ video_hd_url: 'https://x.fbcdn.net/a.mp4' }],
  });
  assert.equal(result.creativeComplete, true);
  assert.equal(result.creativeAssets?.[0]?.kind, 'video');
  assert.equal(
    adCreative({ videos: [{ video_preview_image_url: 'https://x.fbcdn.net/a.jpg' }] })
      .creativeComplete,
    false,
  );
  for (const url of [
    'https://localhost/a',
    'http://x.fbcdn.net/a',
    'https://x.fbcdn.net.evil.test/a',
    'https://x.fbcdn.net:8000/a',
  ])
    assert.equal(safeAdMedia(url), undefined);
});
test('Recovered history produces matching radar totals, filtered ads and new links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-recovered-radar-'));
  try {
    const state = spyHistoryFixture(1);
    const job = state.jobs['sheet-34']!;
    job.snapshots[0]!.ads = [ad('1')];
    job.snapshots[1]!.ads = [ad('2'), ad('3')];
    job.snapshots[1]!.added = ['2', '3'];
    const dir = join(root, 'creative-recovery', createHash('sha256').update(state.owner).digest('hex'), job.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'enriched.json'), JSON.stringify(Object.fromEntries(['1', '2', '3'].map(id => [id, { ...full, creativeRecoveredAt: '2026-11-13T06:00:00.000Z' }]))));
    assert.equal(publicLibraryState(state).jobs[job.id]!.creativeSummary!.unverified, 2);
    await hydrateSpyRecovery(root, state.owner, job);
    const radar = publicLibraryState(state).jobs[job.id]!.creativeSummary!;
    const filtered = publicLibraryAds(state, job.id, 0, false, 'duplicate')!;
    assert.equal(radar.duplicate, 2);
    assert.deepEqual(filtered.creativeSummary, radar);
    assert.equal(filtered.total, 2);
    assert.deepEqual(job.snapshots[1]!.added, ['2', '3']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Recovered evidence is scoped to owner and offer and records when it was retrieved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-recovery-'));
  try {
    const owner = 'alice';
    const dir = join(
      root,
      'creative-recovery',
      createHash('sha256').update(owner).digest('hex'),
      'offer',
    );
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'enriched.json'),
      JSON.stringify({
        '1': {
          ...full,
          thumbnailUrl: 'https://x.fbcdn.net/a.jpg',
          creativeRecoveredAt: '2026-11-11T21:00:00.000Z',
        },
      }),
    );
    const make = () => ({ id: 'offer', snapshots: [{ ads: [ad('1')] }] });
    const wrong = make();
    await hydrateSpyRecovery(root, 'bob', wrong);
    assert.equal(wrong.snapshots[0]!.ads[0]!.creativeComplete, undefined);
    const job = make();
    await hydrateSpyRecovery(root, owner, job);
    assert.equal(job.snapshots[0]!.ads[0]!.creativeComplete, true);
    assert.equal(job.snapshots[0]!.ads[0]!.thumbnailUrl, 'https://x.fbcdn.net/a.jpg');
    assert.equal(job.snapshots[0]!.ads[0]!.creativeRecoveredAt, '2026-11-11T21:00:00.000Z');
    const wrongOffer = { ...make(), id: 'other' };
    await hydrateSpyRecovery(root, owner, wrongOffer);
    assert.equal(wrongOffer.snapshots[0]!.ads[0]!.creativeComplete, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Media hashes are cached per owner; failed responses never confirm a creative', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spy-creative-'));
  let calls = 0;
  const make = () =>
    ad('1', { creativeAssets: [{ kind: 'video', url: 'https://x.fbcdn.net/a.mp4' }] });
  const fetcher: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.redirect, 'error');
    return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]), {
      headers: { 'content-type': 'video/mp4' },
    });
  };
  try {
    const a = make();
    await fingerprintSpyCreatives(root, 'alice', [a], fetcher);
    assert.match(a.creativeAssets![0]!.sha256!, /^[a-f0-9]{64}$/);
    await fingerprintSpyCreatives(root, 'alice', [make()], fetcher);
    assert.equal(calls, 1);
    await fingerprintSpyCreatives(root, 'bob', [make()], fetcher);
    assert.equal(calls, 2);
    const failed = make();
    await fingerprintSpyCreatives(
      root,
      'charlie',
      [failed],
      async () => new Response('error', { status: 502 }),
    );
    assert.equal(failed.creativeAssets![0]!.sha256, undefined);
    const oversized = make();
    await fingerprintSpyCreatives(
      root,
      'dave',
      [oversized],
      async () =>
        new Response('x', {
          headers: { 'content-type': 'video/mp4', 'content-length': String(40 * 1024 * 1024) },
        }),
    );
    assert.equal(oversized.creativeAssets![0]!.sha256, undefined);
    const image = ad('9', { thumbnailUrl: 'https://x.fbcdn.net/a.jpg' });
    await persistSpyMedia(
      root,
      'alice',
      [image],
      async () =>
        new Response(new Uint8Array([255, 216, 255, 0]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
    );
    await hydrateSpyThumbnails(root, 'alice', [image]);
    assert.match(image.thumbnailDigest!, /^[a-f0-9]{64}$/);
    const other = { ...image, thumbnailDigest: undefined };
    await hydrateSpyThumbnails(root, 'bob', [other]);
    assert.equal(other.thumbnailDigest, undefined);
    const batch = Array.from({ length: 19 }, (_, i) =>
      ad(`batch-${i}`, { thumbnailUrl: `https://x.fbcdn.net/batch-${i}.jpg` }),
    );
    await persistSpyMedia(root, 'alice', batch, async () =>
      new Response(new Uint8Array([255, 216, 255, 0]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    );
    await hydrateSpyThumbnails(root, 'alice', batch);
    assert.ok(batch.every((item) => item.thumbnailDigest === image.thumbnailDigest));
    const isolated = batch.map((item) => ({ ...item, thumbnailDigest: undefined }));
    await hydrateSpyThumbnails(root, 'bob', isolated);
    assert.ok(isolated.every((item) => item.thumbnailDigest === undefined));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
