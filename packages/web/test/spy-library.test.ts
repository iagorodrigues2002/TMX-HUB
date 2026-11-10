import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  LibraryFailure,
  libraryCommercialCountries,
  libraryCountries,
  libraryDelta,
  normalizeLibrarySource,
  readLibrary,
} from '../src/lib/spy-library-reader';
import {
  changeLibraryState,
  encryptLibraryToken,
  enrollLibraryOffers,
  prepareScrapeMonitoring,
  publicLibraryAds,
  publicLibraryPages,
  publicLibraryState,
  readLibraryState,
  tickLibraryOwner,
} from '../src/lib/spy-library-store';
const source =
  'https://www.facebook.com/ads/library/?ad_type=all&active_status=active&country=ALL&q=%22example.com%22&search_type=keyword_exact_phrase';
test('Library expands ALL to explicit commercial coverage and preserves specific country filters', async () => {
  assert.equal(libraryCommercialCountries.length, 28);
  assert.ok(libraryCommercialCountries.includes('GB'));
  assert.deepEqual(libraryCountries(normalizeLibrarySource(source), ['DE']), ['DE']);
  assert.deepEqual(
    libraryCountries(normalizeLibrarySource(source.replace('country=ALL', 'country=BR')), ['ALL']),
    ['BR'],
  );
  await readLibrary('synthetic', [source], ['ALL'], (async (input: RequestInfo | URL) => {
    const countries = JSON.parse(new URL(String(input)).searchParams.get('ad_reached_countries')!);
    assert.equal(countries.length, 28);
    assert.ok(!countries.includes('ALL'));
    assert.ok(countries.includes('GB') && countries.includes('DE'));
    return Response.json({ data: [result('1')] });
  }) as typeof fetch);
});
const ad = (id: string) => ({
  id,
  pageId: '100',
  pageName: 'Example',
  startedAt: null,
  url: `https://www.facebook.com/ads/library/?id=${id}`,
});
test('ScrapeCreators page history detects new, renamed, missing and returning advertiser IDs without extra API requests', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    const start = new Date();
    await changeLibraryState(
      'alice',
      (s) => ({ ...prepareScrapeMonitoring(s), paidRequestsEnabled: true, requestBudget: 6150 }),
      directory,
    );
    const sets = [
      [
        { ...ad('1'), pageId: '100', pageName: 'Page A' },
        { ...ad('2'), pageId: '200', pageName: 'Page B' },
      ],
      [
        { ...ad('3'), pageId: '100', pageName: 'Page A renamed' },
        { ...ad('4'), pageId: '300', pageName: 'Page C' },
      ],
      [
        { ...ad('5'), pageId: '100', pageName: 'Page A renamed' },
        { ...ad('6'), pageId: '200', pageName: 'Page B' },
      ],
    ];
    let index = 0;
    let calls = 0;
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 100000 - calls,
          searchResults: sets[index].map((a) => ({
            ad_archive_id: a.id,
            page_id: a.pageId,
            page_name: a.pageName,
            is_active: true,
          })),
          cursor: null,
        });
      };
      for (index = 0; index < 3; index++) {
        await tickLibraryOwner('alice', {
          directory,
          now: new Date(start.getTime() + index * 86400000),
        });
        const state = await readLibraryState('alice', directory);
        const pages = publicLibraryPages(state, 'offer', 0)!;
        assert.equal(calls, index + 1, 'Grouping saved pages must never fetch page details');
        if (index === 0) assert.ok(pages.pages.every((p) => p.change === 'baseline'));
        if (index === 1) {
          const fresh = pages.pages.find((p) => p.id === '300')!;
          assert.equal(fresh.change, 'new');
          assert.equal(fresh.firstSeenDay, 1);
          assert.equal(fresh.firstSeenAt, new Date(start.getTime() + 86400000).toISOString());
          const renamed = pages.pages.find((p) => p.id === '100')!;
          assert.equal(renamed.pageName, 'Page A renamed');
          assert.equal(renamed.change, 'existing');
          assert.equal(publicLibraryState(state).jobs.offer.snapshots.at(-1)?.newPages, 1);
        }
        if (index === 2) {
          assert.equal(pages.total, 3, 'Keep all pages seen during the cycle');
          assert.equal(pages.pages.find((p) => p.id === '200')?.change, 'returned');
          assert.equal(pages.pages.find((p) => p.id === '200')?.firstSeenDay, 0);
          assert.equal(pages.pages.find((p) => p.id === '300')?.change, 'missing');
          assert.equal(pages.pages.find((p) => p.id === '300')?.adCount, 0);
          const reading = publicLibraryState(state).jobs.offer.snapshots.at(-1)!;
          assert.equal(reading.pagesCount, 2);
          assert.equal(reading.newPages, 0);
          assert.equal(reading.returningPages, 1);
        }
      }
      await changeLibraryState(
        'alice',
        (s) => ({
          ...s,
          provider: 'browser',
          jobs: {
            offer: {
              ...s.jobs.offer,
              startedAt: null,
              status: 'waiting',
              nextAt: new Date().toISOString(),
            },
          },
        }),
        directory,
      );
      await tickLibraryOwner('alice', {
        directory,
        browserReader: async () => [{ ...ad('9'), pageId: '900', pageName: 'Different scope' }],
      });
      const switched = await readLibraryState('alice', directory);
      const baseline = publicLibraryPages(switched, 'offer', 0)!;
      assert.equal(baseline.total, 1);
      assert.equal(baseline.pages[0].change, 'baseline');
      assert.equal(publicLibraryAds(switched, 'offer', 0)?.ads[0].id, '9');
      assert.equal(publicLibraryState(switched).monitoringCoverage.verified, 1);
      assert.equal(calls, 3);
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('Saved advertiser pages are paginated by ID even when names are identical', async () => {
  await fixture(async (directory) => {
    await connect(directory, new Date());
    await tickLibraryOwner('alice', {
      directory,
      reader: async () =>
        Array.from({ length: 67 }, (_, i) => ({
          ...ad(String(i + 1)),
          pageId: String(i + 100),
          pageName: 'Same name',
        })),
    });
    const state = await readLibraryState('alice', directory);
    const first = publicLibraryPages(state, 'offer', 0)!;
    const second = publicLibraryPages(state, 'offer', first.nextOffset!)!;
    assert.equal(first.pages.length, 50);
    assert.equal(second.pages.length, 17);
    assert.equal(second.nextOffset, null);
    assert.equal(new Set([...first.pages, ...second.pages].map((p) => p.id)).size, 67);
    assert.equal(first.pages[0].adCount, 1);
  });
});
test('ScrapeCreators saves preview images and copy without fetching ad details', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    await changeLibraryState(
      'alice',
      (s) => ({ ...prepareScrapeMonitoring(s), paidRequestsEnabled: true, requestBudget: 100 }),
      directory,
    );
    const original = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 1000,
          searchResults: [
            {
              ad_archive_id: '1',
              page_id: '100',
              page_name: 'Example',
              is_active: true,
              collation_count: 7,
              collation_id: '500',
              snapshot: {
                page_profile_picture_url: 'https://scontent.xx.fbcdn.net/avatar.jpg',
                body: { text: 'Saved copy' },
                title: 'Saved title',
                images: [{ resized_image_url: 'https://scontent.xx.fbcdn.net/creative.jpg' }],
              },
            },
          ],
          cursor: null,
        });
      };
      await tickLibraryOwner('alice', { directory });
      const saved = await readLibraryState('alice', directory);
      const ad = publicLibraryAds(saved, 'offer', 0)!.ads[0];
      assert.equal(ad.thumbnailUrl, 'https://scontent.xx.fbcdn.net/creative.jpg');
      assert.equal(ad.description, 'Saved copy');
      assert.equal(ad.title, 'Saved title');
      assert.equal(ad.isNew, false);
      assert.equal(ad.collationCount, 7);
      assert.equal(ad.collationId, '500');
      const disappeared = structuredClone(saved);
      disappeared.jobs.offer.snapshots[0].ads[0].pagePictureKey = 'a'.repeat(64);
      disappeared.jobs.offer.snapshots.push({
        ...disappeared.jobs.offer.snapshots[0],
        day: 1,
        at: '2026-11-10T12:00:00Z',
        ads: [],
        baseline: false,
        added: [],
        missing: ['1'],
      });
      assert.equal(
        publicLibraryPages(disappeared, 'offer', 0)!.pages[0].pagePictureKey,
        'a'.repeat(64),
      );
      assert.equal(publicLibraryPages(disappeared, 'offer', 0)!.pages[0].change, 'missing');
      assert.equal(
        publicLibraryPages(saved, 'offer', 0)!.pages[0].pagePictureUrl,
        'https://scontent.xx.fbcdn.net/avatar.jpg',
      );
      const ranked = structuredClone(saved);
      ranked.jobs.offer.snapshots.at(-1)!.ads = Array.from({ length: 25 }, (_, i) => ({
        ...ad,
        id: String(i + 1),
        collationCount: i + 1,
        collationId: String(Math.floor(i / 2) + 1),
      }));
      ranked.jobs.offer.snapshots
        .at(-1)!
        .ads.push({ ...ad, id: '99', collationCount: undefined, collationId: undefined });
      const highlights = publicLibraryAds(ranked, 'offer', 0, true)!;
      assert.equal(highlights.ads.length, 12);
      assert.equal(highlights.ads[0].collationCount, 25);
      assert.equal(highlights.ads[0].activeGroupCount, 1);
      assert.equal(highlights.ads[1].activeGroupCount, 2);
      assert.equal(new Set(highlights.ads.map((a) => a.collationId)).size, 12);
      assert.equal(highlights.total, 26);
      assert.equal(highlights.nextOffset, null);
      assert.equal(ranked.jobs.offer.snapshots.at(-1)!.ads[0].id, '1');
      assert.equal(calls, 1);
      const enriched = structuredClone(saved);
      enriched.jobs.offer.partial = {
        at: new Date().toISOString(),
        sourceIndex: 0,
        cursor: 'next',
        seenCursors: ['next'],
        pages: 1,
        creditsRemaining: 999,
        scope: 'preview-enrichment',
        revision: enriched.revision,
        ads: [
          {
            ...ad,
            thumbnailUrl: 'https://scontent.xx.fbcdn.net/new.jpg',
            pagePictureUrl: 'https://scontent.xx.fbcdn.net/new-avatar.jpg',
          },
          {
            ...ad,
            id: '999',
            pageId: '200',
            thumbnailUrl: 'https://scontent.xx.fbcdn.net/other.jpg',
          },
        ],
      };
      const duringRead = publicLibraryAds(enriched, 'offer', 0)!;
      assert.equal(duringRead.ads[0].thumbnailUrl, 'https://scontent.xx.fbcdn.net/new.jpg');
      assert.equal(duringRead.total, 1);
      assert.equal(publicLibraryPages(enriched, 'offer', 0)!.total, 1);
      assert.equal(
        publicLibraryPages(enriched, 'offer', 0)!.pages[0].pagePictureUrl,
        'https://scontent.xx.fbcdn.net/new-avatar.jpg',
      );
      assert.equal(duringRead.at, saved.jobs.offer.snapshots.at(-1)!.at);
      assert.equal(
        saved.jobs.offer.snapshots.at(-1)!.ads[0].thumbnailUrl,
        'https://scontent.xx.fbcdn.net/creative.jpg',
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('Prepared ScrapeCreators plan blocks every request even with an available request budget', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    await changeLibraryState('alice', (s) => prepareScrapeMonitoring(s), directory);
    await changeLibraryState('alice', (s) => ({ ...s, requestBudget: 6150 }), directory);
    let calls = 0;
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        calls++;
        throw Error('Unexpected paid request');
      };
      for (let n = 0; n < 8; n++)
        await tickLibraryOwner('alice', { directory, now: new Date(Date.now() + n * 86400000) });
      const state = await readLibraryState('alice', directory);
      assert.equal(calls, 0);
      assert.equal(state.spendingPlan?.reserved, 0);
      assert.equal(state.jobs.offer.startedAt, null);
      assert.equal(state.jobs.offer.status, 'prepared');
      const preparedAgain = prepareScrapeMonitoring(state);
      assert.equal(preparedAgain.requestBudget, 0);
      assert.equal(preparedAgain.revision, state.revision);
      assert.deepEqual(preparedAgain.spendingPlan, state.spendingPlan);
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('ScrapeCreators completes all 29 offers and 33 sources over seven days with a persistent spending ledger', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    const start = new Date();
    const offers = Array.from({ length: 29 }, (_, i) => ({
      id: `offer${i}`,
      name: `Offer ${i}`,
      sources: Array.from({ length: i < 2 ? 3 : 1 }, (_, k) =>
        source.replace('example.com', `offer${i}-${k}.com`),
      ),
    }));
    await changeLibraryState(
      'alice',
      (s) => ({
        ...prepareScrapeMonitoring(enrollLibraryOffers({ ...s, jobs: {} }, offers), start),
        paidRequestsEnabled: true,
        requestBudget: 6150,
      }),
      directory,
    );
    const original = globalThis.fetch;
    let calls = 0;
    const queries = new Set<string>();
    try {
      globalThis.fetch = async (url, init) => {
        assert.equal(new URL(String(url)).hostname, 'api.scrapecreators.com');
        const body = JSON.parse(init?.body as string);
        assert.equal(body.country, 'ALL');
        assert.equal(body.status, 'ACTIVE');
        queries.add(body.query);
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 100000 - calls,
          searchResults: [
            {
              ad_archive_id: body.cursor ? '2' : '1',
              page_id: '100',
              page_name: 'Synthetic',
              is_active: true,
            },
          ],
          cursor: body.cursor ? null : 'next',
        });
      };
      for (let n = 0; n <= 7; n++) {
        await tickLibraryOwner('alice', {
          directory,
          now: new Date(start.getTime() + n * 86400000),
        });
        const state = await readLibraryState('alice', directory);
        assert.equal(Object.keys(state.jobs).length, 29);
        for (const j of Object.values(state.jobs)) {
          assert.equal(j.snapshots.length, n + 1);
          assert.equal(j.status, n === 7 ? 'complete' : 'active');
          assert.equal(j.snapshots.at(-1)?.ads.length, 2);
        }
        assert.equal(state.spendingPlan?.reserved, (n + 1) * 66);
        assert.equal(state.spendingPlan?.dailyReserved, 66);
      }
      assert.equal(calls, 528);
      assert.equal(queries.size, 33);
      const saved = await readLibraryState('alice', directory);
      assert.equal(saved.requestBudget, 6150 - 528);
      assert.ok(Object.values(saved.jobs).every((j) => j.nextAt === null));
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('ScrapeCreators retries an incomplete page automatically without publishing partial totals', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    const start = new Date();
    await changeLibraryState(
      'alice',
      (s) => ({ ...prepareScrapeMonitoring(s), paidRequestsEnabled: true, requestBudget: 6150 }),
      directory,
    );
    const original = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async (_url, init) => {
        calls++;
        if (calls === 2) return Response.json({ success: false });
        if (calls === 3) assert.equal(JSON.parse(init?.body as string).cursor, 'next');
        return Response.json({
          success: true,
          credits_remaining: 100000 - calls,
          credits_charged: 1,
          searchResults: [
            {
              ad_archive_id: String(calls),
              page_id: '100',
              page_name: 'Synthetic',
              is_active: true,
            },
          ],
          cursor: calls === 1 ? 'next' : null,
        });
      };
      await tickLibraryOwner('alice', { directory, now: start });
      let state = await readLibraryState('alice', directory);
      assert.equal(state.jobs.offer.error, 'incomplete');
      assert.equal(state.jobs.offer.snapshots.length, 0);
      assert.equal(state.jobs.offer.nextAt, new Date(start.getTime() + 300000).toISOString());
      await tickLibraryOwner('alice', { directory, now: new Date(start.getTime() + 360000) });
      state = await readLibraryState('alice', directory);
      assert.equal(calls, 3);
      assert.equal(state.jobs.offer.status, 'active');
      assert.equal(state.jobs.offer.snapshots.at(-1)?.ads.length, 2);
      assert.equal(state.spendingPlan?.reserved, 3);
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('Daily and cycle limits stop before the next billed request and survive restarts', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    const start = new Date();
    await changeLibraryState(
      'alice',
      (s) => {
        const prepared = prepareScrapeMonitoring(s, start, 2, 1);
        return {
          ...prepared,
          paidRequestsEnabled: true,
          requestBudget: 6150,
          jobs: {
            offer: { ...prepared.jobs.offer, status: 'waiting', nextAt: start.toISOString() },
          },
        };
      },
      directory,
    );
    const original = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 100 - calls,
          searchResults: [
            {
              ad_archive_id: String(calls),
              page_id: '100',
              page_name: 'Synthetic',
              is_active: true,
            },
          ],
          cursor: `page-${calls}`,
        });
      };
      await tickLibraryOwner('alice', { directory, now: start });
      let saved = await readLibraryState('alice', directory);
      assert.equal(calls, 1);
      assert.equal(saved.jobs.offer.error, 'daily_budget');
      assert.equal(saved.connectionError, '');
      assert.equal(saved.jobs.offer.snapshots.length, 0);
      await tickLibraryOwner('alice', { directory, now: new Date(start.getTime() + 86400000) });
      assert.equal(calls, 2);
      saved = await readLibraryState('alice', directory);
      assert.equal(saved.spendingPlan?.reserved, 2);
      await tickLibraryOwner('alice', { directory, now: new Date(start.getTime() + 2 * 86400000) });
      assert.equal(calls, 2);
      assert.equal(
        (await readLibraryState('alice', directory)).connectionError,
        'credits_exhausted',
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
test('Autonomous browser saves complete reads with no credential or paid budget', async () => {
  await fixture(async (directory) => {
    await connect(directory, new Date());
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        provider: 'browser',
        encrypted: null,
        requestBudget: 0,
        creditsRemaining: 19,
      }),
      directory,
    );
    let called = 0;
    await tickLibraryOwner('alice', {
      directory,
      browserReader: async (sources, progress) => {
        called++;
        assert.deepEqual(sources, [source]);
        await progress([ad('1')], 1, 0);
        return [ad('1'), ad('2')];
      },
      reader: async () => {
        throw Error('Paid reader must never run');
      },
    });
    const state = await readLibraryState('alice', directory);
    assert.equal(called, 1);
    assert.equal(state.jobs.offer.snapshots.at(-1)?.ads.length, 2);
    assert.equal(state.jobs.offer.partial, null);
    assert.equal(state.requestBudget, 0);
    assert.equal(state.creditsRemaining, 19);
    assert.equal(publicLibraryState(state).monitoringCoverage.verified, 1);
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        jobs: { ...s.jobs, offer: { ...s.jobs.offer, nextAt: new Date().toISOString() } },
      }),
      directory,
    );
    await tickLibraryOwner('alice', {
      directory,
      browserReader: async (_sources, progress) => {
        await progress([ad('3')], 1, 0);
        throw new LibraryFailure('incomplete');
      },
    });
    const failed = await readLibraryState('alice', directory);
    assert.equal(failed.jobs.offer.snapshots.at(-1)?.ads.length, 2);
    assert.equal(failed.jobs.offer.partial?.ads.length, 1);
    assert.ok(failed.jobs.offer.nextAt, 'Unpaid browser failures must retry automatically');
    assert.equal(publicLibraryState(failed).monitoringCoverage.verified, 0);
  });
});
test('Autonomous browser continues the seven-day cycle from persisted state', async () => {
  await fixture(async (directory) => {
    const start = new Date('2026-11-09T12:00:00Z');
    await connect(directory, start);
    await changeLibraryState(
      'alice',
      (s) => ({ ...s, provider: 'browser', encrypted: null, requestBudget: 0 }),
      directory,
    );
    for (let n = 0; n <= 7; n++) {
      await tickLibraryOwner('alice', {
        directory,
        now: new Date(start.getTime() + n * 86400000),
        browserReader: async () => [ad(String(n + 1))],
      });
      const saved = await readLibraryState('alice', directory);
      assert.equal(saved.jobs.offer.snapshots.length, n + 1);
      assert.equal(saved.jobs.offer.status, n === 7 ? 'complete' : 'active');
    }
    assert.equal((await readLibraryState('alice', directory)).jobs.offer.nextAt, null);
  });
});
test('Saved ads pagination exposes every stored ID exactly once without consuming collection credits', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    const ads = Array.from({ length: 1177 }, (_, i) => ad(String(i + 1)));
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T12:00:00Z'),
      reader: async () => ads,
    });
    const state = await readLibraryState('alice', directory);
    const ids: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null) {
      const page = publicLibraryAds(state, 'offer', offset)!;
      assert.equal(page.total, 1177);
      assert.ok(page.ads.length <= 50);
      ids.push(...page.ads.map((a) => a.id));
      offset = page.nextOffset;
      pages++;
    }
    assert.equal(pages, 24);
    assert.equal(ids.length, 1177);
    assert.equal(new Set(ids).size, 1177);
    assert.equal(ids.at(-1), '1177');
    assert.equal(publicLibraryAds(state, 'missing', 0), null);
    assert.equal((await readLibraryState('alice', directory)).requestBudget, state.requestBudget);
  });
});
test('Global collector reserves credits and preserves history when the local trial budget ends mid-pagination', async () => {
  await fixture(async (directory) => {
    await connect(directory);
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T12:00:00Z'),
      reader: async () => [ad('1')],
    });
    await changeLibraryState(
      'alice',
      (s) => ({ ...s, provider: 'scrapecreators', requestBudget: 1, paidRequestsEnabled: true }),
      directory,
    );
    const original = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = (async () => {
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 80,
          searchResults: [
            { ad_archive_id: '2', page_id: '100', page_name: 'Example', is_active: true },
          ],
          cursor: 'next',
        });
      }) as typeof fetch;
      await tickLibraryOwner('alice', { directory, now: new Date('2026-11-10T12:00:00Z') });
      const state = await readLibraryState('alice', directory);
      assert.equal(calls, 1);
      assert.equal(state.requestBudget, 0);
      assert.equal(state.connectionError, 'credits_exhausted');
      assert.equal(state.jobs.offer!.partial?.ads.length, 1);
      assert.equal(publicLibraryState(state).jobs.offer!.progress?.count, 1);
      assert.equal('partial' in publicLibraryState(state).jobs.offer!, false);
      assert.deepEqual(
        state.jobs.offer!.snapshots.at(-1)!.ads.map((a) => a.id),
        ['1'],
      );
      await tickLibraryOwner('alice', { directory, now: new Date('2026-11-11T12:00:00Z') });
      assert.equal(calls, 1);
      await changeLibraryState(
        'alice',
        (s) => ({
          ...s,
          connectionError: '',
          requestBudget: 1,
          jobs: {
            ...s.jobs,
            offer: { ...s.jobs.offer!, status: 'waiting', nextAt: '2026-11-11T12:00:00Z' },
          },
        }),
        directory,
      );
      globalThis.fetch = (async (_url, options) => {
        calls++;
        assert.equal(JSON.parse(options?.body as string).cursor, 'next');
        return Response.json({
          success: true,
          credits_remaining: 79,
          searchResults: [
            { ad_archive_id: '3', page_id: '100', page_name: 'Example', is_active: true },
          ],
          cursor: '',
        });
      }) as typeof fetch;
      await tickLibraryOwner('alice', { directory, now: new Date('2026-11-11T12:00:00Z') });
      const resumed = await readLibraryState('alice', directory);
      assert.equal(calls, 2);
      assert.deepEqual(
        resumed.jobs.offer!.snapshots.at(-1)!.ads.map((a) => a.id),
        ['2', '3'],
      );
      assert.equal(resumed.jobs.offer!.partial, null);
      assert.equal(resumed.creditsRemaining, 79);
    } finally {
      globalThis.fetch = original;
    }
  });
});
const result = (id: string) => ({ id, page_id: '100', page_name: 'Example' });
async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'tmx-spy-library-test-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function connect(directory: string, now = new Date('2026-11-09T12:00:00Z')) {
  const encrypted = await encryptLibraryToken('synthetic-library-test-token', directory);
  await changeLibraryState(
    'alice',
    (s) => {
      const next = enrollLibraryOffers(
        s,
        [{ id: 'offer', name: 'Example', sources: [source] }],
        now,
      );
      return {
        ...next,
        encrypted,
        jobs: {
          ...next.jobs,
          offer: {
            ...next.jobs.offer!,
            optedIn: true,
            enabled: true,
            status: 'waiting' as const,
            nextAt: now.toISOString(),
          },
        },
      };
    },
    directory,
  );
}

