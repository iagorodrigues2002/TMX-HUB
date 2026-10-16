import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {auditMoney, safeUpsellDestination, upsellLastOpeningLabel} from '../src/components/tracking/upsell-audit-presentation';

test('last opening identifies the actual operator and uses Brasília time regardless of host timezone', () => {
  assert.equal(upsellLastOpeningLabel(null), 'Sem clique registrado');
  assert.equal(upsellLastOpeningLabel(undefined), 'Sem clique registrado');
  const opening = {operator_id: 'member-123', operator_name: '  Ana  ', opened_at: '2026-10-16T15:04:05Z'};
  assert.equal(upsellLastOpeningLabel(opening), 'Último clique: Ana · 16/10/2026, 12:04:05');
  assert.match(upsellLastOpeningLabel({...opening, operator_name: null}), /^Último clique: member-123 ·/);
  assert.match(upsellLastOpeningLabel({...opening, operator_name: ' ', opened_at: 'invalid'}), /member-123 · horário indisponível$/);
});

test('last opening persists in purchased, validating and unavailable branches without claiming purchase attribution', () => {
  const source = readFileSync(new URL('../src/components/tracking/sections/journey/tracking-section-content.tsx', import.meta.url), 'utf8');
  const links = source.slice(source.indexOf('function ValidatedUpsellLink'), source.indexOf('function saoPauloDate'));
  assert.match(links, /if \(link\.already_purchased\) \{\s*return withLastOpening\(/);
  assert.match(links, /if \(validation\.isLoading\) \{\s*return withLastOpening\(/);
  assert.match(links, /return withLastOpening\(<span className="text-xs text-amber/);
  assert.match(links, /const withManualResult = \(openLink: React.ReactNode\) => withLastOpening\(/);
  assert.match(links, /upsellLastOpeningLabel\(link\.last_opening\)/);
  const opening = links.slice(links.indexOf('const openAudited'), links.indexOf('const validation'));
  assert.match(opening, /invalidateQueries\(\{queryKey: \['tracking-upsell-identities', offerId\]/);
  assert.doesNotMatch(opening, /saveTrackingUpsellManualResult/);
});

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
