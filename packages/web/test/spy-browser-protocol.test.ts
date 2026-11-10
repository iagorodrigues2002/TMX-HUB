import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLibraryPages } from '../src/lib/spy-browser-protocol';
const ad = (id: string) => ({
  ad_archive_id: id,
  page_id: '42',
  page_name: 'Example',
  is_active: true,
});
test('Browser collector flattens every collated variant and requires a real pagination signal', () => {
  const [page] = browserLibraryPages({
    nested: {
      data: {
        ad_library_main: {
          search_results_connection: {
            edges: [{ node: { collated_results: [ad('1'), ad('2')] } }],
            count: 1200,
            page_info: { has_next_page: true, end_cursor: 'next' },
          },
        },
      },
    },
  });
  assert.equal(page.ads.length, 2);
  assert.equal(page.hasNext, true);
  assert.equal(page.estimate, 1200);
  assert.equal(
    browserLibraryPages({ some_other_connection: { page_info: { has_next_page: false } } }).length,
    0,
  );
  assert.throws(() => browserLibraryPages({ search_results_connection: { edges: [] } }));
  assert.throws(() =>
    browserLibraryPages({
      search_results_connection: { edges: [], page_info: { has_next_page: true } },
    }),
  );
  const [empty] = browserLibraryPages({
    search_results_connection: { edges: [], page_info: { has_next_page: false } },
  });
  assert.equal(empty.ads.length, 0);
  assert.equal(empty.hasNext, false);
});
test('Browser collector excludes inactive collated variants without losing the page cursor', () => {
  const [page] = browserLibraryPages({
    search_results_connection: {
      edges: [{ node: { collated_results: [ad('1'), { ...ad('2'), is_active: false }, ad('3')] } }],
      page_info: { has_next_page: false },
    },
  });
  assert.deepEqual(
    page.ads.map((a) => a.id),
    ['1', '3'],
  );
  assert.equal(page.hasNext, false);
});