test('Library normalizes exact keyword and advertiser sources without accepting arbitrary hosts', () => {
  assert.deepEqual(normalizeLibrarySource(source), {
    type: 'keyword',
    value: 'example.com',
    country: 'ALL',
    exact: true,
  });
  assert.equal(
    normalizeLibrarySource('https://www.facebook.com/ads/library/?view_all_page_id=123').type,
    'page',
  );
  for (const url of [
    'https://example.com/ads/library/?q=x',
    'http://www.facebook.com/ads/library/?q=x',
    'https://www.facebook.com@127.0.0.1/ads/library/?q=x',
    'https://www.facebook.com/ads/library/?q=',
    'https://www.facebook.com/ads/library/?q=x&active_status=inactive',
  ])
    assert.throws(() => normalizeLibrarySource(url));
});
test('Library paginates with opaque cursors on the fixed Graph host and deduplicates IDs', async () => {
  const urls: string[] = [];
  const fetcher = async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer synthetic');
    assert.equal(new URL(url).hostname, 'graph.facebook.com');
    assert.ok(!url.includes('access_token'));
    return new Response(
      JSON.stringify(
        urls.length === 1
          ? {
              data: [result('1')],
              paging: {
                next: 'https://malicious.example/?access_token=secret',
                cursors: { after: 'safe-cursor' },
              },
            }
          : { data: [result('1'), result('2')] },
      ),
    );
  };
  const data = await readLibrary('synthetic', [source], ['DE'], fetcher as typeof fetch);
  assert.equal(data.length, 2);
  assert.equal(new URL(urls[1]!).searchParams.get('after'), 'safe-cursor');
  assert.ok(!JSON.stringify(data).includes('secret'));
});
test('Library keeps permission failures and incomplete pagination distinct from valid zero results', async () => {
  await assert.rejects(
    readLibrary(
      'synthetic',
      [source],
      ['ALL'],
      async () =>
        new Response(
          JSON.stringify({ error: { code: 10, error_subcode: 2332002, message: 'private' } }),
          { status: 400 },
        ),
    ),
    (e: unknown) =>
      e instanceof LibraryFailure && e.code === 'access_required' && e.subcode === 2332002,
  );
  await assert.rejects(
    readLibrary(
      'synthetic',
      [source],
      ['ALL'],
      async () =>
        new Response(
          JSON.stringify({
            data: [result('1')],
            paging: { next: 'next', cursors: { after: 'same' } },
          }),
        ),
    ),
    (e: unknown) => e instanceof LibraryFailure && e.code === 'incomplete',
  );
  assert.deepEqual(
    await readLibrary(
      'synthetic',
      [source],
      ['ALL'],
      async () => new Response(JSON.stringify({ data: [] })),
    ),
    [],
  );
});
test('Library does not compare mismatched sources or country coverage', () => {
  const previous = { scope: 'old', ads: [ad('1')] };
  assert.deepEqual(libraryDelta(previous, { scope: 'new', ads: [ad('2')] }), {
    baseline: true,
    added: [],
    missing: [],
  });
  assert.deepEqual(libraryDelta(previous, { scope: 'old', ads: [ad('2')] }), {
    baseline: false,
    added: ['2'],
    missing: ['1'],
  });
});
test('Library persists an encrypted credential per owner without returning it to the UI', async () =>
  fixture(async (directory) => {
    await connect(directory);
    const s = await readLibraryState('alice', directory);
    assert.equal(s.owner, 'alice');
    assert.equal((await readLibraryState('bob', directory)).encrypted, null);
    assert.ok(!JSON.stringify(publicLibraryState(s)).includes(s.encrypted!));
    for (const file of await readdir(directory)) {
      const raw = await readFile(join(directory, file));
      assert.ok(!raw.toString().includes('synthetic-library-test-token'));
      assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
    }
  }));
