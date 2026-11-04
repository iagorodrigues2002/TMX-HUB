import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NAV_ITEMS } from '../src/components/hub/nav-config';
import { NavigationItem } from '../src/components/hub/sidebar';
import {
  formatRevenueTick,
  hourlyCeiling,
  hourlyGeometry,
} from '../src/components/ui/revenue-geometry';

test('collapsing navigation preserves the element tree and label instead of remounting a menu', () => {
  for (const item of [NAV_ITEMS[0]!, NAV_ITEMS.find((entry) => entry.children?.length)!]) {
    const render = (collapsed: boolean) =>
      renderToStaticMarkup(
        <NavigationItem
          item={item}
          collapsed={collapsed}
          expanded
          onExpandedChange={() => {}}
          pathname="/"
          search=""
        />,
      );
    const closed = render(true);
    const opened = render(false);
    const tags = (html: string) => [...html.matchAll(/<([a-z][\w-]*)\b/g)].map((match) => match[1]);
    assert.deepEqual(tags(closed), tags(opened));
    assert.ok(closed.includes(item.label));
    assert.match(closed, /class="tmx-sidebar-label" aria-hidden="true"/);
    assert.doesNotMatch(opened, /class="tmx-sidebar-label" aria-hidden="true"/);
    if (item.children?.length) {
      assert.match(closed, /aria-expanded="false"/);
      assert.match(opened, /aria-expanded="true"/);
      assert.match(closed, /tabindex="-1"/);
    }
  }
});

test('reference geometry fits every point and preserves a single scale at different widths', () => {
  assert.equal(formatRevenueTick(0), '0');
  assert.equal(formatRevenueTick(400), '0,4 mil');
  for (const width of [300, 600, 900]) {
    for (const values of [
      [],
      [100],
      Array.from({ length: 24 }, (_, hour) => (hour % 4 ? 15 : 700)),
    ]) {
      const ceiling = hourlyCeiling(values);
      const chart = hourlyGeometry(values, width, 285, ceiling);
      for (const point of chart.points) {
        assert.ok(point.x >= 64 && point.x <= width - 18);
        assert.ok(point.y >= 30 && point.y <= 247);
        assert.ok(Math.abs(((247 - point.y) / 217) * ceiling - point.value) < 1e-8);
        assert.ok(chart.line.includes(`${point.x},${point.y}`));
      }
      assert.equal(chart.points.length, values.length);
    }
  }
});
