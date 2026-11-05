import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TRACKING_DASHBOARD_STALE_TIME } from '../src/components/tracking/tracking-query.ts';
import { makeQueryClient } from '../src/lib/query-client.ts';
import { resetSessionData } from '../src/lib/session-data.ts';

test('tracking and the shell deduplicate offer reads, honor mutations and clear across sessions', async () => {
  const readOptions = (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const config = source.match(/const offersQuery = useQuery\((\{[\s\S]*?\})\);/);
    assert.ok(config);
    return new Function(
      'apiClient',
      'TRACKING_DASHBOARD_STALE_TIME',
      'pathname',
      'isOfferContextPath',
      `return (${config[1]})`,
    )(apiClient, TRACKING_DASHBOARD_STALE_TIME, '/tracking', () => true);
  };
  let calls = 0;
  let member = 'one';
  const apiClient = {
    listOffers: async () => {
      calls++;
      return [{ id: `offer-for-member-${member}` }];
    },
  };
  const shell = readOptions('../src/components/hub/offer-context-switcher.tsx');
  const tracking = readOptions('../src/components/tracking/tracking-offer-context.tsx');
  const client = makeQueryClient();
  try {
    const [shellData, trackingData] = await Promise.all([
      client.fetchQuery(shell),
      client.fetchQuery(tracking),
    ]);
    assert.equal(calls, 1, 'both providers on /tracking must share the in-flight GET');
    assert.deepEqual(shellData, trackingData);
    assert.equal(tracking.staleTime, TRACKING_DASHBOARD_STALE_TIME);
    assert.equal(tracking.retry, false);
    await client.invalidateQueries({ queryKey: ['offers'] });
    await client.fetchQuery(tracking);
    assert.equal(calls, 2, 'offer mutation invalidation must refresh the tracking cache');
    resetSessionData(client);
    assert.equal(client.getQueryData(tracking.queryKey), undefined);
    member = 'two';
    assert.deepEqual(await client.fetchQuery(tracking), [{ id: 'offer-for-member-two' }]);
    assert.equal(calls, 3, 'a new session cannot reuse the previous member offers');
  } finally {
    client.clear();
  }
});
