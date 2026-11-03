import Fastify, { type HTTPMethods } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  companyTransitionWrite,
  registerCompanyTransitionPause,
} from '../src/plugins/company-transition-pause.js';

const blocked: [HTTPMethods, string][] = [
  ['POST', '/v1/auth/register'],
  ['POST', '/v1/auth/invites'],
  ['POST', '/v1/auth/invites/:token/resend'],
  ['DELETE', '/v1/auth/invites/:token'],
  ['PATCH', '/v1/users/:id'],
  ['DELETE', '/v1/users/:id'],
  ['POST', '/v1/offers'],
  ['PATCH', '/v1/offers/:id'],
  ['DELETE', '/v1/offers/:id'],
  ['POST', '/v1/companies'],
  ['PUT', '/v1/companies/:id/members/:userId'],
  ['POST', '/v1/companies/:id/members'],
  ['POST', '/v1/companies/:id/offers'],
  ['POST', '/v1/calls'],
  ['PUT', '/v1/calls/:id'],
  ['POST', '/v1/calls/:id/cancel'],
  ['POST', '/v1/calls/:id/complete'],
];
const allowed: [HTTPMethods, string][] = [
  ['POST', '/v1/auth/login'],
  ['POST', '/v1/auth/change-password'],
  ['POST', '/v1/webhooks/vendepay'],
  ['POST', '/v1/webhooks/syzepay'],
  ['POST', '/v1/webhooks/explodely'],
  ['POST', '/v1/track'],
  ['POST', '/v1/track/events'],
  ['POST', '/v1/offers/:id/ingest'],
  ['POST', '/v1/offers/:id/sync'],
  ['PUT', '/v1/offers/:id/tracking/upsell-identities/:order/stages/:stage/result'],
  ['PUT', '/v1/companies/:id/payees/:userId'],
  ['POST', '/v1/companies/:id/finance/sync'],
  ['PUT', '/v1/tracking/sale-notice/preferences'],
  ['POST', '/v1/tracking/browser-push'],
  ['POST', '/v1/notification-center/read'],
  ['POST', '/v1/calls/notifications/:id/read'],
  ['POST', '/v1/call-automation/claim'],
  ['POST', '/v1/call-automation/checkpoint'],
  ['POST', '/v1/call-automation/result'],
  ['POST', '/v1/native-task-automation/claim'],
  ['POST', '/v1/native-task-automation/result'],
];

describe('company transition write pause', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('pauses only inventory, roles, invitations and call agenda mutations', () => {
    for (const [method, path] of blocked)
      expect(companyTransitionWrite(path, method), `${method} ${path}`).toBe(true);
  });

  it('keeps reads, authentication, commercial ingestion and delivery receipts working', () => {
    for (const [method, path] of allowed)
      expect(companyTransitionWrite(path, method), `${method} ${path}`).toBe(false);
    for (const [, path] of blocked)
      for (const method of ['GET', 'HEAD', 'OPTIONS'])
        expect(companyTransitionWrite(path, method), `${method} ${path}`).toBe(false);
    expect(companyTransitionWrite('/v1/offers-archive', 'POST')).toBe(false);
    expect(companyTransitionWrite('/v1/users/:id/password', 'PATCH')).toBe(false);
  });

  it('stops handlers before body parsing and matches canonical routes even with encoded IDs', async () => {
    const app = Fastify();
    registerCompanyTransitionPause(app, true);
    let mutations = 0;
    for (const [method, url] of [...blocked, ...allowed])
      app.route({ method, url, handler: async () => ({ reached: ++mutations }) });
    for (const [method, path] of blocked) {
      const result = await app.inject({
        method,
        url: `${path.replace(/:[A-Za-z]+/g, 'a%62c')}?preview=true`,
        headers: { 'content-type': 'application/json' },
        payload: '{invalid json',
      });
      expect(result.statusCode, `${method} ${path}`).toBe(503);
      expect(result.headers['retry-after']).toBe('60');
      expect(result.json().error).toBe('company_transition_writes_paused');
    }
    expect(mutations).toBe(0);
    for (const [method, path] of allowed) {
      const result = await app.inject({ method, url: path.replace(/:[A-Za-z]+/g, 'abc') });
      expect(result.statusCode, `${method} ${path}`).toBe(200);
    }
    expect(mutations).toBe(allowed.length);
    await app.close();
  });

  it('does not change any route when the temporary pause is disabled', async () => {
    const app = Fastify();
    registerCompanyTransitionPause(app, false);
    app.post('/v1/auth/register', async () => ({ reached: true }));
    expect((await app.inject({ method: 'POST', url: '/v1/auth/register' })).statusCode).toBe(200);
    await app.close();
  });

  it('defaults the environment flag to off and parses explicit true/false safely', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'synthetic-company-transition-test-secret');
    for (const [value, expected] of [
      [undefined, false],
      ['false', false],
      ['true', true],
    ] as const) {
      vi.stubEnv('COMPANY_TRANSITION_WRITES_PAUSED', value);
      vi.resetModules();
      const { env } = await import('../src/env.js');
      expect(env.COMPANY_TRANSITION_WRITES_PAUSED).toBe(expected);
    }
  });
});
