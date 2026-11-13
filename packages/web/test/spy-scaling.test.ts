import assert from 'node:assert/strict';
import test from 'node:test';
import { adCreative } from '../src/lib/spy-ad-preview';
import { spyDiscoveryNotice, spyDiscoverySeen } from '../src/lib/spy-discovery-notices';
import { spyAdDomains, spyDomain } from '../src/lib/spy-domains';
import {
  type LibrarySnapshot,
  enrollLibraryOffers,
  initialLibraryState,
} from '../src/lib/spy-library-store';
import { spyScaling } from '../src/lib/spy-scaling';
const ad = (id: string, hash = 'a') => ({
  id,
  pageId: 'p',
  pageName: 'Page',
  startedAt: null,
  url: 'https://facebook.com/ads/library/',
  creativeComplete: true,
  creativeAssets: [
    { kind: 'video' as const, url: 'https://scontent.xx.fbcdn.net/a.mp4', sha256: hash.repeat(64) },
  ],
});
const snapshot = (at: string, ads: ReturnType<typeof ad>[], scope = 's'): LibrarySnapshot => ({
  at,
  ads,
  scope,
  day: 0,
  countries: ['ALL'],
  added: [],
  missing: [],
  baseline: false,
});
test('scaling compares same scope, deduplicates IDs and distinguishes new media', () => {
  const old = snapshot('2026-11-12T12:00:00Z', [ad('1')]);
  const next = snapshot('2026-11-13T12:00:00Z', [ad('1'), ad('2'), ad('2'), ad('3', 'b')]);
  const result = spyScaling(
    [old, next, snapshot('2026-11-13T13:00:00Z', [], 'other')],
    's',
    Date.parse(next.at),
  )!;
  assert.equal(result.activeAds, 3);
  assert.equal(result.delta, 2);
  assert.equal(result.assets, 2);
  assert.equal(result.rows[0]?.activeAds, 2);
  assert.equal(result.rows[0]?.signal, 'growing');
  assert.equal(result.rows[1]?.signal, 'new');
  assert.equal(spyScaling([next], 's', Date.parse(next.at))?.rows[0]?.signal, 'insufficient');
  assert.equal(spyScaling([old, next], 's', Date.parse(next.at) + 40 * 3600000)?.growing, 0);
  assert.equal(spyScaling([old], 'other'), null);
});
test('domains are provider destinations, normalized and deduplicated; no media CDN', () => {
  const creative = adCreative({
    body: { text: 'hello' },
    link_url: 'https://www.Example.com/offer?utm=1',
    cards: [{ link_url: 'https://example.com/other' }],
  });
  assert.deepEqual(spyAdDomains(creative), ['example.com']);
  assert.equal(spyDomain('javascript:alert(1)'), undefined);
  assert.equal(spyDomain('https://scontent.xx.fbcdn.net/a'), undefined);
  assert.equal(
    spyDomain('https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.example.com%2Fa'),
    'example.com',
  );
});
test('new destination on existing ad notifies once, baseline and reappearance stay silent', () => {
  const state = enrollLibraryOffers(initialLibraryState('alice'), [
    {
      id: 'offer',
      name: 'Offer',
      sources: ['https://www.facebook.com/ads/library/?q=example.com'],
    },
  ]);
  const job = state.jobs.offer!;
  job.responsibleId = 'douglas';
  const first = snapshot('2026-11-12T12:00:00Z', [
    { ...ad('1'), ...adCreative({ body: 'hello', link_url: 'https://example.com' }) },
  ]);
  assert.equal(spyDiscoveryNotice('alice', job, first, []), null);
  job.snapshots = [first];
  job.discoverySeen = spyDiscoverySeen('alice', job, first);
  const next = snapshot('2026-11-13T12:00:00Z', [
    { ...ad('1'), ...adCreative({ body: 'hello', link_url: 'https://second.com' }) },
  ]);
  const notice = spyDiscoveryNotice('alice', job, next, [])!;
  assert.equal(notice.recipientId, 'douglas');
  assert.equal(notice.spy.newAds, 0);
  assert.equal(notice.spy.newPages, 0);
  assert.deepEqual(notice.spy.domains, ['second.com']);
  job.discoverySeen = spyDiscoverySeen('alice', job, next);
  assert.equal(spyDiscoveryNotice('alice', job, next, []), null);
  assert.equal(spyDiscoveryNotice('alice', job, { ...next, scope: 'new-source' }, []), null);
});
