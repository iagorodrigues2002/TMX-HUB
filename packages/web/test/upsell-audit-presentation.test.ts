import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {auditMoney, safeUpsellDestination} from '../src/components/tracking/upsell-audit-presentation';

test('audit navigation accepts HTTPS and rejects executable/insecure/credentialed destinations', () => {
  assert.equal(safeUpsellDestination('https://checkout.example/upsell?attempt=abc'), 'https://checkout.example/upsell?attempt=abc');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://checkout.example', '//checkout.example', 'https://user:password@checkout.example']) {
    assert.throws(() => safeUpsellDestination(url));
  }
});
test('audit amounts use minor units and remain isolated by currency and privacy', () => {
  assert.match(auditMoney(1700, 'USD', false), /17,00/);
  assert.match(auditMoney(12417, 'BRL', false), /124,17/);
  assert.equal(auditMoney(12417, 'BRL', true), '****');
  assert.equal(auditMoney(1700, 'USD', true), '****');
  assert.equal(auditMoney(null, 'BRL', false), 'Não disponível');
  assert.equal(auditMoney(1700, null, false), 'Não disponível');
});
test('opening never confirms a purchase and leaves no live direct URL bypass in rendered links', () => {
  const source = readFileSync(new URL('../src/components/tracking/sections/journey/tracking-section-content.tsx', import.meta.url), 'utf8');
  const links = source.slice(source.indexOf('function ValidatedUpsellLink'), source.indexOf('function saoPauloDate'));
  assert.doesNotMatch(links, /Compra confirmada neste upsell/);
  assert.match(links, /compra só é confirmada pelo webhook/);
  assert.equal((links.match(/onClick=\{openAudited\}/g) || []).length, 5);
  assert.doesNotMatch(links, /href=\{(?:link\.|syzeValidation\.|purchasedUrl)/);
  assert.match(links, /popup\.opener = null/);
  assert.match(links, /no-referrer/);
});
