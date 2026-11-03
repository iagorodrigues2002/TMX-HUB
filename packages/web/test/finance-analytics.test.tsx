import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinanceAnalyticsView } from '../src/components/overview/finance-analytics';
import {
  type FinanceDay,
  availableFinanceBalance,
  financeGrowth,
  financeMonth,
  previousFinanceMonth,
} from '../src/lib/finance-analytics';

const days: FinanceDay[] = [
  {
    day: '2026-11-01',
    currency: 'USD',
    incoming: '100',
    outgoing: '20',
    transactions: 2,
    excluded: 0,
    fixed: '20',
  },
  {
    day: '2026-11-02',
    currency: 'USD',
    incoming: '50',
    outgoing: '10',
    transactions: 2,
    excluded: 0,
    withdrawals: '10',
  },
  {
    day: '2026-11-02',
    currency: 'BRL',
    incoming: '500',
    outgoing: '0',
    transactions: 1,
    excluded: 0,
  },
  {
    day: '2026-10-03',
    currency: 'USD',
    incoming: '900',
    outgoing: '0',
    transactions: 1,
    excluded: 0,
  },
];
test('monthly cash flow keeps currencies, exact period and categories separate', () => {
  assert.deepEqual(financeMonth(days, '2026-11', 'USD'), {
    incoming: 150,
    outgoing: 30,
    net: 120,
    transactions: 4,
    fixed: 20,
    variable: 0,
    withdrawals: 10,
  });
  assert.equal(financeMonth(days, '2026-10', 'USD', 2).incoming, 0);
  assert.equal(previousFinanceMonth('2026-01'), '2025-12');
  assert.equal(financeGrowth(150, 100), 50);
  assert.equal(financeGrowth(150, 0), null);
});
test('available balance excludes reserves and duplicated portfolio and converts both directions', () => {
  const balance = (id: string, amount: string, label: string, currency = 'USD') => ({
    id,
    amount,
    label,
    currency,
    stale: false,
    at: '2026-11-03T12:00:00Z',
  });
  const accounts = [
    {
      provider: 'wise',
      status: 'ready',
      balances: [
        balance('1', '100', 'Saldo em conta'),
        balance('2', '50', 'Reserva Wise'),
        balance('3', '250', 'Saldo em conta', 'BRL'),
      ],
    },
    {
      provider: 'lootrush',
      status: 'ready',
      balances: [
        balance('available', '200', 'Stablecoins'),
        balance('portfolio', '900', 'Patrimônio'),
      ],
    },
  ];
  assert.deepEqual(
    availableFinanceBalance(accounts, [{ currency: 'USD', rate: '5', fetched_at: '2026-11-03' }]),
    { brl: 1750, usd: 350, unavailable: 0, stale: false, count: 3 },
  );
  assert.equal(availableFinanceBalance(accounts, []).unavailable, 2);
});
test('private charts never expose numbers through SVG, titles or tables', () => {
  const html = renderToStaticMarkup(
    <FinanceAnalyticsView
      days={days}
      month="2026-11"
      today="2026-11-03"
      chosenCurrency="USD"
      setCurrency={() => {}}
      setMonth={() => {}}
      growth={false}
      isPrivate
    />,
  );
  assert.doesNotMatch(html, /<polyline|<circle|150,00|120,00|100,00/);
  assert.match(html, /Valores financeiros ocultos/);
});
test('error state does not substitute missing history with zero metrics', () => {
  const html = renderToStaticMarkup(
    <FinanceAnalyticsView
      days={[]}
      month="2026-11"
      today="2026-11-03"
      chosenCurrency="USD"
      setCurrency={() => {}}
      setMonth={() => {}}
      growth
      isPrivate={false}
      failed
    />,
  );
  assert.match(html, /Consulta financeira indisponível/);
  assert.doesNotMatch(html, /0,00|Entradas projetadas/);
});
