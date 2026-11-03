import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RefundMonthImpact } from '../src/components/tracking/refunds-month-impact';

const amounts = {
  count: 2,
  brl_minor: 30000,
  fee_brl_minor: 5000,
  impact_brl_minor: 35000,
  missing_brl_orders: 0,
  missing_fee_orders: 0,
  sales: 10,
  gross_brl_minor: 1000000,
  rate_pct: 3,
  impact_pct: 3.5,
};
const monthOrigin = {
  basis: 'first_confirmed_receipt' as const,
  timezone: 'America/Sao_Paulo' as const,
  months: [
    {
      month: '2026-11',
      from: '2026-11-01',
      to: '2026-11-03',
      partial_month: true,
      gross_brl_minor: 1000000,
      missing_gross_orders: 0,
      total: { ...amounts, count: 4, brl_minor: 50000, impact_brl_minor: 55000 },
      groups: [
        {
          ...amounts,
          key: 'previous_month' as const,
          purchase_month: '2026-10',
          share_pct: 60,
          refund_pct: 3,
          impact_pct: 3.5,
        },
        {
          ...amounts,
          count: 2,
          brl_minor: 20000,
          fee_brl_minor: 0,
          impact_brl_minor: 20000,
          key: 'unknown' as const,
          purchase_month: null,
          share_pct: 40,
          refund_pct: 2,
          impact_pct: 2,
        },
      ],
    },
  ],
};

test('month impact distinguishes previous purchase month, refund share and impact with fees', () => {
  const html = renderToStaticMarkup(<RefundMonthImpact data={monthOrigin} isPrivate={false} />);
  assert.match(html, /outubro de 2026/);
  assert.match(html, /novembro de 2026/);
  assert.match(html, /60%/);
  assert.match(html, /3,5%/);
  assert.match(html, /300,00/);
  assert.match(html, /350,00/);
  assert.match(html, /Mês parcial/);
  assert.match(html, /01\/11\/2026 a 03\/11\/2026/);
  assert.match(html, /Data da compra não identificada/);
  assert.match(html, /Sem multas.*3%/s);
});

test('private mode hides money, percentages and visual proportions', () => {
  const html = renderToStaticMarkup(<RefundMonthImpact data={monthOrigin} isPrivate />);
  assert.match(html, /\*\*\*\*/);
  assert.doesNotMatch(html, /300,00|350,00|60%|40%|3,5%|width:/);
});

test('missing API contract and empty period do not fabricate previous-month totals', () => {
  const unavailable = renderToStaticMarkup(<RefundMonthImpact isPrivate={false} />);
  assert.match(unavailable, /Cruzamento mensal indisponível/);
  assert.doesNotMatch(unavailable, /R\$/);
  const empty = renderToStaticMarkup(
    <RefundMonthImpact data={{ ...monthOrigin, months: [] }} isPrivate={false} />,
  );
  assert.match(empty, /Nenhum mês disponível/);
});

test('incomplete amounts keep known values but percentages remain unavailable', () => {
  const data = {
    ...monthOrigin,
    months: [
      {
        ...monthOrigin.months[0]!,
        total: { ...amounts, missing_brl_orders: 1 },
        groups: [
          {
            ...monthOrigin.months[0]!.groups[0]!,
            missing_brl_orders: 1,
            share_pct: null,
            refund_pct: null,
            impact_pct: null,
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(<RefundMonthImpact data={data} isPrivate={false} />);
  assert.match(html, /Valores parciais/);
  assert.match(html, /300,00/);
  assert.match(html, /—/);
  assert.doesNotMatch(html, /60%|3,5%|width:/);
});

test('missing revenue conversion does not hide complete refund shares', () => {
  const data = {
    ...monthOrigin,
    months: [
      {
        ...monthOrigin.months[0]!,
        missing_gross_orders: 1,
        total: { ...monthOrigin.months[0]!.total, missing_brl_orders: 1 },
        groups: monthOrigin.months[0]!.groups.map((group) => ({
          ...group,
          refund_pct: null,
          impact_pct: null,
        })),
      },
    ],
  };
  const html = renderToStaticMarkup(<RefundMonthImpact data={data} isPrivate={false} />);
  assert.match(html, /60%/);
  assert.match(html, /width:60%/);
  assert.match(html, /0 devoluções sem conversão BRL/);
  assert.match(html, /1 vendas sem conversão BRL/);
  assert.doesNotMatch(html, /3,5%/);
});
