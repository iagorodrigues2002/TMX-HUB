import type { Offer } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/services/offer-store-data.js';
import { type OfferAiSecretConfig, OfferStore } from '../src/services/offer-store.js';

const config: OfferAiSecretConfig = {
  apiKey: 'synthetic-provider-key',
  provider: 'opencode-go',
  model: 'deepseek-v4-flash',
  role: 'fixture role',
  template: 'fixture template',
  responsible: 'fixture',
  minRoas: 2,
  tone: 'direto',
  includeAds: false,
  autoGenerate: false,
  scheduleHours: [8, 16],
};

function fixture() {
  const values = new Map<string, string>();
  const redis = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    },
    hset: async () => 1,
  } as unknown as Redis;
  return { values, store: new OfferStore(redis, 'synthetic-encryption-secret') };
}

describe('OfferStore persistence across focused modules', () => {
  it('round-trips encrypted credentials and does not store plaintext', async () => {
    const { store, values } = fixture();
    const credentials = { login: 'fixture@example.invalid', password: 'synthetic-password' };
    await store.setUtmifyCredentials('offer-a', credentials);
    expect(await store.getUtmifyCredentials('offer-a')).toEqual(credentials);
    expect(values.get('offer-utmify:offer-a')).not.toContain(credentials.password);
    expect(await store.getUtmifyCredentials('offer-b')).toBeNull();
  });

  it('keeps secret configuration private while preserving an existing API key', async () => {
    const { store, values } = fixture();
    const publicConfig = await store.setAiConfig('offer-a', config);
    expect(publicConfig).not.toHaveProperty('apiKey');
    expect(publicConfig.apiKeyConfigured).toBe(true);
    expect(values.get('offer-ai-config:offer-a')).not.toContain(config.apiKey);
    expect(await store.getAiSecretConfig('offer-a')).toEqual(config);
    const { apiKey: _key, ...update } = config;
    await store.setAiConfig('offer-a', { ...update, responsible: 'updated fixture' });
    expect(await store.getAiSecretConfig('offer-a')).toEqual({
      ...config,
      responsible: 'updated fixture',
    });
    expect(await store.getAiConfig('offer-b')).toBeNull();
  });

  it('rejects missing secrets and tolerates corrupted encrypted records', async () => {
    const { store, values } = fixture();
    const { apiKey: _key, ...missingKey } = config;
    await expect(store.setAiConfig('offer-a', missingKey)).rejects.toMatchObject({ status: 409 });
    values.set('offer-ai-config:offer-a', 'invalid');
    values.set('offer-utmify:offer-a', 'invalid');
    expect(await store.getAiConfig('offer-a')).toBeNull();
    expect(await store.getUtmifyCredentials('offer-a')).toBeNull();
  });

  it('keeps AI preferences scoped to both offer and user', async () => {
    const { store } = fixture();
    const preferences = { model: config.model, responsible: 'fixture' };
    await store.setAiUserPreferences('offer-a', 'user-a', preferences);
    expect(await store.getAiUserPreferences('offer-a', 'user-a')).toEqual(preferences);
    expect(await store.getAiUserPreferences('offer-b', 'user-a')).toBeNull();
    expect(await store.getAiUserPreferences('offer-a', 'user-b')).toBeNull();
  });

  it('retains explicit false access settings and optional offer fields', () => {
    const offer: Offer = {
      id: 'offer-a',
      userId: 'user-a',
      name: 'Fixture',
      companyName: 'Fixture company',
      status: 'testando',
      createdAt: '2026-10-18T00:00:00.000Z',
      memberIds: ['legacy-member'],
      currency: 'BRL',
      utmifyAccessEnabled: false,
      syncStatus: 'partial',
      lastSyncError: 'fixture failure',
    };
    expect(deserialize(serialize(offer))).toEqual(offer);
  });
});
