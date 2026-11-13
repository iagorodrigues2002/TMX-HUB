import assert from 'node:assert/strict';
import test from 'node:test';
import { spyAdActivity } from '../src/lib/spy-ad-activity';
import type { LibraryAd } from '../src/lib/spy-library-reader';

const ad: LibraryAd = {
  id: '1',
  pageId: '2',
  pageName: 'Page',
  startedAt: null,
  url: 'https://www.facebook.com/ads/library/?id=1',
};
test('uses explicit Library status and never infers inactive from disappearance', () => {
  const old = { at: '2026-11-12T12:00:00Z', scope: 'a', ads: [ad] };
  const latest = { at: '2026-11-13T12:00:00Z', scope: 'a', ads: [] as LibraryAd[] };
  assert.equal(spyAdActivity([old], 'a', '1').status, 'active');
  assert.equal(spyAdActivity([old, latest], 'a', '1').status, 'unknown');
  assert.equal(
    spyAdActivity(
      [old, { ...latest, activity: { '1': { isActive: false, checkedAt: latest.at } } }],
      'a',
      '1',
    ).status,
    'inactive',
  );
  latest.ads = [{ ...ad, isActive: false, activityCheckedAt: latest.at }];
  assert.deepEqual(spyAdActivity([latest, old], 'a', '1'), {
    status: 'inactive',
    checkedAt: latest.at,
  });
  assert.equal(spyAdActivity([{ ...latest, scope: 'b' }, old], 'a', '1').status, 'active');
});
