import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
const harness = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  processor: null as any,
  options: null as any,
  mode: 'production',
}));
vi.mock('../src/env.js', () => ({
  env: {
    get NODE_ENV() {
      return harness.mode;
    },
    META_GRAPH_API_VERSION: 'v25.0',
    REDIS_URL: 'redis://unused',
  },
}));
vi.mock('../src/lib/redis.js', () => ({ makeRedis: () => ({}) }));
vi.mock('../src/routes/meta-control/traffic-user-connection.js', () => ({
  connectionSecret: async () => 'test-secret',
}));
vi.mock('bullmq', async (original) => {
  const actual = await original<typeof import('bullmq')>();
  return {
    UnrecoverableError: actual.UnrecoverableError,
    Queue: class {
      async addBulk(jobs: any[]) {
        for (const job of jobs)
          if (!harness.jobs.has(job.opts.jobId)) harness.jobs.set(job.opts.jobId, job);
      }
      async close() {}
    },
    Worker: class {
      constructor(_name: string, processor: any, opts: any) {
        harness.processor = processor;
        harness.options = opts;
      }
      on() {}
      async close() {}
    },
    Job: {
      fromId: async (_queue: unknown, id: string) =>
        harness.jobs.has(id)
          ? { ...harness.jobs.get(id), getState: async () => 'waiting' }
          : undefined,
    },
  };
});
import { encryptSecret } from '../src/lib/secret-box.js';
it('refreshes transient Meta processing without shortening stable caches', () => {
  expect(managementCacheTtl({ effectiveStatus: 'IN_PROCESS' })).toBe(30);
  expect(managementCacheTtl({ effectiveStatus: 'ACTIVE' })).toBe(1200);
  expect(managementCacheTtl({ effectiveStatus: 'PAUSED' })).toBe(1200);
});
import {
  type ManagedItem,
  applyManagement,
  managementPatch,
  managementCacheTtl,
  managementRejections,
  readManagementObjects,
  registerTrafficManagement,
  validateManagementBatch,
} from '../src/services/traffic-management.js';

