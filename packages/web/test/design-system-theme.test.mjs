import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/app/design-system.css', import.meta.url), 'utf8');
const themes = [
  ...css.matchAll(/html\[data-tmx-design="glass"\](?:\[data-theme="light"\])?\s*\{([^}]+)\}/g),
].slice(0, 2);

function luminance(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('glass themes keep normal text, status text and primary labels at WCAG AA contrast', () => {
  assert.equal(themes.length, 2);
  for (const [index, match] of themes.entries()) {
    const tokens = Object.fromEntries(
      [...match[1].matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map((entry) => [entry[1], entry[2]]),
    );
    for (const token of [
      'color-foreground',
      'color-muted-foreground',
      'color-success',
      'color-warning',
      'color-danger',
    ]) {
      for (const surface of ['color-background', 'color-bg-elevated']) {
        assert.ok(
          contrast(tokens[token], tokens[surface]) >= 4.5,
          `theme ${index}: ${token} on ${surface}`,
        );
      }
    }
    assert.ok(contrast(tokens['color-primary'], tokens['color-primary-foreground']) >= 4.5);
    assert.ok(contrast('#102f38', tokens['accent-to']) >= 4.5);
  }
});
