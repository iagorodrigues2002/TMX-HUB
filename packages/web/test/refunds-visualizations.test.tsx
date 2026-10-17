import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RefundAnalytics,
  RefundDelay,
  type RefundReport,
  RefundTrend,
  refundMoney,
  refundPercent,
} from '../src/components/tracking/refunds-visualizations';
const totals = {
  count: 2,
  brl_minor: 12543,
  gross_brl_minor: 100000,
  sales: 10,
  rate_pct: 12.543,
  impact_brl_minor: 15043,
  impact_pct: 15.043,
  fee_brl_minor: 2500,
  missing_brl_orders: 0,
  missing_fee_orders: 0,
};
const row = { key: 'offer', label: 'PJR_ENG', ...totals };
test('delay distribution shows sample percentages and hides the distribution in private mode', () => {
  const delay = {
    mean_days: 10, median_days: 8, sample_count: 4,
    buckets: [{ label: '0–6 dias', count: 1 }, { label: '7–14 dias', count: 3 }],
  };
  const html = renderToStaticMarkup(<RefundDelay delay={delay} isPrivate={false} />);
  assert.match(html, /25%/);
  assert.match(html, /75%/);
  assert.match(html, /<ul/);
  const privateHtml = renderToStaticMarkup(<RefundDelay delay={delay} isPrivate />);
  assert.doesNotMatch(privateHtml, /25%|75%|width:/);
  assert.match(privateHtml, /Distribuição oculta/);
});
test('delay empty state never fabricates a zero-day mean', () => {
  const html = renderToStaticMarkup(<RefundDelay delay={{
    mean_days: null, median_days: null, sample_count: 0,
    missing_paid_at: 2, buckets: [{ label: '0–6 dias', count: 0 }],
  }} isPrivate={false} />);
  assert.match(html, /Sem intervalo válido/);
  assert.match(html, /permanecem no resumo financeiro/);
  assert.doesNotMatch(html, />0 dias</);
});
const fixture = {
  from: '2026-09-01',
  to: '2026-09-30',
  time_zone: 'America/Sao_Paulo',
  providers: ['vendepay'],
  items_limit: 500,
  totals,
  trend: [{ date: '2026-09-01', ...totals, moving_average_brl_minor: 12543 }],
  comparison: {
    previous_from: '2026-08-02',
    previous_to: '2026-08-31',
    previous: totals,
    amount_change_pct: -20,
    rate_change_pp: -2.5,
  },
  cohorts: [{ month: '2026-09', ...totals, immature: true }],
  rankings: { offers: [row], gateways: [row], products: [row] },
  delay: { mean_days: 12, median_days: 8, buckets: [{ label: '0–6 dias', count: 2 }] },
  offers: [],
  products: [],
  vendepays: [],
  daily: [],
  items: [],
} satisfies RefundReport;
test('uses first webhook receipt as the primary delay metric', () => {
  const data = {
    ...fixture,
    delay: { mean_days: 45, median_days: 45, sample_count: 2, buckets: [{ label: '31–60 dias', count: 2 }] },
    observed_delay: { mean_days: 45, median_days: 45, sample_count: 2, buckets: [{ label: '31–60 dias', count: 2 }] },
  };
  const html = renderToStaticMarkup(<RefundAnalytics data={data} isPrivate={false} interval="day" onIntervalChange={() => {}} />);
  assert.match(html, /Data do primeiro recebimento do webhook/);
  assert.match(html, /não a data contida no payload/);
  assert.match(html, /45 dias/);
  assert.match(html, /notificações com intervalo válido/);
  const hidden = renderToStaticMarkup(<RefundAnalytics data={data} isPrivate interval="day" onIntervalChange={() => {}} />);
  assert.doesNotMatch(hidden, /45 dias|width:/);
});
test('renders all five recommendations and unified reversal metrics with fines', () => {
  const html = renderToStaticMarkup(
    <RefundAnalytics data={fixture} isPrivate={false} interval="day" onIntervalChange={() => {}} />,
  );
  for (const title of [
    'Comparação com o período anterior',
    'Evolução das devoluções',
    'Devoluções por mês da compra',
    'Onde estão as devoluções',
    'Tempo entre compra e devolução',
  ])
    assert.ok(html.includes(title), title);
  assert.match(html, /125,43/);
  assert.match(html, /150,43/);
  assert.match(html, /12,54%/);
  assert.match(html, /Em maturação/);
  assert.match(html, /-2,5 p.p./);
  assert.match(html, /Média móvel \(7 dias\)/);
  assert.doesNotMatch(html, />Reembolsos<|>Chargebacks</);
  assert.match(html, /Compras do intervalo selecionado/);
});
test('privacy masks money, percentages and SVG financial data', () => {
  const html = renderToStaticMarkup(
    <RefundAnalytics data={fixture} isPrivate interval="day" onIntervalChange={() => {}} />,
  );
  assert.match(html, /\*\*\*\*/);
  assert.doesNotMatch(html, /125,43|150,43|12,54|<svg|Diminuiu/);
});
test('empty and zero denominator remain explicit, without fabricated FX or percentages', () => {
  assert.equal(refundPercent(null, false), '—');
  assert.equal(refundMoney(undefined, false), '—');
  assert.match(refundMoney(50000, false), /500,00/);
  const html = renderToStaticMarkup(<RefundTrend points={[]} isPrivate={false} interval="month" />);
  assert.match(html, /Nenhum dado/);
});
test('table alternative and delay chart retain keyboard-friendly semantic content', () => {
  const html = renderToStaticMarkup(
    <RefundTrend points={fixture.trend} isPrivate={false} interval="week" />,
  );
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
  assert.match(html, /7 semanas/);
  assert.match(html, /<title/);
  const delay = renderToStaticMarkup(<RefundDelay delay={fixture.delay} isPrivate={false} />);
  assert.match(delay, /Tempo médio/);
  assert.match(delay, /Mediana/);
  assert.match(delay, /12 dias/);
});
test('partial totals are visibly flagged and missing ratios remain blank', () => {
  const data = {
    ...fixture,
    totals: {
      ...totals,
      missing_brl_orders: 1,
      missing_fee_orders: 2,
      rate_pct: null,
      impact_pct: null,
    },
  };
  const html = renderToStaticMarkup(
    <RefundAnalytics data={data} isPrivate={false} interval="day" onIntervalChange={() => {}} />,
  );
  assert.match(html, /Total parcial/);
  assert.match(html, /— do faturamento/);
});
