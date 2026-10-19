import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpsellOperatorSummary } from '../src/components/tracking/upsell-operator-summary';

const rows = [
  {
    operator_id: 'one',
    operator_name: 'Ana',
    confirmed_purchases: 3,
    amounts: [{ currency: 'BRL', amount_minor: 42000 }],
  },
  {
    operator_id: 'two',
    operator_name: 'Bruno',
    confirmed_purchases: 2,
    amounts: [{ currency: 'BRL', amount_minor: 15000 }],
  },
];
test('renders exactly one body row per person, with count and total', () => {
  const html = renderToStaticMarkup(
    <UpsellOperatorSummary rows={rows} unattributed={[]} isPrivate={false} />,
  );
  const body = html.split('<tbody>')[1].split('</tbody>')[0];
  assert.match(
    html,
    /<section[^>]*overflow-x-auto[^>]*aria-label="Resultados dos upsells por pessoa"[^>]*tabindex="0"/,
  );
  assert.equal((body.match(/<tr /g) || []).length, 2);
  assert.equal((body.match(/Ana/g) || []).length, 1);
  assert.match(html, /420,00/);
  assert.match(html, /150,00/);
  assert.match(html, /Upsells aprovados/);
  assert.match(html, /Valor total dos upsells/);
});
test('groups unmatched purchases into a single row without mixing currencies', () => {
  const html = renderToStaticMarkup(
    <UpsellOperatorSummary
      rows={[]}
      unattributed={[
        { currency: 'USD', amount_minor: 2500, count: 1 },
        { currency: 'EUR', amount_minor: 3500, count: 2 },
      ]}
      isPrivate={false}
    />,
  );
  const body = html.split('<tbody>')[1].split('</tbody>')[0];
  assert.equal((body.match(/<tr /g) || []).length, 1);
  assert.match(html, /Sem operador identificado/);
  assert.match(html, /25,00/);
  assert.match(html, /35,00/);
});
test('keeps approved amounts hidden in privacy mode', () => {
  const html = renderToStaticMarkup(
    <UpsellOperatorSummary rows={rows} unattributed={[]} isPrivate />,
  );
  assert.match(html, /\*\*\*\*/);
  assert.doesNotMatch(html, /420,00|150,00/);
});
test('renders a clear empty state and escapes operator names', () => {
  const html = renderToStaticMarkup(
    <UpsellOperatorSummary rows={[]} unattributed={[]} isPrivate={false} />,
  );
  assert.match(html, /Nenhum resultado registrado/);
  const escaped = renderToStaticMarkup(
    <UpsellOperatorSummary
      rows={[{ ...rows[0], operator_name: '<script>bad</script>' }]}
      unattributed={[]}
      isPrivate={false}
    />,
  );
  assert.doesNotMatch(escaped, /<script>/);
  assert.match(escaped, /&lt;script&gt;/);
});
