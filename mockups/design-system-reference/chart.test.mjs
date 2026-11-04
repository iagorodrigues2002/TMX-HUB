import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hourlyCeiling,
  hourlyGeometry,
  hourlySamples,
} from '../../packages/web/src/components/design-system/reference-chart.ts';

test('map imported from the preview keeps its country identifiers and valid activity coordinates', () => {
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../packages/web/src/components/design-system/reference-map.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const ids = new Set(map.countries.map((country) => country.iso));
  assert.equal(ids.size, 176);
  assert.equal(map.points.length, 8);
  for (const point of map.points) {
    assert.ok(ids.has(point.iso));
    assert.equal(point.xy.length, 2);
    assert.ok(point.xy.every(Number.isFinite));
    assert.ok(point.xy[0] >= 0 && point.xy[0] <= 900);
    assert.ok(point.xy[1] >= 0 && point.xy[1] <= 430);
  }
});

test('both views and filtered intermediates keep every hour on the curve with no overshoot', () => {
  for (const progress of [0, 0.2, 0.5, 0.95, 1]) {
    const values = hourlySamples[0].map(
      (value, i) => value + (hourlySamples[1][i] * 0.68 - value) * progress,
    );
    const { line, points, area } = hourlyGeometry(values);
    assert.equal(points.length, 24);
    assert.equal((line.match(/L/g) || []).length, 23);
    for (const point of points) {
      assert.ok(line.includes(`${point.x},${point.y}`));
      assert.equal(point.value, values[point.hour]);
      assert.ok(point.y >= 30 && point.y <= 247);
    }
    assert.ok(area.startsWith(line));
    assert.ok(area.endsWith('L582,247 H64 Z'));
    assert.doesNotMatch(line, /NaN|undefined/);
  }
});

test('preview geometry keeps the peak at 15h and aligns interaction coordinates after resizing', () => {
  assert.equal(hourlySamples[0].indexOf(Math.max(...hourlySamples[0])), 15);
  for (const width of [260, 390, 600, 980]) {
    const height = width < 400 ? 245 : 285;
    for (const scale of [0, 0.32, 0.68, 1]) {
      const values = hourlySamples[0].map((value) => value * scale);
      const ceiling = hourlyCeiling(values);
      const plot = hourlyGeometry(values, width, height, ceiling);
      assert.equal(plot.points[0].x, 64);
      assert.equal(plot.points.at(-1).x, width - 18);
      for (const point of plot.points) {
        assert.ok(Math.abs(point.value - (1 - (point.y - 30) / (height - 68)) * ceiling) < 0.00001);
        assert.ok(point.y >= 30 && point.y <= height - 38);
      }
    }
  }
});
