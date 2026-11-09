import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import { readFile } from 'node:fs/promises';
import { env } from '../src/env.js';
import { registerLocalMetaCampaignRoutes } from '../src/routes/meta-control/get-local-meta-campaigns.js';
const snapshot = {
  fetchedAt: '2026-11-08T12:00:00Z',
  from: '2026-10-01',
  to: '2026-11-08',
  accounts: [],
  campaigns: [],
  insights: [],
  failures: [],
  access_token: 'should-not-leak',
};
describe('local campaigns boundary', () => {
  afterEach(() => {
    vi.clearAllMocks();
    env.NODE_ENV = 'test';
  });
  async function server(role = 'admin', sub = 'admin') {
    const app = Fastify();
    app.addHook('preHandler', async (req) => {
      req.user = { role, sub } as typeof req.user;
    });
    registerLocalMetaCampaignRoutes(app);
    await app.ready();
    return app;
  }
  it('requires admin and never reads the snapshot in production', async () => {
    const member = await server('member');
    expect((await member.inject('/meta-control/campaigns/local-import')).statusCode).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
    await member.close();
    env.NODE_ENV = 'production';
    const app = await server();
    expect((await app.inject('/meta-control/campaigns/local-import')).statusCode).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
    await app.close();
  });
  it('validates the data, strips unknown fields and prevents shared caching', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(snapshot));
    const app = await server();
    const result = await app.inject('/meta-control/campaigns/local-import');
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body).not.toContain('should-not-leak');
    expect(result.json().campaigns).toEqual([]);
    await app.close();
  });
  it('does not expose the local owner snapshot to another admin', async () => {
    const app = await server('admin', 'other-admin');
    expect((await app.inject('/meta-control/campaigns/local-import')).statusCode).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
    await app.close();
  });
  it('omits hourly payloads in overview queries and retains them for comparisons', async () => {
    const app = await server();
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ ...snapshot, hourly: [] }));
    expect(
      (await app.inject('/meta-control/campaigns/local-import?hourly=0')).json().hourly,
    ).toBeUndefined();
    expect(
      (await app.inject('/meta-control/campaigns/local-import?hourly=1')).json().hourly,
    ).toEqual([]);
    await app.close();
  });
  it('selects the period cache and falls back to the preserved snapshot without changing its dates', async () => {
    const app = await server();
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({ ...snapshot, from: '2026-11-07', to: '2026-11-07' }),
    );
    const result = await app.inject(
      '/meta-control/campaigns/local-import?from=2026-11-07&to=2026-11-07',
    );
    expect(result.statusCode).toBe(200);
    expect(result.json().from).toBe('2026-11-07');
    expect(vi.mocked(readFile).mock.calls.at(-1)?.[0]).toMatch(
      /meta-campaigns-2026-11-07-2026-11-07\.json$/,
    );
    vi.mocked(readFile)
      .mockRejectedValueOnce(Error('missing period'))
      .mockResolvedValueOnce(JSON.stringify(snapshot));
    const fallback = await app.inject(
      '/meta-control/campaigns/local-import?from=2026-11-08&to=2026-11-08',
    );
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json().from).toBe(snapshot.from);
    const before = vi.mocked(readFile).mock.calls.length;
    expect(
      (await app.inject('/meta-control/campaigns/local-import?from=2026-02-30&to=2026-11-08'))
        .statusCode,
    ).toBe(400);
    expect(vi.mocked(readFile).mock.calls.length).toBe(before);
    await app.close();
  });
  it('fails closed on corrupt or missing data without inventing campaigns', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{invalid');
    const app = await server();
    expect((await app.inject('/meta-control/campaigns/local-import')).statusCode).toBe(404);
    vi.mocked(readFile).mockRejectedValueOnce(Error('private file path'));
    const result = await app.inject('/meta-control/campaigns/local-import');
    expect(result.statusCode).toBe(404);
    expect(result.body).not.toContain('private file path');
    await app.close();
  });
  it('preserves confirmed front classification and reported purchase values', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        ...snapshot,
        purchaseClassification: 'front_only_user_confirmed',
        insights: [
          {
            campaignId: '10',
            accountId: 'act_1',
            date: '2026-11-01',
            currency: 'BRL',
            spend: '10.00',
            impressions: '100',
            linkClicks: null,
            actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '2' }],
            actionValues: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '50.00' }],
          },
        ],
      }),
    );
    const app = await server();
    const result = await app.inject('/meta-control/campaigns/local-import');
    expect(result.statusCode).toBe(200);
    expect(result.json().purchaseClassification).toBe('front_only_user_confirmed');
    expect(result.json().insights[0].actionValues[0].value).toBe('50.00');
    await app.close();
  });
  it('protects refresh/status and rejects invalid date ranges before reading bridge credentials', async () => {
    const denied = await server('member');
    expect((await denied.inject('/meta-control/traffic/status')).statusCode).toBe(403);
    expect(
      (
        await denied.inject({
          method: 'POST',
          url: '/meta-control/traffic/refresh',
          payload: { from: '2026-11-08', to: '2026-11-08' },
        })
      ).statusCode,
    ).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
    await denied.close();
    const app = await server();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/meta-control/traffic/refresh',
          payload: { from: '2026-02-30', to: '2026-03-01' },
        })
      ).statusCode,
    ).toBe(400);
    expect(readFile).not.toHaveBeenCalled();
    await app.close();
  });
});
