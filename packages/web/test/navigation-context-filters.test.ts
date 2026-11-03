import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveOfferContextId } from '../src/lib/offer-context-selection';
import {
  refundCompanyHref,
  refundOfferFilters,
  refundReportHref,
  refundRouteFilters,
} from '../src/lib/refunds-navigation';
import { taskManagementHref } from '../src/lib/task-dashboard';

const period = { from: '2026-10-01', to: '2026-10-31' };
const search = (value = '') => new URLSearchParams(value);

test('calls deep link preserves unrelated filters and supports either selected tab', () => {
  const initial = 'person=fixture-person&status=progress&offer=fixture-offer';
  const calls = new URL(taskManagementHref(initial, 'calls'), 'https://fixture.invalid');
  assert.equal(calls.pathname, '/tarefas');
  assert.equal(calls.searchParams.get('tab'), 'calls');
  assert.equal(calls.searchParams.get('person'), 'fixture-person');
  assert.equal(calls.searchParams.get('status'), 'progress');
  assert.equal(calls.searchParams.get('offer'), 'fixture-offer');
  const tasks = new URL(taskManagementHref(calls.search, 'tasks'), calls);
  assert.equal(tasks.searchParams.get('tab'), 'tasks');
  assert.equal(tasks.searchParams.getAll('tab').length, 1);
  assert.equal(tasks.searchParams.get('person'), 'fixture-person');
});

test('refund links retain selected period and canonicalize the legacy offer alias', () => {
  const href = refundReportHref('offer-b', period, 'offer_id=offer-a&gateway=syzepay&tab=audit');
  const url = new URL(href, 'https://fixture.invalid');
  assert.equal(url.pathname, '/reembolsos');
  assert.equal(url.searchParams.get('offer'), 'offer-b');
  assert.equal(url.searchParams.has('offer_id'), false);
  assert.equal(url.searchParams.get('gateway'), 'syzepay');
  assert.equal(url.searchParams.get('tab'), 'audit');
  assert.deepEqual(refundRouteFilters(url.searchParams, period), { offerId: 'offer-b', ...period });
});

test('changing refund company clears the previous offer and product but preserves dates and view', () => {
  const url = new URL(
    refundCompanyHref(
      'company-b',
      period,
      'company_id=company-a&offer=old&offer_id=older&product=old&sales_view=natural',
    ),
    'https://fixture.invalid',
  );
  assert.equal(url.searchParams.get('company_id'), 'company-b');
  assert.equal(url.searchParams.get('offer'), '');
  assert.equal(url.searchParams.has('offer_id'), false);
  assert.equal(url.searchParams.has('product'), false);
  assert.equal(url.searchParams.get('sales_view'), 'natural');
  assert.equal(url.searchParams.get('from'), period.from);
  assert.equal(url.searchParams.get('to'), period.to);
  const offer = new URL(
    refundReportHref('offer-b', period, url.searchParams.toString()),
    'https://fixture.invalid',
  );
  assert.equal(offer.searchParams.get('company_id'), 'company-b');
});

test('refund route is the single source for aliases, empty aggregate and date ranges', () => {
  assert.deepEqual(refundRouteFilters(search('offer_id=old'), period), {
    offerId: 'old',
    ...period,
  });
  assert.equal(refundRouteFilters(search('offer=new&offer_id=old'), period).offerId, 'new');
  assert.equal(refundRouteFilters(search('offer=&offer_id=old'), period).offerId, '');
  assert.equal(refundRouteFilters(search(), period).offerId, '');
  const custom = { from: '2026-09-10', to: '2026-09-14' };
  assert.deepEqual(refundRouteFilters(search(`from=${custom.from}&to=${custom.to}`), period), {
    offerId: '',
    ...custom,
  });
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'from=not-a-date&to=2026-10-31',
    'from=2026-11-03&to=2026-11-01',
    'from=2026-10-02',
  ]) {
    assert.deepEqual(refundRouteFilters(search(query), period), { offerId: '', ...period });
  }
});

test('topbar refunds aggregate never falls back to a stored or first offer', () => {
  const ids = ['offer-a', 'offer-b'];
  for (const query of ['', 'offer=', 'offer=&offer_id=offer-b']) {
    assert.equal(resolveOfferContextId('/reembolsos', search(query), ids, 'offer-a'), '');
  }
  assert.equal(
    resolveOfferContextId('/reembolsos', search('offer_id=offer-b'), ids, 'offer-a'),
    'offer-b',
  );
  assert.equal(
    resolveOfferContextId('/reembolsos', search('offer=offer-b'), ids, 'offer-a'),
    'offer-b',
  );
  // An invalid or forbidden deep link must be rejected by the API, not silently display another offer.
  assert.equal(
    resolveOfferContextId('/reembolsos', search('offer=forbidden'), ids, 'offer-a'),
    'forbidden',
  );
  assert.equal(resolveOfferContextId('/tracking', search(), ids, 'offer-b'), 'offer-b');
  assert.equal(
    resolveOfferContextId('/ofertas/offer-b', search('offer=offer-a'), ids, ''),
    'offer-b',
  );
  assert.equal(resolveOfferContextId('/tracking', search(), ids, 'missing'), 'offer-a');
});

test('offer changes reset dependent product and pagination before the next report request', () => {
  const current = { offerId: 'offer-a', product: 'Upsell antigo', page: 4 };
  assert.equal(refundOfferFilters(current, 'offer-a'), current);
  const next = refundOfferFilters(current, 'offer-b');
  assert.deepEqual(next, { offerId: 'offer-b', product: '', page: 1 });
  assert.deepEqual(refundOfferFilters(next, ''), { offerId: '', product: '', page: 1 });
  assert.deepEqual(refundOfferFilters(next, 'offer-a'), {
    offerId: 'offer-a',
    product: '',
    page: 1,
  });
});

test('route components use URL state without remounting dashboards or widening route permissions', () => {
  const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const tasks = read('components/tasks/task-management-page.tsx');
  assert.match(tasks, /searchParams\.get\('tab'\) === 'calls'/);
  assert.match(tasks, /router\.push\(taskManagementHref/);
  assert.match(tasks, /scroll: false/);
  assert.doesNotMatch(tasks, /useState.*tasks|<TaskDashboard key=\{tab\}/);
  assert.match(tasks, /key=\{`tasks:\$\{companyId\}`\}/);
  const refunds = read('components/tracking/refunds-dashboard-use-refunds-dashboard-state.tsx');
  assert.match(refunds, /refundRouteFilters\(searchParams, defaultRange\)/);
  assert.ok(
    refunds.indexOf('refundOfferFilters(offerFilters, offerScopeKey)') <
      refunds.indexOf('const report = useQuery'),
  );
  assert.doesNotMatch(refunds, /setProvider\(/);
  assert.doesNotMatch(refunds, /setVendepay\(/);
  assert.match(read('app/reembolsos/page.tsx'), /<ToolGuard tool="ofertas">/);
  assert.doesNotMatch(read('app/reembolsos/page.tsx'), /<RefundsDashboard key=/);
  assert.match(
    read('components/tracking/refunds-dashboard.tsx'),
    /refundReportHref\(offerId, \{ from, to \}\)/,
  );
});
