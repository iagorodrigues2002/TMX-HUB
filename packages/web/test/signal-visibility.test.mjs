import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('tab visibility pauses animations without changing the motion/count-up flag', () => {
  const source = readFileSync(
    new URL('../src/components/overview/signal-preview.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../src/components/overview/signal-preview.module.css', import.meta.url),
    'utf8',
  );
  assert.match(source, /const active = effects && !reduced.matches;/);
  assert.match(source, /const updateVisibility = \(\) => setHidden\(document.hidden\);/);
  assert.match(source, /addEventListener\('visibilitychange', updateVisibility\)/);
  assert.match(source, /removeEventListener\('visibilitychange', updateVisibility\)/);
  assert.match(source, /data-paused=\{hidden\}/);
  assert.match(
    css,
    /\.signal\[data-paused="true"\][\s\S]*?animation-play-state: paused !important;/,
  );
});
