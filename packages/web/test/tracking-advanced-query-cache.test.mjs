import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { TRACKING_DASHBOARD_STALE_TIME } from '../src/components/tracking/tracking-query.ts';

test('advanced tracking shares its payload across sections without sharing offers or ignoring invalidation', async () => {
  const source = readFileSync(
    new URL(
      '../src/components/tracking/sections/journey/tracking-content/use-upsell-queries.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const navigation = readFileSync(
    new URL(
      '../src/components/tracking/sections/journey/tracking-content/tracking-navigation.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const config = source.match(/const advanced = useQuery\((\{[\s\S]*?\})\);/);
  const sectionList = navigation.match(
    /ADVANCED_QUERY_SECTIONS = new Set<TrackingSectionId>\((\[[\s\S]*?\])\)/,
  );
  assert.ok(config);
  assert.ok(sectionList);
  const sections = new Set(new Function(`return (${sectionList[1]})`)());
  const calls = [];
  const apiClient = {
    getAdvancedTracking: async (offerId) => {
      calls.push(offerId);
      return { offerId, revision: calls.length };
    },
  };
  const options = (offerId, section) =>
    new Function(
      'offerId',
      'section',
      'apiClient',
      'ADVANCED_QUERY_SECTIONS',
      'TRACKING_DASHBOARD_STALE_TIME',
      `return (${config[1]})`,
    )(offerId, section, apiClient, sections, TRACKING_DASHBOARD_STALE_TIME);
  const client = new QueryClient();
  try {
    assert.equal(sections.size, 6);
    let first;
    for (const section of sections) {
      const query = options('offer-one', section);
      assert.equal(query.enabled, true);
      assert.equal(query.staleTime, TRACKING_DASHBOARD_STALE_TIME);
      const result = await client.fetchQuery(query);
      first ??= result;
      assert.deepEqual(result, first);
    }
    assert.deepEqual(calls, ['offer-one']);
    assert.equal(options('offer-one', 'tracker').enabled, false);
    assert.equal(options('offer-one', 'upsells').enabled, false);
    const other = await client.fetchQuery(options('offer-two', 'domains'));
    assert.equal(other.offerId, 'offer-two');
    assert.deepEqual(calls, ['offer-one', 'offer-two']);
    await client.invalidateQueries({ queryKey: ['tracking-advanced', 'offer-one'] });
    const refreshed = await client.fetchQuery(options('offer-one', 'links'));
    assert.equal(refreshed.revision, 3);
    assert.deepEqual(calls, ['offer-one', 'offer-two', 'offer-one']);
    assert.deepEqual(await client.fetchQuery(options('offer-two', 'links')), other);
    assert.equal(calls.length, 3);
  } finally {
    client.clear();
  }
});
