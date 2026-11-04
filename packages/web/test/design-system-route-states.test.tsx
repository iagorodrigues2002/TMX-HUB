import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InterfaceEffectsProvider } from '../src/lib/interface-effects';

const render = (element: ReactNode) =>
  renderToStaticMarkup(React.createElement(InterfaceEffectsProvider, null, element));

register(
  `data:text/javascript,${encodeURIComponent(`export async function load(url, context, nextLoad) {
  if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true, source: 'export default new Proxy({}, { get: (_, key) => String(key) });' };
  return nextLoad(url, context);
}`)}`,
  import.meta.url,
);

const { default: Callback } = await import('../src/app/tracking/google-callback/page');
const { default: ErrorPage } = await import('../src/app/error');
const { default: NotFound } = await import('../src/app/not-found');
const { default: Loading } = await import('../src/app/tools/cloner/jobs/[id]/loading');

test('OAuth callback presentation shares the theme without executing its authorization effect', () => {
  const html = render(<Callback />);
  assert.match(html, /tmx-public-surface/);
  assert.match(html, /Conexão Google Ads/);
  assert.match(html, /href="\/tracking"/);
});
test('route error is actionable and never exposes raw server errors', () => {
  const html = render(<ErrorPage error={new Error('HTTP 500 SECRET')} reset={() => {}} />);
  assert.match(html, /tmx-public-surface/);
  assert.match(html, /Não foi possível abrir esta tela/);
  assert.doesNotMatch(html, /HTTP|SECRET/);
  assert.match(html, /<button/);
});
test('not-found and editor loading stay in the same design system', () => {
  for (const element of [<NotFound key="not-found" />, <Loading key="loading" />])
    assert.match(render(element), /tmx-public-surface/);
});