test('Library completes exactly the initial read plus seven daily snapshots and resumes from disk', async () =>
  fixture(async (directory) => {
    const start = Date.parse('2026-11-09T12:00:00Z');
    await connect(directory);
    let calls = 0;
    const reader = async (token: string) => {
      assert.equal(token, 'synthetic-library-test-token');
      calls++;
      return calls === 1 ? [ad('1')] : [ad('1'), ad('2')];
    };
    for (let day = 0; day < 8; day++) {
      const now = new Date(start + day * 86400000);
      await tickLibraryOwner('alice', { directory, now, reader });
      await tickLibraryOwner('alice', { directory, now, reader });
    }
    const state = await readLibraryState('alice', directory);
    const job = state.jobs.offer!;
    assert.equal(calls, 8);
    assert.equal(job.status, 'complete');
    assert.equal(job.snapshots.length, 8);
    assert.equal(job.snapshots[0]!.baseline, true);
    assert.deepEqual(job.snapshots[1]!.added, ['2']);
    assert.equal(job.nextAt, null);
  }));
test('Library preserves the previous successful count when the next read fails', async () =>
  fixture(async (directory) => {
    await connect(directory);
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T12:00:00Z'),
      reader: async () => [ad('1')],
    });
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-10T12:00:00Z'),
      reader: async () => {
        throw new LibraryFailure('incomplete');
      },
    });
    const job = (await readLibraryState('alice', directory)).jobs.offer!;
    assert.equal(job.snapshots.length, 1);
    assert.equal(job.snapshots[0]!.ads.length, 1);
    assert.equal(job.status, 'blocked');
    assert.equal(job.error, 'incomplete');
  }));
