import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('synthetic preview never fabricates successful responses for excluded routes', () => {
  const source = readFileSync(
    new URL('../../api/scripts/native-task-preview.ts', import.meta.url),
    'utf8',
  );
  const fallback = source.slice(
    source.indexOf('app.setNotFoundHandler'),
    source.indexOf('async function stop'),
  );
  assert.match(fallback, /reply\.code\(404\)/);
  assert.doesNotMatch(fallback, /notifications:|offers:|events:|preferences:/);
});

test('resumed synthetic schemas are validated and not dropped on shutdown', () => {
  const source = readFileSync(
    new URL('../../api/scripts/native-task-preview.ts', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes('/^native_preview_[a-f0-9]{32}$/'));
  assert.match(source, /if \(!existingSchema\) await root\.unsafe\(`DROP SCHEMA/);
});
