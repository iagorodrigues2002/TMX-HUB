import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';

test('fresh notification reads survive navigation, expire within the poll interval and stay user-scoped', async () => {
  const source = readFileSync(
    new URL('../src/components/hub/notification-center.tsx', import.meta.url),
    'utf8',
  );
  const config = source.match(/const query = useQuery\((\{[\s\S]*?\})\);/);
  assert.ok(config);
  let calls = 0;
  const notificationApi = { list: async () => ({ notifications: [], revision: ++calls }) };
  const options = (id) =>
    new Function('user', 'notificationApi', `return (${config[1]})`)({ id }, notificationApi);
  const client = new QueryClient();
  const originalNow = Date.now;
  let now = 100000;
  Date.now = () => now;
  try {
    assert.equal(options('one').staleTime, options('one').refetchInterval);
    await client.fetchQuery(options('one'));
    now += 5000;
    await client.fetchQuery(options('one'));
    assert.equal(calls, 1, 'a remount within the freshness window must reuse the result');
    await client.fetchQuery(options('two'));
    assert.equal(calls, 2, 'another identity cannot reuse the previous user cache');
    now += 11000;
    await client.fetchQuery(options('one'));
    assert.equal(calls, 3, 'stale data must refresh');
    await client.invalidateQueries({ queryKey: options('one').queryKey });
    await client.fetchQuery(options('one'));
    assert.equal(calls, 4, 'explicit invalidation must bypass freshness');
    assert.match(source, /await query\.refetch\(\)/, 'mutations retain their immediate refresh');
  } finally {
    Date.now = originalNow;
    client.clear();
  }
});