test('Library rejects stale publication after token replacement or source change', async () =>
  fixture(async (directory) => {
    await connect(directory);
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T12:00:00Z'),
      reader: async () => {
        await changeLibraryState('alice', (s) => ({ ...s, revision: 'replaced' }), directory);
        return [ad('1')];
      },
    });
    assert.equal((await readLibraryState('alice', directory)).jobs.offer!.snapshots.length, 0);
  }));
test('Library stops provider permission retries and backs off globally after rate limiting', async () =>
  fixture(async (directory) => {
    await connect(directory);
    await changeLibraryState(
      'alice',
      (s) =>
        enrollLibraryOffers(
          s,
          [{ id: 'second', name: 'Second', sources: [source] }],
          new Date('2026-11-09T12:00:00Z'),
        ),
      directory,
    );
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        jobs: {
          ...s.jobs,
          second: { ...s.jobs.second!, enabled: true, optedIn: true, status: 'waiting' },
        },
      }),
      directory,
    );
    let calls = 0;
    const reader = async () => {
      calls++;
      throw new LibraryFailure('access_required');
    };
    await tickLibraryOwner('alice', { directory, now: new Date('2026-11-09T12:00:00Z'), reader });
    await tickLibraryOwner('alice', { directory, now: new Date('2026-11-09T12:01:00Z'), reader });
    assert.equal(calls, 1);
    assert.equal((await readLibraryState('alice', directory)).jobs.second!.status, 'blocked');
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        connectionError: '',
        jobs: Object.fromEntries(
          Object.entries(s.jobs).map(([id, j]) => [
            id,
            { ...j, nextAt: null, status: 'waiting' as const },
          ]),
        ),
      }),
      directory,
    );
    calls = 0;
    const limited = async () => {
      calls++;
      throw new LibraryFailure('rate_limited');
    };
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T13:00:00Z'),
      reader: limited,
    });
    await tickLibraryOwner('alice', {
      directory,
      now: new Date('2026-11-09T13:01:00Z'),
      reader: limited,
    });
    assert.equal(calls, 1);
  }));
