import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GET, POST } from '../src/app/api/spy-visual/route';
import { changeLibraryState } from '../src/lib/spy-library-store';

test('live visual route binds Spy and AI company, rejects foreign offer/origin, and reads persisted results without generation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-visual-route-'));
  const original = globalThis.fetch;
  const env = { ...process.env };
  const company = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
  const id = '995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
  let aiCompany = company;
  let paid = 0;
  process.env.TMX_SPY_SERVER = '1';
  process.env.TMX_SPY_ORIGIN = 'https://theminex.com';
  process.env.API_PROXY_TARGET = 'http://api.test';
  process.env.TMX_SPY_DIRECTORY = dir;
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    if (options?.method === 'POST') paid++;
    if (u.includes('/v1/spy/access'))
      return Response.json({
        owner: `company:${company}`,
        companyId: company,
        companyName: 'Test',
        userId: 'admin',
        canConfigure: true,
        canEdit: true,
        canMonitor: true,
        owners: [`company:${company}`],
        companies: [],
        users: [],
      });
    if (u.includes('/spy-visual/access')) return Response.json({ companyId: aiCompany });
    if (u.includes('/spy-visual/results')) return Response.json({ records: [] });
    throw Error('Unexpected fetch');
  };
  const req = (query = `id=${id}`, method = 'GET', origin = 'https://theminex.com') =>
    new Request(`https://theminex.com/api/spy-visual?${query}`, {
      method,
      headers: { authorization: 'Bearer test', origin },
      ...(method === 'POST' ? { body: JSON.stringify({ adId: '123' }) } : {}),
    });
  try {
    await changeLibraryState(
      `company:${company}`,
      (s) => ({
        ...s,
        jobs: {
          [id]: {
            id,
            name: 'Test',
            sources: [],
            enabled: false,
            optedIn: false,
            responsibleId: null,
            discoverySeen: [],
            startedAt: null,
            nextAt: null,
            checkedAt: null,
            error: '',
            status: 'complete',
            partial: null,
            snapshots: [
              {
                day: 0,
                at: '2026-11-12T12:00:00Z',
                scope: 'test',
                countries: ['ALL'],
                ads: [],
                added: [],
                missing: [],
                baseline: true,
              },
            ],
          },
        },
      }),
      dir,
    );
    assert.equal((await GET(req())).status, 200);
    assert.equal((await GET(req('id=00000000-0000-4000-8000-000000000000'))).status, 403);
    assert.equal((await POST(req(`id=${id}`, 'POST', 'https://evil.test'))).status, 422);
    aiCompany = '69706e9a-95ad-493e-b4ab-4a6de7541add';
    assert.equal((await GET(req())).status, 403);
    assert.equal(paid, 0);
  } finally {
    globalThis.fetch = original;
    for (const key of [
      'TMX_SPY_SERVER',
      'TMX_SPY_ORIGIN',
      'API_PROXY_TARGET',
      'TMX_SPY_DIRECTORY',
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
});
