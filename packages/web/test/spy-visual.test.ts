import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSpySaved,
  spyStageLabel,
  syncSpyMonitoringStages,
} from '../src/components/spy/spy-model';
import { adPreview, safeAdThumbnail } from '../src/lib/spy-ad-preview';
import { spyHistoryFixture } from '../src/lib/spy-history-fixture';
import { publicLibraryAds, publicLibraryPages } from '../src/lib/spy-library-store';
import seed from './fixtures/spy-catalog';

test('Preview fixture pins new pages to their real observation day and preserves reappearing IDs', () => {
  const initial = publicLibraryAds(spyHistoryFixture(0), 'sheet-34', 0)!;
  assert.ok(initial.ads.every((ad) => !ad.isNew && !ad.isReturning));
  const day1 = publicLibraryPages(spyHistoryFixture(1), 'sheet-34', 0)!;
  assert.equal(day1.pages.find((p) => p.id === '300')?.firstSeenDay, 1);
  assert.equal(day1.pages.find((p) => p.id === '300')?.change, 'new');
  assert.equal(day1.pages.find((p) => p.id === '100')?.change, 'existing');
  const day2 = publicLibraryPages(spyHistoryFixture(2), 'sheet-34', 0)!;
  assert.equal(day2.pages.find((p) => p.id === '400')?.firstSeenDay, 2);
  assert.equal(day2.pages.find((p) => p.id === '400')?.change, 'new');
  assert.equal(day2.pages.find((p) => p.id === '300')?.firstSeenDay, 1);
  const fresh = publicLibraryAds(spyHistoryFixture(2), 'sheet-34', 0)!.ads.filter((ad) => ad.isNew);
  assert.equal(publicLibraryAds(spyHistoryFixture(2), 'sheet-34', 0)!.ads[0].pageId, '400');
  assert.deepEqual(
    fresh.map((ad) => ad.pageId),
    ['400'],
  );
  const day3 = publicLibraryPages(spyHistoryFixture(3), 'sheet-34', 0)!;
  assert.equal(day3.pages.find((p) => p.id === '200')?.change, 'returned');
  assert.equal(day3.pages.find((p) => p.id === '200')?.firstSeenDay, 0);
  assert.equal(day3.pages.find((p) => p.id === '300')?.change, 'missing');
  const returned = publicLibraryAds(spyHistoryFixture(3), 'sheet-34', 0)!.ads.find(
    (ad) => ad.pageId === '200',
  )!;
  assert.equal(returned.isReturning, true);
  assert.equal(returned.isNew, false);
});
test('Preview thumbnails accept only Meta image hosts and never select video URLs', () => {
  const image = 'https://scontent.xx.fbcdn.net/creative.jpg?signature=synthetic';
  assert.deepEqual(
    adPreview({
      body: { text: '  Test copy  ' },
      title: ' Test title ',
      images: [{ resized_image_url: image }],
      videos: [{ video_hd_url: 'https://scontent.xx.fbcdn.net/movie.mp4' }],
    }),
    { thumbnailUrl: image, title: 'Test title', description: 'Test copy' },
  );
  assert.deepEqual(
    adPreview({
      videos: [
        { video_preview_image_url: image, video_sd_url: 'https://scontent.xx.fbcdn.net/movie.mp4' },
      ],
    }),
    { thumbnailUrl: image },
  );
  assert.deepEqual(adPreview({ cards: [{ original_image_url: image, title: 'Card title' }] }), {
    thumbnailUrl: image,
    title: 'Card title',
  });
  for (const url of [
    'http://scontent.xx.fbcdn.net/a.jpg',
    'https://fbcdn.net.evil.test/a.jpg',
    'https://u:p@scontent.xx.fbcdn.net/a.jpg',
    'https://scontent.xx.fbcdn.net/a.mp4',
    'javascript:alert(1)',
  ])
    assert.equal(safeAdThumbnail(url), undefined);
  assert.deepEqual(adPreview(undefined), {});
});
test('Monitoring stage follows opt-in without overwriting cloning workflow', () => {
  const offer = parseSpySaved(JSON.stringify(seed))[0]!;
  const base = { ...offer, stage: 'Em pesquisa' };
  const [tracked] = syncSpyMonitoringStages([base], { [base.id]: { optedIn: true } });
  assert.equal(spyStageLabel(tracked.stage), 'Em acompanhamento');
  const [paused] = syncSpyMonitoringStages([tracked], { [base.id]: { optedIn: false } });
  assert.equal(paused.stage, 'Em pesquisa');
  const cloning = { ...base, stage: 'Em clonagem' };
  assert.equal(syncSpyMonitoringStages([cloning], { [base.id]: { optedIn: true } })[0], cloning);
});
