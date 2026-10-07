import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/lib/secret-box.js';

const encryptionKey = 'webhook-hmac-test-encryption-key-at-least-32-characters';
const webhookSecret = 'gateway-webhook-signing-secret';
const token = 'gateway-webhook-token';
const rawPayload = '{\n  "unexpected": true\n}';

type Provider = 'vendepay' | 'paysight';

function createDb(provider: Provider) {
  const encryptedSecret = encryptSecret(webhookSecret, encryptionKey);
  const query = async (strings: TemplateStringsArray) => {
    const statement = strings.join(' ');
    if (statement.includes('FROM vendepay_connections')) {
      return [
        {
          id: 'vendepay-connection',
          project_id: 'project-1',
          token_hash: 'unused-by-test-double',
          offer_id: 'offer-1',
          name: 'VendePay',
          signing_secret_encrypted: provider === 'vendepay' ? encryptedSecret : null,
        },
      ];
    }
    if (statement.includes('FROM tracking_gateway_connections')) {
      return [
        {
          id: `${provider}-gateway-connection`,
          project_id: 'project-1',
          offer_id: 'offer-1',
          signing_secret_encrypted: statement.includes(`provider='${provider}'`)
            ? encryptedSecret
            : null,
        },
      ];
    }
    if (statement.includes('INSERT INTO webhook_receipts')) return [{ id: 'receipt-1' }];
    return [];
  };
  query.json = (value: unknown) => value;
  query.begin = async (callback: (sql: typeof query) => Promise<unknown>) => callback(query);
  return query;
}

async function createApp(provider: Provider) {
  vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-at-least-32-characters');
  vi.stubEnv('TRACKING_ENCRYPTION_KEY', encryptionKey);
  vi.stubEnv('WEBHOOK_SIGNATURE_REQUIRED', 'true');
  const { default: trackingPublicRoutes } = await import('../src/routes/tracking-public.js');
  const app = Fastify();
  app.decorate('db', createDb(provider) as never);
  app.decorate('offerStore', {} as never);
  await app.register(trackingPublicRoutes);
  return app;
}

describe('gateway webhook HMAC', () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const provider of ['vendepay', 'paysight'] as const) {
    it(`${provider} accepts a valid HMAC over the raw body`, async () => {
      const app = await createApp(provider);
      const signature = createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');
      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${provider}?token=${token}`,
        headers: {
          'content-type': 'application/json',
          [`x-${provider}-signature`]: signature,
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it(`${provider} rejects an invalid HMAC`, async () => {
      const app = await createApp(provider);
      const response = await app.inject({
        method: 'POST',
        url: `/webhooks/${provider}?token=${token}`,
        headers: {
          'content-type': 'application/json',
          [`x-${provider}-signature`]: '00'.repeat(32),
        },
        payload: rawPayload,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });
  }
});
