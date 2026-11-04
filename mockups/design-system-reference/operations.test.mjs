import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoOffers,
  initialJob,
  jobStep,
  offerPage,
  validateDemoFile,
  validateDemoForm,
} from '../../packages/web/src/components/design-system/reference-operations-model.ts';

test('table search/status/sort/pagination compose without mutating source records', () => {
  const before = structuredClone(demoOffers);
  const first = offerPage(demoOffers, '', 'Todas', 'revenue', true, 1);
  const second = offerPage(demoOffers, '', 'Todas', 'revenue', true, 2);
  assert.equal(first.rows.length, 5);
  assert.equal(first.pages, 3);
  assert.ok(first.rows.every((row, i, rows) => i === 0 || rows[i - 1].revenue >= row.revenue));
  assert.ok(!second.rows.some((row) => first.rows.some((other) => other.id === row.id)));
  const match = offerPage(demoOffers, ' demo-003 ', 'Ativa', 'name', false, 20);
  assert.equal(match.rows[0].name, 'Horizon');
  assert.equal(match.page, 1);
  assert.equal(offerPage(demoOffers, 'inexistente', 'Todas', 'name', false, 4).total, 0);
  assert.deepEqual(demoOffers, before);
});

test('form rejects invalid dates, unsafe URL scheme, currency and invalid optional files', () => {
  const valid = {
    name: 'Aurora',
    url: 'https://exemplo.com',
    notes: '',
    from: '2026-11-01',
    to: '2026-11-03',
    currency: 'BRL',
  };
  assert.deepEqual(validateDemoForm(valid), {});
  assert.ok(
    validateDemoForm({
      ...valid,
      name: ' ',
      url: 'javascript:alert(1)',
      notes: 'a'.repeat(1001),
      from: '2026-02-31',
      currency: '???',
    }).name,
  );
  assert.ok(validateDemoForm({ ...valid, from: '2026-02-31' }).from);
  assert.ok(validateDemoForm({ ...valid, from: '2026-11-05' }).from);
  assert.ok(validateDemoForm({ ...valid, url: 'javascript:alert(1)' }).url);
  assert.ok(validateDemoForm({ ...valid, currency: '???' }).currency);
  assert.equal(validateDemoFile(null), '');
  assert.equal(validateDemoFile({ name: 'EXEMPLO.CSV', size: 20 }), '');
  assert.ok(validateDemoFile({ name: 'arquivo.exe', size: 20 }));
  assert.ok(validateDemoFile({ name: 'arquivo.csv', size: 0 }));
  assert.ok(validateDemoFile({ name: 'arquivo.csv', size: 2 * 1024 * 1024 + 1 }));
});

test('job cannot duplicate start, retry a successful job or continue after cancel', () => {
  let state = jobStep(initialJob, 'start');
  assert.equal(state.phase, 'queued');
  assert.equal(jobStep(state, 'start'), state);
  for (let i = 0; i < 6; i++) state = jobStep(state, 'tick');
  assert.equal(state.phase, 'partial');
  assert.equal(state.progress, 100);
  state = jobStep(state, 'retry');
  assert.equal(state.progress, 85);
  state = jobStep(jobStep(state, 'tick'), 'tick');
  assert.equal(state.phase, 'ready');
  assert.equal(jobStep(state, 'retry'), state);
  state = jobStep(jobStep(state, 'start'), 'cancel');
  assert.equal(state.phase, 'cancelled');
  assert.equal(jobStep(state, 'tick'), state);
  assert.deepEqual(jobStep(state, 'reset'), initialJob);
});