test('Library writes serialize concurrent enrollment without dropping offers', async () =>
  fixture(async (directory) => {
    await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        changeLibraryState(
          'alice',
          (s) => enrollLibraryOffers(s, [{ id, name: id, sources: [source] }]),
          directory,
        ),
      ),
    );
    assert.equal(Object.keys((await readLibraryState('alice', directory)).jobs).length, 3);
  }));

test('Library never starts tracking by enrollment or by an old automatically enabled record', async () =>
  fixture(async (directory) => {
    await changeLibraryState(
      'alice',
      (s) => enrollLibraryOffers(s, [{ id: 'offer', name: 'Example', sources: [source] }]),
      directory,
    );
    let calls = 0;
    const reader = async () => {
      calls++;
      return [ad('1')];
    };
    await tickLibraryOwner('alice', { directory, reader });
    const unselected = (await readLibraryState('alice', directory)).jobs.offer!;
    assert.equal(unselected.optedIn, false);
    assert.equal(unselected.enabled, false);
    assert.equal(calls, 0);
    await changeLibraryState(
      'alice',
      (s) => ({
        ...s,
        jobs: { offer: { ...s.jobs.offer!, enabled: true, optedIn: false, status: 'waiting' } },
      }),
      directory,
    );
    await tickLibraryOwner('alice', { directory, reader });
    assert.equal(calls, 0);
  }));
test('Library queries every Library of one offer and deduplicates shared ad IDs', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return Response.json({ data: [result('1'), result(String(calls + 1))] });
  };
  const rows = await readLibrary(
    'synthetic',
    [source, source.replace('example.com', 'second.example')],
    ['ALL'],
    fetcher,
  );
  assert.equal(calls, 2);
  assert.deepEqual(rows.map((r) => r.id).sort(), ['1', '2', '3']);
});
