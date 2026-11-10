import assert from 'node:assert/strict';
import test from 'node:test';
import { monitorSources } from '../src/lib/spy-monitor-sources';
test('Missing Library links fall back to distinct safe domain searches', () => {
  const sources = monitorSources(
    [],
    ['EXAMPLE.COM', 'https://EXAMPLE.COM/path', 'invalid', 'https://user:pass@example.com'],
  );
  assert.equal(sources.length, 1);
  assert.equal(new URL(sources[0]).searchParams.get('q'), '"example.com"');
  assert.equal(new URL(sources[0]).searchParams.get('country'), 'ALL');
  const merged = monitorSources(['original'], ['example.com']);
  assert.equal(merged[0], 'original');
  assert.equal(merged.length, 2);
  assert.deepEqual(monitorSources([sources[0]], ['EXAMPLE.COM']), sources);
});
