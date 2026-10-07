import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import globalRoutes from '../src/routes/utmify-global-admin.js';
import offerRoutes from '../src/routes/utmify-tracking-admin.js';

const originalEncryptionKey = env.TRACKING_ENCRYPTION_KEY;

afterEach(() => {
  env.TRACKING_ENCRYPTION_KEY = originalEncryptionKey;
});

async function buildGlobalApp() {
  env.TRACKING_ENCRYPTION_KEY = 'test-only-encryption-key-at-least-32-characters';
  const app = Fastify();
  const db = vi
    .fn()
    .mockResolvedValueOnce([{ id: 'global-1', api_token_encrypted: 'encrypted-token' }])
    .mockResolvedValueOnce([
      {
        id: 'global-1',
        name: 'UTMify Geral',
        endpoint_url: 'https://api.utmify.com.br/api-credentials/orders',
        enabled: true,
      },
    ]);
  app.decorate('db', db);
  app.addHook('preHandler', async (req) => {
    (req as typeof req & { user: { sub: string; role: string } }).user = {
      sub: 'admin',
      role: 'admin',
    };
  });
  await app.register(globalRoutes);
  return { app, db };
}

async function buildOfferApp() {
  env.TRACKING_ENCRYPTION_KEY = 'test-only-encryption-key-at-least-32-characters';
  const app = Fastify();
  const db = vi.fn();
  app.decorate('db', db);
  app.decorate('offerStore', {
    assertManager: vi.fn().mockResolvedValue(undefined),
  });
  app.addHook('preHandler', async (req) => {
    (req as typeof req & { user: { sub: string; role: string } }).user = {
      sub: 'manager',
      role: 'user',
    };
  });
  await app.register(offerRoutes);
  return { app, db };
}

describe('UTMify SSRF protection', () => {
  it('rejects an arbitrary destination before writing configuration', async () => {
    const { app, db } = await buildOfferApp();
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/offers/offer-a/tracking/utmify-destination',
        payload: {
          api_token: 'token-with-at-least-16-characters',
          endpoint_url: 'https://evil.com/webhook',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'utmify_host_not_allowed',
        message: 'A URL deve usar um host oficial da UTMify.',
      });
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('also rejects an arbitrary destination in the global configuration', async () => {
    const { app, db } = await buildGlobalApp();
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/utmify-global',
        payload: { endpoint_url: 'https://evil.com/webhook' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'utmify_host_not_allowed',
        message: 'A URL deve usar um host oficial da UTMify.',
      });
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('accepts an official UTMify API destination', async () => {
    const { app, db } = await buildGlobalApp();
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/utmify-global',
        payload: { endpoint_url: 'https://api.utmify.com.br/x' },
      });

      expect(response.statusCode).toBe(200);
      expect(db).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
