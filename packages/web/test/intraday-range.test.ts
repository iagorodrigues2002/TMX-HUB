import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  INTRADAY_MAX_RANGE_DAYS,
  INTRADAY_RANGE_LIMIT_MESSAGE,
  supportsIntradayRange,
} from '../src/lib/intraday-range';

test('legacy intraday accepts one through 60 inclusive calendar days', () => {
  assert.equal(INTRADAY_MAX_RANGE_DAYS, 60);
  assert.equal(supportsIntradayRange({ from: '2026-11-03', to: '2026-11-03' }), true);
  assert.equal(supportsIntradayRange({ from: '2026-09-05', to: '2026-11-03' }), true);
  assert.equal(supportsIntradayRange({ from: '2026-09-04', to: '2026-11-03' }), false);
});

test('total period does not expand the bounded snapshot API', () => {
  assert.equal(supportsIntradayRange({ from: '2026-07-26', to: '2026-11-03' }), false);
  assert.match(INTRADAY_RANGE_LIMIT_MESSAGE, /60 dias/);
  assert.match(
    INTRADAY_RANGE_LIMIT_MESSAGE,
    /totais e a Receita por hora mantêm o período completo/,
  );
});

test('invalid, reversed and normalized-invalid dates are not requested', () => {
  for (const range of [
    { from: '2026-11-04', to: '2026-11-03' },
    { from: '2026-02-30', to: '2026-03-05' },
    { from: '', to: '2026-11-03' },
    { from: '2026-1-01', to: '2026-01-31' },
  ])
    assert.equal(supportsIntradayRange(range), false);
});

test('both callers guard requests; overview excludes disabled queries from refresh and loading', () => {
  const overview = readFileSync('src/components/overview/overview-dashboard.tsx', 'utf8');
  const detail = readFileSync('src/app/ofertas/[id]/page-use-oferta-detail-page-state.tsx', 'utf8');
  assert.match(
    overview,
    /const intradayEnabled = salesView === 'general' && supportsIntradayRange\(period\)/,
  );
  assert.match(overview, /enabled: intradayEnabled/);
  assert.match(overview, /\.\.\.\(intradayEnabled \? intradayQueries : \[\]\)/);
  assert.match(overview, /intradayUnavailableReason:/);
  assert.match(detail, /enabled: Boolean\(offer\?\.utmifyConfigured\) && intradayRangeSupported/);
  assert.match(detail, /const intraday = intradayRangeSupported \? intradayQuery.data : undefined/);
});