const item: ManagedItem = {
  id: '120247255154160139',
  name: 'Campaign fixture',
  accountId: '1122324299453168',
  accountName: 'Fixture USD',
  currency: 'USD',
  status: 'ACTIVE',
  effectiveStatus: 'ACTIVE',
  budget: 3900,
  budgetField: 'daily_budget',
};
const apps: ReturnType<typeof Fastify>[] = [];
describe('inline controls and bulk budgets', () => {
  it('converts selected BRL into Meta currency on the server and rejects expired quotes', async () => {
    const { prepare, submit, values } = await fixture();
    const quoteId = '4ae2f7ba-1af0-48ac-a1f2-c647366942fa';
    values.set('traffic-management-v1:fx:' + quoteId, JSON.stringify({ id: quoteId, fetchedAt: new Date().toISOString(), rates: { BRL: 1, USD: 5 } }));
    const plan = (await prepare()).json();
    expect((await submit(plan.planId, { budget: 10000, currency: 'BRL', quoteId })).statusCode).toBe(200);
    expect([...harness.jobs.values()][0].data.action).toEqual({ budget: 2000 });
    const second = (await prepare()).json();
    values.set('traffic-management-v1:fx:' + quoteId, JSON.stringify({ id: quoteId, fetchedAt: '2020-01-01', rates: { BRL: 1, USD: 5 } }));
    expect((await submit(second.planId, { budget: 10000, currency: 'BRL', quoteId })).statusCode).toBe(409);
    expect((await submit(plan.planId, { budget: 10000, currency: 'BRL', quoteId })).statusCode).toBe(200);
    expect(harness.jobs.size).toBe(1);
  });
  it('validates every budget before enqueueing and rejects mixed currencies/types', () => {
    expect(() =>
      validateManagementBatch([item, { ...item, id: '123456' }], { budget: 4100 }, 'campaigns'),
    ).not.toThrow();
    for (const changed of [
      { currency: 'BRL' },
      { budgetField: 'lifetime_budget' as const },
      { budgetField: null },
    ])
      expect(() =>
        validateManagementBatch([item, { ...item, ...changed }], { budget: 4100 }, 'campaigns'),
      ).toThrow();
    expect(() => validateManagementBatch([item], { budget: 4100 }, 'ads')).toThrow();
  });
  it('finds rejected ads outside the reporting period without crossing campaigns or accounts', () => {
    const health = {
      observedAt: new Date().toISOString(),
      accounts: [
        {
          id: `act_${item.accountId}`,
          name: 'Fixture',
          status: 1,
          adsComplete: true,
          rejected: [
            {
              id: '987654',
              name: 'Rejected fixture',
              campaignId: item.id,
              campaignName: item.name,
              adsetId: '123456',
            },
          ],
        },
      ],
    };
    expect(managementRejections(item, 'campaigns', health).rejected).toHaveLength(1);
    expect(managementRejections({ ...item, id: '123456' }, 'adsets', health).rejected).toHaveLength(
      1,
    );
    expect(
      managementRejections({ ...item, accountId: '999999' }, 'campaigns', health).rejected,
    ).toHaveLength(0);
    expect(managementRejections({ ...item, id: '987654' }, 'ads', health).rejected).toHaveLength(1);
    expect(
      managementRejections(item, 'campaigns', { ...health, observedAt: '2020-01-01' })
        .rejectionCheckComplete,
    ).toBe(false);
    expect(managementRejections(item, 'campaigns', null).rejectionCheckComplete).toBe(false);
    const checkedAt = new Date(Date.now() - 22 * 60_000).toISOString();
    const partial = { ...health, incompleteAccounts: 1, accounts: health.accounts.map(account => ({ ...account, lastCheckComplete: true, checkedAt })) };
    expect(managementRejections(item, 'campaigns', partial).rejectionCheckComplete).toBe(true);
    expect(managementRejections(item, 'campaigns', { ...partial, accounts: partial.accounts.map(account => ({ ...account, lastCheckComplete: false })) }).rejectionCheckComplete).toBe(false);
    expect(managementRejections(item, 'campaigns', { ...partial, accounts: partial.accounts.map(account => ({ ...account, checkedAt: new Date(Date.now() - 26 * 60_000).toISOString() })) }).rejectionCheckComplete).toBe(false);
  });
  it('caches row metadata and never queries Meta twice within the cache window', async () => {
    const { app, fetcher } = await fixture();
    const payload = { level: 'campaigns', ids: [item.id] };
    const first = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/items',
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().items[0].budget).toBe(3900);
    const calls = fetcher.mock.calls.length;
    expect(
      (await app.inject({ method: 'POST', url: '/meta-control/traffic/management/items', payload }))
        .statusCode,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/meta-control/traffic/management/items',
          payload,
          headers: { 'x-user': 'outsider' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('queues all same-currency budgets with separate item receipts', async () => {
    const { app, submit } = await fixture();
    const prepared = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/prepare',
      payload: { level: 'campaigns', ids: [item.id, '123456'] },
    });
    expect(prepared.statusCode).toBe(200);
    expect((await submit(prepared.json().planId, { budget: 4100 })).statusCode).toBe(200);
    expect(harness.jobs.size).toBe(2);
    for (const job of harness.jobs.values()) expect(job.data.action).toEqual({ budget: 4100 });
  });
  it('shows missing preview metadata as unknown without any real calls', async () => {
    harness.mode = 'test';
    const { app, fetcher } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/items',
      payload: { level: 'ads', ids: [item.id] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.unstubAllGlobals();
  harness.jobs.clear();
  harness.mode = 'production';
});
async function fixture() {
  const app = Fastify();
  apps.push(app);
  const values = new Map<string, string>([
    [
      'traffic-user:v1:owner:connection',
      JSON.stringify({
        revision: 'rev1',
        encrypted: encryptSecret('synthetic-token', 'test-secret'),
      }),
    ],
  ]);
  const lists = new Map<string, string[]>();
  app.decorate('redis', {
    get: async (k: string) => values.get(k) ?? null,
    set: async (k: string, v: string, ...opts: unknown[]) => {
      if (opts.includes('NX') && values.has(k)) return null;
      values.set(k, v);
      return 'OK';
    },
    expire: async () => 1,
    lrem: async (k: string, _count: number, v: string) => {
      lists.set(
        k,
        (lists.get(k) ?? []).filter((x) => x !== v),
      );
    },
    lpush: async (k: string, v: string) => {
      lists.set(k, [v, ...(lists.get(k) ?? [])]);
    },
    ltrim: async () => {},
    lrange: async (k: string) => lists.get(k) ?? [],
    eval: async (_script: string, _n: number, k: string, v: string) => {
      if (values.get(k) === v) values.delete(k);
    },
  });
  const user = { role: 'admin' };
  app.decorate('userStore', {
    maybeGetById: async (id: string) => (id === 'owner' ? user : { role: 'user' }),
  });
  app.decorate('db', null);
  app.addHook('preHandler', async (req) => {
    req.user = {
      sub: String(req.headers['x-user'] ?? 'owner'),
      role: req.headers['x-user'] ? 'user' : user.role,
    } as any;
  });
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    const batch = new URLSearchParams(options.body as URLSearchParams | undefined).get('batch');
    if (batch)
      return new Response(
        JSON.stringify(
          JSON.parse(batch).map((request: any) => ({
            code: 200,
            body: JSON.stringify({
              id: request.relative_url.split('?')[0],
              name: item.name,
              account_id: item.accountId,
              status: item.status,
              effective_status: item.effectiveStatus,
              daily_budget: String(item.budget),
            }),
          })),
        ),
      );
    if (options.method === 'POST') return new Response(JSON.stringify({ success: true }));
    if (new URL(url).searchParams.get('fields') === 'name,currency')
      return new Response(
        JSON.stringify({
          name: item.accountName,
          currency: item.currency,
        }),
      );
    return new Response(
      JSON.stringify({
        id: item.id,
        name: item.name,
        account_id: item.accountId,
        status: item.status,
        effective_status: item.effectiveStatus,
        daily_budget: String(item.budget),
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  registerTrafficManagement(app);
  await app.ready();
  const prepare = () =>
    app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/prepare',
      payload: { level: 'campaigns', ids: [item.id] },
    });
  const submit = (planId: string, action: unknown, headers = {}) =>
    app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/operations',
      headers,
      payload: { planId, action },
    });
  return { app, values, user, fetcher, prepare, submit };
}

describe('verified Meta mutations', () => {
  it('uses the company credential and scope even when the admin has a personal connection', async () => {
    const { app, prepare, values, fetcher } = await fixture();
    const company = '00000000-0000-4000-8000-000000000001';
    app.db = (async () => [{ company_id: company, role: 'admin', status: 'active', tools: [] }]) as unknown as typeof app.db;
    values.set('creative-drive:v1:company-id', company);
    values.set(`traffic-company:v1:${company}:connection`, JSON.stringify({ revision: 'company-revision', encrypted: encryptSecret('company-synthetic-token', 'test-secret') }));
    const response = await prepare();
    expect(response.statusCode).toBe(200);
    const plan = JSON.parse(values.get(`traffic-management-v1:plan:${response.json().planId}`)!);
    expect(plan).toMatchObject({ scope: `company:${company}`, revision: 'company-revision' });
    expect(fetcher.mock.calls.every(([, options]) => options.headers.Authorization === 'Bearer company-synthetic-token')).toBe(true);
  });
  it.each(['campaigns', 'adsets', 'ads'] as const)(
    'pauses %s and verifies the readback',
    async (kind) => {
      const read = vi
        .fn()
        .mockResolvedValueOnce(item)
        .mockResolvedValueOnce({ ...item, status: 'PAUSED', effectiveStatus: 'PAUSED' });
      const write = vi.fn();
      expect((await applyManagement(item, { status: 'PAUSED' }, kind, read, write)).status).toBe(
        'PAUSED',
      );
      expect(write).toHaveBeenCalledWith({ status: 'PAUSED' });
    },
  );
  it('reports activation without claiming delivery under a paused parent', async () => {
    const current = { ...item, status: 'PAUSED' };
    const read = vi
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...item, effectiveStatus: 'CAMPAIGN_PAUSED' });
    expect(
      (await applyManagement(current, { status: 'ACTIVE' }, 'ads', read, vi.fn())).effectiveStatus,
    ).toBe('CAMPAIGN_PAUSED');
  });
  it('does not repeat a write after an accepted operation loses its response', async () => {
    const write = vi.fn();
    await applyManagement(
      item,
      { budget: 3861 },
      'campaigns',
      async () => ({ ...item, budget: 3861 }),
      write,
    );
    expect(write).not.toHaveBeenCalled();
  });
  it('preserves edits made after confirmation', async () => {
    const write = vi.fn();
    await expect(
      applyManagement(
        item,
        { budget: 3861 },
        'campaigns',
        async () => ({ ...item, budget: 4500 }),
        write,
      ),
    ).rejects.toThrow('mudou');
    expect(write).not.toHaveBeenCalled();
  });
  it('rejects ad budgets, inherited budgets, invalid amounts and unverified currency offsets', () => {
    expect(() => managementPatch(item, { budget: 3000 }, 'ads')).toThrow();
    expect(() =>
      managementPatch({ ...item, budgetField: null }, { budget: 3000 }, 'adsets'),
    ).toThrow();
    expect(() => managementPatch(item, { budget: -1 }, 'campaigns')).toThrow();
    expect(() => managementPatch(item, { budget: 0.5 }, 'campaigns')).toThrow();
    expect(() =>
      managementPatch({ ...item, currency: 'COP' }, { budget: 3000 }, 'campaigns'),
    ).toThrow();
    expect(
      managementPatch({ ...item, budgetField: 'lifetime_budget' }, { budget: 3000 }, 'adsets'),
    ).toEqual({ lifetime_budget: 3000 });
  });
  it('does not report success before Meta confirms', async () => {
    await expect(
      applyManagement(item, { status: 'PAUSED' }, 'campaigns', async () => item, vi.fn()),
    ).rejects.toThrow('não confirmou');
  });
});

describe('management API and durable queue contracts', () => {
  it('uses GET subrequests instead of the deprecated multi-ID query', async () => {
    const { fetcher } = await fixture();
    const ids = [item.id, '120247255154160140'];
    const result = await readManagementObjects('synthetic-token', ids, 'id,name');
    expect(Object.keys(result)).toEqual(ids);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).not.toContain('ids=');
    const body = new URLSearchParams(options.body as URLSearchParams);
    expect(JSON.parse(body.get('batch')!)).toEqual(
      ids.map((id) => ({ method: 'GET', relative_url: `${id}?fields=id%2Cname` })),
    );
  });
  it('checks each batch response instead of accepting an HTTP 200 envelope', async () => {
    const { fetcher } = await fixture();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { code: 200, body: JSON.stringify({ id: item.id }) },
          { code: 400, body: JSON.stringify({ error: { code: 613 } }) },
        ]),
      ),
    );
    await expect(
      readManagementObjects('synthetic-token', [item.id, '120247255154160140'], 'id'),
    ).rejects.toThrow('espaçada');
  });
  it('prepares multiple IDs in two reads, queues idempotently, recovers after reload and paces the worker', async () => {
    const { app, prepare, submit, fetcher } = await fixture();
    const prepared = await prepare();
    expect(prepared.statusCode).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const { planId } = prepared.json();
    expect((await submit(planId, { status: 'PAUSED' })).statusCode).toBe(200);
    expect((await submit(planId, { status: 'PAUSED' })).statusCode).toBe(200);
    expect(harness.jobs.size).toBe(1);
    expect((await submit(planId, { status: 'ACTIVE' })).statusCode).toBe(409);
    expect(harness.options).toMatchObject({ concurrency: 1, limiter: { max: 1, duration: 65000 } });
    const job = [...harness.jobs.values()][0];
    expect(job.opts).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 65000 } });
    expect(JSON.stringify(job)).not.toContain('synthetic-token');
    const recovered = await app.inject({
      url: `/meta-control/traffic/management/operations/${planId}`,
    });
    expect(recovered.json().results[0].state).toBe('waiting');
    expect(
      (await app.inject({ url: '/meta-control/traffic/management/operations' })).json().batches,
    ).toEqual([planId]);
  });
  it('does not keep controls waiting forever for expired jobs or plans', async () => {
    const { app, prepare, submit, values } = await fixture();
    const { planId } = (await prepare()).json();
    await submit(planId, { status: 'PAUSED' });
    harness.jobs.clear();
    const progress = (await app.inject({ url: `/meta-control/traffic/management/operations/${planId}` })).json();
    expect(progress.results[0].state).toBe('failed');
    expect(progress.results[0].error).toContain('expirado');
    values.delete(`traffic-management-v1:plan:${planId}`);
    expect((await app.inject({ url: '/meta-control/traffic/management/operations' })).json().batches).toEqual([]);
  });
  it('refuses foreign plans, revoked admin rights and changed connections', async () => {
    const { prepare, submit, values, user } = await fixture();
    const { planId } = (await prepare()).json();
    expect((await submit(planId, { status: 'PAUSED' }, { 'x-user': 'outsider' })).statusCode).toBe(
      422,
    );
    await submit(planId, { status: 'PAUSED' });
    const job = [...harness.jobs.values()][0];
    user.role = 'user';
    await expect(harness.processor(job)).rejects.toThrow('administradores');
    user.role = 'admin';
    values.set(
      'traffic-user:v1:owner:connection',
      JSON.stringify({
        revision: 'rev2',
        encrypted: encryptSecret('synthetic-token', 'test-secret'),
      }),
    );
    await expect(harness.processor(job)).rejects.toThrow('conexão');
  });
  it('rejects expired confirmations and non-whitelisted fields', async () => {
    const { prepare, submit, values } = await fixture();
    const { planId } = (await prepare()).json();
    const key = `traffic-management-v1:plan:${planId}`;
    values.set(key, JSON.stringify({ ...JSON.parse(values.get(key)!), expires: 0 }));
    expect((await submit(planId, { status: 'PAUSED' })).statusCode).toBe(409);
    expect(
      (await submit(planId, { status: 'PAUSED', access_token: 'not-accepted' })).statusCode,
    ).toBe(400);
  });
  it('does not collide with an active report collector or remove its lock', async () => {
    const { prepare, submit, values } = await fixture();
    const { planId } = (await prepare()).json();
    await submit(planId, { status: 'PAUSED' });
    values.set('traffic-sync:v1:owner:lock', 'collector');
    await expect(harness.processor([...harness.jobs.values()][0])).rejects.toThrow(
      'aguarda na fila',
    );
    expect(values.get('traffic-sync:v1:owner:lock')).toBe('collector');
  });
  it('blocks all real writes and reads in the local preview', async () => {
    harness.mode = 'test';
    const { prepare, submit, fetcher } = await fixture();
    expect((await prepare()).statusCode).toBe(409);
    expect(
      (await submit('10000000-0000-4000-8000-000000000000', { status: 'PAUSED' })).statusCode,
    ).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows only imported budget data in preview, without consulting Meta', async () => {
    harness.mode = 'test';
    const { prepare, values, fetcher } = await fixture();
    values.set(`traffic-management-v1:preview:owner:campaigns:${item.id}`, JSON.stringify(item));
    const response = await prepare();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ planId: '', items: [item] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reads inherited CBO budgets as non-editable on adsets', async () => {
    const { app, fetcher } = await fixture();
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: item.id,
          name: item.name,
          account_id: item.accountId,
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          daily_budget: '1000',
          campaign: { daily_budget: '3900' },
        }),
      ),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/management/prepare',
      payload: { level: 'adsets', ids: [item.id] },
    });
    expect(res.json().items[0]).toMatchObject({ budget: null, budgetField: null });
  });
  it('rejects oversized batches and never queries malformed object IDs', async () => {
    const { app, fetcher } = await fixture();
    for (const ids of [
      [item.id, '../me'],
      Array.from({ length: 51 }, (_, index) => String(100000 + index)),
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/meta-control/traffic/management/prepare',
            payload: { level: 'ads', ids },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('releases its locks after a rate limit and keeps the failure retryable', async () => {
    const { prepare, submit, values, fetcher } = await fixture();
    const { planId } = (await prepare()).json();
    await submit(planId, { status: 'PAUSED' });
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 613 } }), { status: 400 }),
    );
    await expect(harness.processor([...harness.jobs.values()][0])).rejects.toThrow('espaçada');
    expect(values.has('traffic-sync:v1:owner:lock')).toBe(false);
    expect(values.has('traffic-user:v1:owner:lock')).toBe(false);
  });
  it('does not expose another operator operation history', async () => {
    const { app, prepare, submit } = await fixture();
    const { planId } = (await prepare()).json();
    await submit(planId, { status: 'PAUSED' });
    expect(
      (
        await app.inject({
          url: `/meta-control/traffic/management/operations/${planId}`,
          headers: { 'x-user': 'outsider' },
        })
      ).statusCode,
    ).toBe(403);
  });
});
