import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(
  new URL('../../packages/web/src/components/design-system/reference-tokens.css', import.meta.url),
  'utf8',
);
const blocks = [...css.matchAll(/\.tmx-glass-reference[^{}]*\{([^}]+)\}/g)].map((match) =>
  Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((token) => [token[1], token[2]]),
  ),
);
function luminance(hex) {
  return [1, 3, 5]
    .map((offset) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('candidate tokens remain opt-in instead of changing the global theme', () => {
  assert.equal(blocks.length, 2);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /:root|\bbody\s*\{/);
});

for (const [index, override] of blocks.entries()) {
  const theme = { ...blocks[0], ...override };
  test(`theme ${index}: text and subtle comparisons have AA contrast on the canvas`, () => {
    for (const name of [
      '--ds-text',
      '--ds-muted',
      '--ds-quiet',
      '--ds-positive',
      '--ds-negative',
    ]) {
      assert.ok(contrast(theme[name], theme['--ds-canvas']) >= 4.5, name);
    }
  });
  test(`theme ${index}: primary action label remains readable`, () => {
    assert.ok(contrast(theme['--ds-on-action'], theme['--ds-action']) >= 4.5);
  });
}
