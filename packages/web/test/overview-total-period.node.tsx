import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DateRangeFilter } from '../src/components/ui/date-range-filter';
import { DASHBOARD_DATE_PRESETS } from '../src/lib/date-range';

test('total period includes the TMX launch date and ends on today in São Paulo', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T02:59:59Z') });
  const preset = DASHBOARD_DATE_PRESETS.find((item) => item.id === 'all-time');
  assert.ok(preset, 'the overview exposes the total-period preset');
  assert.deepEqual(preset.getRange(), { from: '2026-07-26', to: '2026-11-02' });

  t.mock.timers.setTime(new Date('2026-11-03T03:00:00Z').valueOf());
  assert.deepEqual(preset.getRange(), { from: '2026-07-26', to: '2026-11-03' });
});

test('total-period selection is visible and preserves the complete date range', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-03T15:00:00Z') });
  const html = renderToStaticMarkup(
    <DateRangeFilter
      value={{ from: '2026-07-26', to: '2026-11-03' }}
      onChange={() => undefined}
      presets={DASHBOARD_DATE_PRESETS}
      max="2026-11-03"
    />,
  );
  const activeButtons = html.match(/<button\b[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g);
  assert.ok(activeButtons);
  assert.equal(activeButtons.length, 1);
  assert.match(activeButtons[0], />Período total<\//);
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  assert.match(inputs[0], /value="2026-07-26"/);
  assert.match(inputs[1], /value="2026-11-03"/);
});
