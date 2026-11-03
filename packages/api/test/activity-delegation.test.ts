import type { ToolKey } from '@page-cloner/shared';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import activityRoutes from '../src/routes/activity.js';

async function fixture(tools: ToolKey[], admin = false) {
  const app = Fastify();
  const entries = new Map([
    ['operator', [{ id: 'own-result', kind: 'clone' }]],
    ['other-operator', [{ id: 'private-other-result', kind: 'clone' }]],
  ]);
  app.decorate('requireAuth', async (req) => {
    req.user = {
      sub: 'operator',
      role: admin ? 'admin' : 'user',
      email: 'fixture@test',
      iat: 0,
      exp: 0,
      tools,
    };
  });
  app.decorate('activityStore', { list: async (id: string) => entries.get(id) ?? [] });
  await app.register(errorHandlerPlugin);
  await app.register(activityRoutes);
  return app;
}

describe('delegated personal activity', () => {
  it('denies the activity endpoint without its explicit navigation grant', async () => {
    const app = await fixture(['logs']);
    try {
      const response = await app.inject('/activity');
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('section_forbidden');
      expect(response.body).not.toContain('own-result');
    } finally {
      await app.close();
    }
  });
  it('returns only the authenticated operator activity even when another user is requested', async () => {
    const app = await fixture(['logs', 'nav:scoped', 'nav:operator-activity']);
    try {
      const response = await app.inject('/activity?userId=other-operator');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ entries: [{ id: 'own-result', kind: 'clone' }] });
      expect(response.body).not.toContain('private-other-result');
    } finally {
      await app.close();
    }
  });
  it('preserves global administrator access without exposing other actors through personal activity', async () => {
    const app = await fixture([], true);
    try {
      const response = await app.inject('/activity');
      expect(response.statusCode).toBe(200);
      expect(response.json().entries).toHaveLength(1);
      expect(response.body).not.toContain('private-other-result');
    } finally {
      await app.close();
    }
  });
});
