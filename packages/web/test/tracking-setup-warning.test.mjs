import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/tracking/sections/journey/tracking-section-content.tsx', import.meta.url), 'utf8');
const condition = source.match(/\{(config\.isSuccess &&\s+config\.data &&\s+\(!config\.data\?\.configured \|\| !config\.data\?\.vendepay\?\.configured\)) &&/);
test('setup banner requires a successful response, not absent configuration data', () => {
  assert.ok(condition, 'Banner must explicitly require successful configuration data');
  const show = new Function('config', `return Boolean(${condition[1]})`);
  for (const config of [
    { isSuccess: false, data: undefined },
    { isSuccess: false, data: { configured: false } },
    { isSuccess: true, data: { configured: true, vendepay: { configured: true } } },
  ]) assert.equal(show(config), false);
  assert.equal(show({ isSuccess: true, data: { configured: false } }), true);
  assert.equal(show({ isSuccess: true, data: { configured: true, vendepay: { configured: false } } }), true);
});
