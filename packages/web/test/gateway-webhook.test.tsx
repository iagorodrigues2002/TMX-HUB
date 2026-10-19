import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GatewayCard } from '../src/components/tracking/sections/finance/gateway-card';
import type { GatewayAccount } from '../src/components/tracking/sections/finance/gateway-registry';

const account: GatewayAccount = {
  id: 'account-a',
  provider: 'vendepay',
  name: 'Conta de teste',
  enabled: true,
  apiKeyConfigured: false,
  secretConfigured: true,
  lastWebhookAt: null,
  settings: {},
};
test('existing VendePay account exposes webhook recovery without rotating on render', () => {
  const html = renderToStaticMarkup(
    <GatewayCard
      offerId="offer-a"
      provider="vendepay"
      accounts={[account]}
      canManage
      onSave={async () => ({})}
    />,
  );
  assert.match(html, /Gerar nova URL do webhook/);
  assert.match(html, /invalida a URL anterior/);
});
test('non-managers cannot see webhook rotation controls', () => {
  const html = renderToStaticMarkup(
    <GatewayCard
      offerId="offer-a"
      provider="vendepay"
      accounts={[account]}
      canManage={false}
      onSave={async () => ({})}
    />,
  );
  assert.doesNotMatch(html, /Gerar nova URL do webhook/);
});
