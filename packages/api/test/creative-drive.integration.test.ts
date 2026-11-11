import { creativeCatalogRows } from '@page-cloner/shared/creative-workspace-model';
import { todayIso } from '@page-cloner/shared/date-range';
import Fastify from 'fastify';
import Redis from 'ioredis';
import { expect, test } from 'vitest';
import { syncCloudCreativeDrive } from '../src/services/creative-drive.js';

const socket = process.env.TMX_TEST_CREATIVE_REDIS ?? '';
const route = '/ads-intelligence/creative-drive';
const root = 'qa_drive_root_1234';
const folder = 'qa_drive_offer_123';
const leva = 'qa_drive_leva_1234';
const clean = 'qa_drive_clean_123';
const version = 'qa_drive_version_123';
const untested = 'qa_drive_untested_123';
const principalKey = 'SLM_DE:AD1:L2';

function listing(name: string, entries: [string, string, boolean][]) {
  return `<title>${name}</title><div class="flip-entries">${entries
    .map(([id, title, folder]) =>
      `<div class="flip-entry" id="entry-${id}"><a href="https://drive.google.com/${folder ? `drive/folders/${id}` : `file/d/${id}/view`}"><div class="flip-entry-title">${title}</div></a></div>`,
    )
    .join('')}</div>`;
}

test.skipIf(!socket)('persists creative links and manual statuses across cloud Drive and Meta updates', async () => {
  expect(socket).toMatch(/^\/(?:private\/)?tmp\/tmx-creative-qa\.[A-Za-z0-9]+\/redis\.sock$/);
  const { registerCreativeDriveRoutes } = await import('../src/routes/ads-intelligence/creative-drive.js');
  const { trafficUserKey } = await import('../src/services/traffic-personal-sync.js');
  const redis = new Redis(socket);
  const app = Fastify();
  app.decorate('redis', redis);
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    req.user = {
      sub: String(req.headers['x-qa-owner'] ?? 'qa-one'),
      role: req.headers['x-qa-role'] === 'user' ? 'user' : 'admin',
    } as typeof req.user;
  });
  registerCreativeDriveRoutes(app);
  const call = (payload?: Record<string, unknown>, owner = 'qa-one', role = 'admin') =>
    app.inject({
      method: payload ? 'POST' : 'GET',
      url: route,
      headers: { 'x-qa-owner': owner, 'x-qa-role': role },
      ...(payload ? { payload } : {}),
    });
  const pages: Record<string, string> = {
    [root]: listing('Principal', [[folder, 'SLM_DE', true]]),
    [folder]: listing('SLM_DE', [[leva, 'L2', true]]),
    [leva]: listing('L2', [
      [version, 'SLM_DE_AD01_L2_creative.mp4', false],
      [clean, 'SLM_DE_AD01_L2.mp4', false],
      [untested, 'SLM_DE_L2_AD01_B1_H1.mp4', false],
    ]),
  };
  try {
    expect((await call(undefined, 'qa-one', 'user')).statusCode).toBe(403);
    const configured = await call({
      action: 'configure',
      rootUrl: `https://drive.google.com/drive/folders/${root}`,
    });
    expect(configured.statusCode).toBe(200);
    await syncCloudCreativeDrive(redis, 'qa-one', async (input) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe('drive.google.com');
      return new Response(pages[url.searchParams.get('id')!]);
    });
    const imported = (await call()).json();
    expect(imported.catalog.files).toHaveLength(3);
    const grouped = creativeCatalogRows([], imported.catalog);
    expect(grouped).toHaveLength(2);
    expect(grouped.find((row) => row.id === principalKey)?.principal?.id).toBe(clean);
    expect((await call(undefined, 'qa-two')).json().catalog).toBeNull();
    expect((await call({ action: 'metadata', key: principalKey, principalId: untested })).statusCode).toBe(400);
    expect((await call({
      action: 'metadata', key: principalKey, principalId: version, status: 'Validado',
    })).statusCode).toBe(200);
    const prefix = trafficUserKey('qa-one');
    const from = '2026-08-01';
    const to = todayIso();
    await redis.set(prefix + 'connection', JSON.stringify({ revision: 'qa' }));
    await redis.set(`${prefix}qa:${from}:${to}`, JSON.stringify({
      fetchedAt: new Date().toISOString(), from, to, failures: [],
      accounts: [{ id: 'a', name: 'Teste', currency: 'BRL', timezone: 'America/Sao_Paulo' }],
      campaigns: [{ id: 'c', name: 'SLM_DE | Teste', accountId: 'a', effectiveStatus: 'ACTIVE' }],
      insights: [{
        campaignId: 'c', accountId: 'a', date: to, currency: 'BRL',
        adId: 'ad1', adName: 'SLM_DE_AD01_L2', spend: '2000', impressions: '100', linkClicks: '10',
        actions: [{ action_type: 'purchase', value: '1' }],
        actionValues: [{ action_type: 'purchase', value: '1200' }],
      }],
    }));
    const classify = { action: 'classify', personal: true, mappings: {} };
    const [assessed, edited] = await Promise.all([
      call(classify),
      call({ action: 'metadata', key: principalKey, status: 'Em teste' }),
    ]);
    expect(assessed.statusCode).toBe(200);
    expect(edited.statusCode).toBe(200);
    expect(assessed.json().lowRoas).toEqual([principalKey]);
    const saved = (await call()).json().metadata;
    expect(saved[principalKey]).toMatchObject({
      status: 'Em teste', principalId: version, manualStatus: true,
    });
    expect(saved[principalKey + ':B1_H1'].status).toBe('Stand by');
    expect((await call(classify, 'qa-two')).statusCode).toBe(409);
    await syncCloudCreativeDrive(redis, 'qa-one', async () => new Response(null, { status: 503 }));
    const retained = (await call()).json();
    expect(retained.catalog.files).toHaveLength(3);
    expect(retained.error).toContain('Último catálogo preservado');
    expect(retained.metadata).toEqual(saved);
  } finally {
    await app.close();
    redis.disconnect();
  }
});
