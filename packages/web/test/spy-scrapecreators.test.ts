import assert from 'node:assert/strict';
import test from 'node:test';
import { LibraryFailure, libraryDelta, libraryScope } from '../src/lib/spy-library-reader';
import { type ScrapeCheckpoint, readScrapeLibrary } from '../src/lib/spy-scrapecreators-reader';

const source = 'https://www.facebook.com/ads/library/?q=%22example.com%22&country=ALL';
const ad = (id: string) => ({
  ad_archive_id: id,
  page_id: '100',
  page_name: 'Example',
  is_active: true,
});
test('Long real-world cursors continue by POST and checkpoint loop detection stores compact hashes with legacy compatibility', async () => {
  let calls = 0;
  const checkpoints: ScrapeCheckpoint[] = [];
  const result = await readScrapeLibrary(
    'synthetic',
    [source],
    ['ALL'],
    async (_url, init) => {
      calls++;
      const input = JSON.parse(String(init?.body));
      if (calls > 1) assert.equal(input.cursor.length, calls === 2 ? 25000 : 30000);
      return Response.json({
        success: true,
        credits_remaining: 100 - calls,
        searchResults: [ad(String(calls))],
        cursor: calls === 1 ? 'a'.repeat(25000) : calls === 2 ? 'b'.repeat(30000) : null,
      });
    },
    async () => {},
    undefined,
    async (cp) => {
      checkpoints.push(structuredClone(cp));
    },
  );
  assert.equal(checkpoints.at(-1)!.pages, 3);
  assert.equal(result.ads.length, 3);
  assert.equal(checkpoints[0].cursor.length, 25000);
  assert.equal(checkpoints[1].cursor.length, 30000);
  assert.equal(checkpoints[0].seenCursors[0].length, 71);
  assert.ok(JSON.stringify(checkpoints[1].seenCursors).length < 200);
  for (const seenCursors of [checkpoints[0].seenCursors, [checkpoints[0].cursor]])
    await assert.rejects(
      readScrapeLibrary(
        'synthetic',
        [source],
        ['ALL'],
        async () =>
          Response.json({
            success: true,
            credits_remaining: 90,
            searchResults: [ad('4')],
            cursor: checkpoints[0].cursor,
          }),
        async () => {},
        { ...checkpoints[0], seenCursors },
      ),
      /incomplete/,
    );
});
test('ScrapeCreators passes the former 60-page limit and filters inactive variants', async () => {
  let calls = 0;
  const result = await readScrapeLibrary('synthetic', [source], ['ALL'], async () => {
    calls++;
    return Response.json({
      success: true,
      credits_remaining: 1000 - calls,
      searchResults: [ad(String(calls)), { ...ad('99999'), is_active: false }],
      cursor: calls < 285 ? `next-${calls}` : null,
    });
  });
  assert.equal(calls, 285);
  assert.equal(result.ads.length, 285);
  assert.ok(!result.ads.some((a) => a.id === '99999'));
  assert.equal(result.activity['99999'].isActive, false);
  assert.equal(result.activity['1'].isActive, true);
});
test('ScrapeCreators preserves global scope, paginates by POST and deduplicates Library IDs', async () => {
  let calls = 0;
  let reserved = 0;
  const result = await readScrapeLibrary(
    'synthetic-key',
    [source, source],
    ['ALL'],
    (async (url, options) => {
      calls++;
      assert.equal(new URL(String(url)).origin, 'https://api.scrapecreators.com');
      assert.ok(!String(url).includes('synthetic-key'));
      assert.equal(options?.method, 'POST');
      assert.equal(options?.redirect, 'error');
      const body = JSON.parse(options?.body as string);
      assert.equal(body.country, 'ALL');
      assert.equal(body.query, 'example.com');
      assert.equal(body.search_type, 'keyword_exact_phrase');
      if (calls === 2) assert.equal(body.cursor, 'opaque-cursor');
      return Response.json({
        success: true,
        credits_remaining: 100 - calls,
        searchResults: calls === 1 ? [ad('1')] : [ad('1'), ad('2')],
        cursor: calls === 1 ? 'opaque-cursor' : null,
      });
    }) as typeof fetch,
    async () => {
      reserved++;
    },
  );
  assert.equal(calls, 2);
  assert.equal(reserved, 2);
  assert.equal(result.ads.length, 2);
  assert.equal(result.creditsRemaining, 98);
});
test('ScrapeCreators queries advertiser Page IDs without a keyword and honors country filter', async () => {
  await readScrapeLibrary(
    'synthetic',
    ['https://www.facebook.com/ads/library/?view_all_page_id=123&country=BR'],
    ['ALL'],
    (async (url, options) => {
      assert.ok(String(url).endsWith('/company/ads'));
      const body = JSON.parse(options?.body as string);
      assert.equal(body.pageId, '123');
      assert.equal(body.country, 'BR');
      assert.equal(body.query, undefined);
      return Response.json({ success: true, credits_remaining: 5, results: [ad('1')], cursor: '' });
    }) as typeof fetch,
  );
});
test('ScrapeCreators refuses malformed, failed, repeated-cursor and over-budget reads instead of publishing zero', async () => {
  for (const body of [{ success: false }, {}, { success: true, credits_remaining: 1 }])
    await assert.rejects(
      readScrapeLibrary('synthetic', [source], ['ALL'], (async () =>
        Response.json(body)) as typeof fetch),
      (e: unknown) => e instanceof LibraryFailure && e.code === 'incomplete',
    );
  await assert.rejects(
    readScrapeLibrary('synthetic', [source], ['ALL'], (async () =>
      Response.json({}, { status: 402 })) as typeof fetch),
    (e: unknown) => e instanceof LibraryFailure && e.code === 'credits_exhausted',
  );
  let calls = 0;
  await assert.rejects(
    readScrapeLibrary('synthetic', [source], ['ALL'], (async () => {
      calls++;
      return Response.json({
        success: true,
        credits_remaining: 10,
        searchResults: [ad('1')],
        cursor: 'repeat',
      });
    }) as typeof fetch),
    (e: unknown) => e instanceof LibraryFailure && e.code === 'incomplete',
  );
  assert.equal(calls, 2);
  let budget = 1;
  calls = 0;
  await assert.rejects(
    readScrapeLibrary(
      'synthetic',
      [source],
      ['ALL'],
      (async () => {
        calls++;
        return Response.json({
          success: true,
          credits_remaining: 10,
          searchResults: [ad('1')],
          cursor: 'next',
        });
      }) as typeof fetch,
      async () => {
        if (!budget--) throw new LibraryFailure('credits_exhausted');
      },
    ),
    (e: unknown) => e instanceof LibraryFailure && e.code === 'credits_exhausted',
  );
  assert.equal(calls, 1);
});
test('Switching provider starts a new comparison baseline', () => {
  const meta = libraryScope([source], ['ALL']);
  const global = libraryScope([source], ['ALL'], 'scrapecreators');
  assert.notEqual(meta, global);
  assert.equal(libraryDelta({ scope: meta, ads: [] }, { scope: global, ads: [] }).baseline, true);
});
