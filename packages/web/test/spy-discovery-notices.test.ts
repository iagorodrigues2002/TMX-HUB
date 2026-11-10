import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  spyDiscoveryNotice,
  spyDiscoverySeen,
  visibleSpyNotices,
} from '../src/lib/spy-discovery-notices';
import {
  type LibrarySnapshot,
  changeLibraryState,
  encryptLibraryToken,
  enrollLibraryOffers,
  initialLibraryState,
  readLibraryState,
  tickLibraryOwner,
  tickLibraryUsers,
} from '../src/lib/spy-library-store';
import { spyNoticeFeed } from '../src/lib/spy-notification-access';
const source = 'https://www.facebook.com/ads/library/?q=example.com';
const ad = (id: string, pageId = '100') => ({
  id,
  pageId,
  pageName: `Page ${pageId}`,
  startedAt: null,
  url: `https://www.facebook.com/ads/library/?id=${id}`,
});
const snap = (ads: ReturnType<typeof ad>[], scope = 'scope'): LibrarySnapshot => ({
  day: 0,
  at: '2026-11-09T12:00:00Z',
  scope,
  countries: ['ALL'],
  ads,
  added: [],
  missing: [],
  baseline: true,
});
test('Image downloads do not block subsequent API pages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-image-overlap-'));
  const original = globalThis.fetch;
  let release!: () => void;
  const mediaGate = new Promise<void>((r) => {
    release = r;
  });
  let pagesReady!: () => void;
  const pages = new Promise<void>((r) => {
    pagesReady = r;
  });
  let releasedByTimeout = false;
  let work: Promise<void> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = enrollLibraryOffers(initialLibraryState('alice'), [
      { id: 'offer', name: 'Offer', sources: [source] },
    ]);
    state.provider = 'scrapecreators';
    state.encrypted = await encryptLibraryToken('test', dir);
    state.paidRequestsEnabled = true;
    state.unlimitedRequests = true;
    Object.assign(state.jobs.offer, {
      enabled: true,
      optedIn: true,
      status: 'waiting',
      nextAt: new Date().toISOString(),
    });
    await changeLibraryState('alice', () => state, dir);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 3) pagesReady();
      return Response.json({
        success: true,
        credits_remaining: 100 - calls,
        searchResults: [
          {
            ad_archive_id: String(calls),
            page_id: '100',
            page_name: 'Page',
            is_active: true,
            snapshot: {
              images: [{ resized_image_url: `https://scontent.xx.fbcdn.net/${calls}.jpg` }],
            },
          },
        ],
        cursor: calls < 3 ? String(calls) : null,
      });
    };
    timeout = setTimeout(() => {
      releasedByTimeout = true;
      release();
    }, 2000);
    work = tickLibraryOwner('alice', {
      directory: dir,
      persistMedia: async (ads) => {
        await mediaGate;
        return ads;
      },
    });
    await pages;
    assert.equal(releasedByTimeout, false);
    assert.equal(calls, 3);
    release();
    await work;
  } finally {
    release();
    if (timeout) clearTimeout(timeout);
    await work?.catch(() => {});
    globalThis.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
});
test('Spy notifies only discoveries after baseline, preserves same-day known IDs and deduplicates retries and reappearances', () => {
  const state = enrollLibraryOffers(initialLibraryState('alice'), [
    { id: 'offer', name: 'Example', sources: [source], responsibleId: 'douglas' },
  ]);
  const job = state.jobs.offer;
  const baseline = snap([ad('1')]);
  assert.equal(spyDiscoveryNotice('alice', job, baseline, []), null);
  job.discoverySeen = spyDiscoverySeen('alice', job, baseline);
  job.snapshots = [baseline];
  const next = snap([ad('2'), ad('3', '200')]);
  const notice = spyDiscoveryNotice('alice', job, next, [])!;
  assert.equal(notice.spy.newAds, 2);
  assert.equal(notice.spy.newPages, 1);
  assert.equal(notice.recipientId, 'douglas');
  job.discoverySeen = spyDiscoverySeen('alice', job, next);
  job.snapshots = [next];
  assert.equal(spyDiscoveryNotice('alice', job, next, [notice]), null);
  assert.equal(spyDiscoveryNotice('alice', job, snap([ad('1')]), [notice]), null);
  assert.equal(spyDiscoveryNotice('alice', job, snap([ad('9')], 'new-provider'), [notice]), null);
  const reassigned = { ...job, responsibleId: 'bob' };
  assert.equal(
    spyDiscoveryNotice('alice', reassigned, snap([ad('4', '300')]), [notice])!.recipientId,
    'bob',
  );
  assert.equal(
    spyDiscoveryNotice('alice', { ...job, responsibleId: null }, snap([ad('4')]), [notice]),
    null,
  );
  assert.equal(visibleSpyNotices([notice], 'alice').length, 0);
  assert.equal(visibleSpyNotices([notice], 'douglas').length, 1);
  assert.ok(!('entityKeys' in visibleSpyNotices([notice], 'douglas')[0]));
});
test('Spy recipient inbox and read markers persist and cannot mark another recipient notice as read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-notices-'));
  try {
    const state = enrollLibraryOffers(initialLibraryState('alice'), [
      { id: 'offer', name: 'Example', sources: [source], responsibleId: 'douglas' },
    ]);
    state.jobs.offer.snapshots = [snap([ad('1')])];
    const n = spyDiscoveryNotice('alice', state.jobs.offer, snap([ad('2', '200')]), [])!;
    state.notices = [n];
    await changeLibraryState('alice', () => state, dir);
    assert.equal((await spyNoticeFeed('alice', [n.id], dir)).notifications.length, 0);
    assert.equal((await readLibraryState('alice', dir)).notices[0].unread, true);
    const read = await spyNoticeFeed('douglas', [n.id], dir);
    assert.equal(read.notifications[0].unread, false);
    assert.equal((await readLibraryState('alice', dir)).notices[0].unread, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Unlimited authorized reads ignore exhausted internal caps, retain accounting, and create one persistent real-workflow discovery notice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-unlimited-'));
  const original = globalThis.fetch;
  try {
    const state = enrollLibraryOffers(initialLibraryState('alice'), [
      { id: 'offer', name: 'Example', sources: [source], responsibleId: 'douglas' },
    ]);
    state.encrypted = await encryptLibraryToken('test-key', dir);
    state.provider = 'scrapecreators';
    state.paidRequestsEnabled = true;
    state.unlimitedRequests = true;
    state.requestBudget = 0;
    state.creditsRemaining = 100;
    state.spendingPlan = {
      preparedAt: new Date().toISOString(),
      creditLimit: 1,
      dailyLimit: 1,
      reserved: 5,
      dailyReserved: 5,
      reservationDay: '2026-11-09',
    };
    Object.assign(state.jobs.offer, {
      optedIn: true,
      enabled: true,
      status: 'waiting',
      nextAt: new Date().toISOString(),
    });
    await changeLibraryState('alice', () => state, dir);
    let calls = 0;
    let phase = 0;
    globalThis.fetch = async () => {
      calls++;
      const id = phase === 0 ? String(calls) : phase === 1 ? '9' : '1';
      return Response.json({
        success: true,
        credits_remaining: 100 - calls,
        searchResults: [
          {
            ad_archive_id: id,
            page_id: phase === 1 ? '900' : '100',
            page_name: 'Page',
            is_active: true,
          },
        ],
        cursor: phase === 0 && calls < 3 ? `${'x'.repeat(25000)}-${calls}` : null,
      });
    };
    await tickLibraryOwner('alice', { directory: dir });
    let saved = await readLibraryState('alice', dir);
    assert.equal(calls, 3);
    assert.equal(saved.spendingPlan!.reserved, 8);
    assert.equal(saved.requestBudget, 0);
    assert.equal(saved.notices.length, 0);
    phase = 1;
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        jobs: { ...s.jobs, offer: { ...s.jobs.offer, nextAt: new Date().toISOString() } },
      }),
      dir,
    );
    await tickLibraryOwner('alice', { directory: dir });
    saved = await readLibraryState('alice', dir);
    assert.equal(saved.notices.length, 1);
    assert.equal(saved.notices[0].spy.newAds, 1);
    assert.equal(saved.notices[0].spy.newPages, 1);
    phase = 2;
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        jobs: { ...s.jobs, offer: { ...s.jobs.offer, nextAt: new Date().toISOString() } },
      }),
      dir,
    );
    await tickLibraryOwner('alice', { directory: dir });
    assert.equal((await readLibraryState('alice', dir)).notices.length, 1);
  } finally {
    globalThis.fetch = original;
    await rm(dir, { recursive: true, force: true });
  }
});
test('Worker collects independent due offers in parallel without touching future offers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-parallel-'));
  try {
    const state = enrollLibraryOffers(
      initialLibraryState('alice'),
      Array.from({ length: 11 }, (_, i) => ({ id: `offer${i}`, name: 'Offer', sources: [source] })),
    );
    state.provider = 'browser';
    for (const j of Object.values(state.jobs))
      Object.assign(j, {
        optedIn: true,
        enabled: true,
        status: 'waiting',
        nextAt: new Date().toISOString(),
      });
    state.jobs.offer10.nextAt = '2099-01-01T00:00:00Z';
    await changeLibraryState('alice', () => state, dir);
    let active = 0;
    let max = 0;
    let calls = 0;
    await tickLibraryUsers(dir, async () => {
      active++;
      calls++;
      max = Math.max(active, max);
      await new Promise((r) => setTimeout(r, 200));
      active--;
      return [ad('1')];
    });
    assert.equal(calls, 10);
    assert.ok(max > 1);
    assert.ok(max <= 8);
    const saved = await readLibraryState('alice', dir);
    assert.equal(Object.values(saved.jobs).filter((j) => j.snapshots.length === 1).length, 10);
    assert.equal(saved.jobs.offer10.snapshots.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
