import { expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import { aiDataSchema, buildAiContext } from '../src/services/ai-preview-model.js';
import { questionContext, questionScope } from '../src/services/ai-question-context.js';
import { learnedPatterns, learnOptimizationOutcomes } from '../src/services/ai-optimization-learning.js';
const now = new Date('2026-11-12T18:00:00Z');
const question = 'quero que voce olhe mes passado e esse mes e faca a media diaria dos reembolso e veja se hoje está dentro disso';
function fixture() {
  return aiDataSchema.parse({ companyId: '00000000-0000-4000-8000-000000000001', fetchedAt: now.toISOString(),
    offers: [{ id: 'allowed', name: 'PJR_ENG' }],
    snapshot: { from: '2026-08-01', to: '2026-11-12', fetchedAt: now.toISOString(), accounts: [], campaigns: [], insights: [], failures: [] },
    sales: [], optimizations: [], classification: { campaigns: {}, links: {} },
    exchangeRates: { USD: { rate: 5, fetchedAt: now.toISOString() }, PEN: { rate: 1.5, fetchedAt: now.toISOString() } },
    reversals: [
      { offer_id: 'allowed', date: '2026-10-01', currency: 'USD', kind: 'refund', count: 2, amount_minor: '2000' },
      { offer_id: 'allowed', date: '2026-10-02', currency: 'PEN', kind: 'refund', count: 1, amount_minor: '2000' },
      { offer_id: 'allowed', date: '2026-11-01', currency: 'BRL', kind: 'refund', count: 1, amount_minor: '11000' },
      { offer_id: 'allowed', date: '2026-11-12', currency: 'USD', kind: 'refund', count: 1, amount_minor: '3000' },
      { offer_id: 'foreign', date: '2026-11-12', currency: 'USD', kind: 'refund', count: 999, amount_minor: '9999999' },
    ] });
}
function context(raw = fixture(), allowed = true) {
  return { ...buildAiContext(raw, questionScope(question, now)!), learning: [], permissionNotice: '',
    availableAreas: { media: true, sales: true, upsells: true, reversals: allowed, optimizations: true } };
}
it('resolves both months from natural language, including year boundaries', () => {
  expect(questionScope(question, now)).toMatchObject({ from: '2026-10-01', to: '2026-11-12' });
  expect(questionScope('veja se hoje estamos dentro da média de reembolsos. olhe o mes passado e olhe esse e me fale.', now)).toMatchObject({ from: '2026-10-01', to: '2026-11-12' });
  expect(questionScope('mês passado', new Date('2027-01-10T15:00:00Z'))).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
  expect(questionScope('analise a campanha PJR_ENG AD14')).toBeUndefined();
});
it('consolidates every authorized currency and counts zero-record calendar days', () => {
  const raw = fixture(), d = questionContext(raw, context(raw), question, now);
  expect(d.rows).toEqual([]);
  expect(d.reversalAnalysis?.refund.previousMonth).toMatchObject({ days: 31, count: 3, amountMinor: 13000, averageDailyAmountMinor: 13000 / 31 });
  expect(d.reversalAnalysis?.refund.currentMonthClosedDays).toMatchObject({ days: 11, amountMinor: 11000, averageDailyAmountMinor: 1000 });
  expect(d.reversalAnalysis?.refund.today.amountMinor).toBe(15000);
  expect(questionContext(raw, context(raw), question + ' em dólar', now).reversalAnalysis?.refund.today.amountMinor).toBe(3000);
  expect(JSON.stringify(d.reversalAnalysis)).not.toContain('9999999');
});
it('does not turn missing rates into zero or expose reversals without permission', () => {
  const raw = fixture(); delete raw.exchangeRates!.PEN;
  expect(questionContext(raw, context(raw), question, now).reversalAnalysis?.refund.previousMonth).toMatchObject({ amountMinor: null, missingCurrencies: ['PEN'] });
  expect(questionContext(raw, context(raw, false), question, now).reversalAnalysis).toBeNull();
});
it('includes chargebacks in the general TMX reversal comparison without relabeling them', () => {
  const raw = fixture();
  raw.reversals.push({ offer_id: 'allowed', date: '2026-11-12', currency: 'USD', kind: 'chargeback', count: 2, amount_minor: '4000' });
  const d = questionContext(raw, context(raw), question, now).reversalAnalysis!;
  expect(d.combined.today).toMatchObject({ count: 3, amountMinor: 35000 });
  expect(d.refund.today.count).toBe(1);
  expect(d.chargeback.today.count).toBe(2);
  expect(d.reportingDate).toBe('2026-11-12');
  expect(d.timeZone).toBe('America/Sao_Paulo');
});
it('preserves values in compact metrics and excludes internal finance', () => {
  const raw = fixture(), c = context(raw);
  c.rows = [{ id: 'test', name: 'campaign', unavailable: false, missingMetrics: [], metrics: { spend: 20, metaRoas: 1.5, reserve: 999, fees: 888 } as any }];
  const d = questionContext(raw, c, 'analise a campanha', now);
  expect(d.metricColumns).toEqual(['spend', 'metaRoas']);
  expect(d.rows[0]?.metrics).toEqual([20, 1.5]);
});
it('converts daily sales per offer, preserves kind and enforces upsell-only access', () => {
  const raw = fixture();
  raw.sales = [
    { offer_id: 'allowed', date: '2026-11-12', currency: 'USD', order_kind: 'front', count: 2, gross_minor: '2000' },
    { offer_id: 'allowed', date: '2026-11-12', currency: 'PEN', order_kind: 'upsell_1', count: 1, gross_minor: '2000' },
    { offer_id: 'allowed', date: '2026-11-11', currency: 'BRL', order_kind: 'front', count: 1, gross_minor: '99999' },
    { offer_id: 'foreign', date: '2026-11-12', currency: 'BRL', order_kind: 'front', count: 1, gross_minor: '99999' },
  ];
  const c = context(raw); c.scope = { ...c.scope, from: '2026-11-12' };
  const d = questionContext(raw, c, 'faturamento de hoje por oferta', now).salesAnalysis!;
  expect(d.total).toMatchObject({ count: 3, amountMinor: 13000 });
  expect(d.byOffer[0]).toMatchObject({ name: 'PJR_ENG', amountMinor: 13000 });
  expect(d.dailyByOffer).toEqual([{ date: '2026-11-12', offerId: 'allowed', count: 3, amountMinor: 13000, missingCurrencies: [] }]);
  expect(questionContext(raw, c, 'em USD', now).salesAnalysis!.total.amountMinor).toBe(2600);
  c.availableAreas.sales = false;
  expect(questionContext(raw, c, 'faturamento', now).salesAnalysis!.total).toMatchObject({ count: 1, amountMinor: 3000 });
  c.availableAreas.upsells = false;
  expect(questionContext(raw, c, 'faturamento', now).salesAnalysis).toBeNull();
});
it('learned evidence accumulates without double-counting retries or hiding contrary cases', () => {
  const observation = { eventId: 'one', offerId: 'allowed', action: 'increase_budget' as const, at: now.toISOString(), observedAt: now.toISOString(), beforeRoas: 1, afterRoas: 2, beforeSpend: 100, afterSpend: 200 };
  const result = learnedPatterns([observation, observation, { ...observation, eventId: 'two', afterRoas: .5 }, { ...observation, eventId: 'three', afterRoas: 1.5 }]);
  expect(result[0]).toMatchObject({ cases: 3, improved: 2, worsened: 1, evidence: 'observational_pattern' });
  expect(result[0]?.averageRoasChange).toBe(1 / 3);
});
it('learns only mature observations with complete data and a confirmed offer', () => {
  const raw = fixture();
  raw.optimizations = [{ id: 'event', at: '2026-11-05T12:00:00Z', actorId: 'private', level: 'campaigns', itemId: '123456', name: 'PJR_ENG_AD1', accountId: 'act_123456', currency: 'BRL', budgetField: 'daily_budget', before: { status: 'ACTIVE', budget: 10000 }, after: { status: 'ACTIVE', budget: 20000 } }];
  raw.snapshot.accounts = [{ id: 'act_123456', name: 'test', businessId: null, businessName: null, currency: 'BRL', timezone: 'America/Sao_Paulo' }];
  raw.snapshot.campaigns = [{ id: '123456', name: 'PJR_ENG_AD1', accountId: 'act_123456', status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: 'OUTCOME_SALES', createdAt: null, updatedAt: null }];
  raw.snapshot.insights = [2,3,4,6,7,8].map(n => ({ campaignId: '123456', accountId: 'act_123456', date: `2026-11-${String(n).padStart(2,'0')}`, currency: 'BRL', spend: '100', impressions: '1000', linkClicks: '10', actions: [{ action_type: 'purchase', value: '1' }], actionValues: [{ action_type: 'purchase', value: n < 5 ? '100' : '200' }] }));
  expect(learnOptimizationOutcomes(raw, now)).toMatchObject([{ offerId: 'allowed', action: 'increase_budget', beforeRoas: 1, afterRoas: 2 }]);
  expect(learnOptimizationOutcomes(raw, new Date('2026-11-06T12:00:00Z'))).toEqual([]);
  raw.snapshot.failures = [{ accountId: 'act_123456', stage: 'insights', code: 1 }];
  expect(learnOptimizationOutcomes(raw, now)).toEqual([]);
});
