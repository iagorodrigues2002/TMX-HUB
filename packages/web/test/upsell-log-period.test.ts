import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UPSELL_LOG_DATE_PRESETS,daysAgoIso,todayIso,currentMonthRange,toIsoDateInTimeZone} from '../src/lib/date-range';

test('provides today, yesterday, last seven days and current month',()=>{
  assert.deepEqual(UPSELL_LOG_DATE_PRESETS.map(p=>p.label),['Hoje','Ontem','Últimos 7 dias','Este mês']);
  const ranges=UPSELL_LOG_DATE_PRESETS.map(p=>p.getRange());
  assert.deepEqual(ranges[0],{from:todayIso(),to:todayIso()});
  assert.deepEqual(ranges[1],{from:daysAgoIso(1),to:daysAgoIso(1)});
  assert.deepEqual(ranges[2],{from:daysAgoIso(6),to:todayIso()});
  assert.deepEqual(ranges[3],currentMonthRange());
});
test('uses Brasília dates at midnight and supports month/year boundaries',()=>{
  assert.equal(toIsoDateInTimeZone('2026-10-16T02:59:59Z'),'2026-10-15');
  assert.equal(toIsoDateInTimeZone('2026-10-16T03:00:00Z'),'2026-10-16');
  assert.equal(daysAgoIso(1,'2026-01-01'),'2025-12-31');
});
test('the report defaults to all offers and keys cached results by the full period',()=>{
  const source=readFileSync(new URL('../src/components/tracking/upsell-operator-logs.tsx',import.meta.url),'utf8');
  assert.match(source,/Todas as ofertas · geral/);
  assert.match(source,/period\.from,period\.to/);
  assert.doesNotMatch(source,/enabled: Boolean\(offerId\)/);
  assert.match(source,/DateRangeFilter/);
});
