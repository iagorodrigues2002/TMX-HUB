import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('local API entry uses current application routes without production workers or migrations', () => {
  const source = readFileSync(new URL('../../api/scripts/local-preview-api.mts', import.meta.url), 'utf8');
  assert.match(source, /import \{ buildApp \} from '\.\.\/src\/app\.js'/);
  assert.match(source, /tmx_live_preview_/);
  assert.match(source, /redis\.port === '6379'/);
  assert.doesNotMatch(source, /import .*server\.js|create\w*Worker\(|runAdsImport\(|recoverTrackingDeliveries\(/);
});

test('the task schema migration is registered in the actual migration runner', () => {
  const source = readFileSync(new URL('../../api/scripts/migrate.mjs', import.meta.url), 'utf8');
  assert.match(source, /'105_task_management\.sql'/);
});
