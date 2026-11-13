import Fastify from 'fastify';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const files = vi.hoisted(() => new Map<string, string>());
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('node:fs/promises', () => ({
  mkdir: async () => {},
  readFile: async (path: string) => {
    if (!files.has(path)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
    return files.get(path);
  },
  writeFile: async (path: string, value: string, options?: { flag?: string }) => {
    if (options?.flag === 'wx' && files.has(path))
      throw Object.assign(Error('exists'), { code: 'EEXIST' });
    files.set(path, value);
  },
  rename: async (from: string, to: string) => {
    files.set(to, files.get(from)!);
    files.delete(from);
  },
}));
import { aiScopeSchema, buildAiContext } from '../src/services/ai-preview-model.js';
import { companyKey, extractAiAnswer, registerAiPreview } from '../src/services/ai-preview.js';
import { encryptSecret, decryptSecret } from '../src/lib/secret-box.js';
import {
  RESERVE_BUDGET,
  SETTLE_BUDGET,
  RELEASE_LOCK,
  budgetKey,
  reserveMicros,
} from '../src/services/ai-preview-cost.js';
import { env } from '../src/env.js';
import douglas from './fixtures/ai-douglas-permissions.json';
import { aiAccess, authorizedAiContext } from '../src/services/ai-preview-access.js';
const scope = {
  from: '2026-11-10',
  to: '2026-11-12',
  offer: '',
  query: '',
  level: 'campaigns' as const,
};
const fixture = () => ({
  companyId: '00000000-0000-4000-8000-000000000001',
  fetchedAt: '2026-11-12T12:00:00Z',
  offers: [
    { id: 'a', name: 'PJR_ENG' },
    { id: 'b', name: 'PJR_ESP' },
  ],
  classification: { campaigns: {}, links: { PJR_ENG: 'a' } },
  snapshot: {
    fetchedAt: '2026-11-12T12:00:00Z',
    from: '2026-08-01',
    to: '2026-11-12',
    accounts: [],
    campaigns: [],
    insights: [],
    failures: [],
  },
  sales: [
    {
      offer_id: 'a',
      date: '2026-11-11',
      currency: 'USD',
      order_kind: 'upsell',
      count: 2,
      gross_minor: '7000',
    },
    {
      offer_id: 'b',
      date: '2026-11-11',
      currency: 'BRL',
      order_kind: 'front',
      count: 1,
      gross_minor: '5000',
    },
    {
      offer_id: 'outsider',
      date: '2026-11-11',
      currency: 'USD',
      order_kind: 'front',
      count: 99,
      gross_minor: '99999',
    },
  ],
  reversals: [
    { offer_id: 'a', date: null, currency: 'USD', kind: 'refund', count: 1, amount_minor: '3500' },
  ],
  optimizations: [],
});
beforeEach(() => vi.stubEnv('TMX_LOCAL_AI_PREVIEW', '1'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  files.clear();
  env.NODE_ENV = 'test';
});
const settingsBody = () => ({
  companyId: fixture().companyId,
  revision: '',
  instructions: 'Responda curto',
  enabled: true,
  dailyLimitCents: 500,
  apiKey: 'sk-test-not-a-real-secret-key',
});
const chatBody = () => ({
  companyId: fixture().companyId,
  requestId: randomUUID(),
  question: 'Analise',
  scope,
});
const memberState = (): MemberState => ({
  ...douglas,
  tools: [...douglas.tools, 'nav:ai-assistant'],
  offers: ['a'],
});
function memoryRedis() {
  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  return {
    values,
    lists,
    get: async (k: string) => values.get(k) ?? null,
    set: async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && values.has(k)) return null;
      values.set(k, v);
      return 'OK';
    },
    del: async (k: string) => Number(values.delete(k)),
    expire: async () => 1,
    lrange: async (k: string) => lists.get(k) ?? [],
    lpush: async (k: string, v: string) => {
      lists.set(k, [v, ...(lists.get(k) ?? [])]);
      return 1;
    },
    ltrim: async () => 'OK',
    eval: async (script: string, _count: number, ...args: (string | number)[]) => {
      const [key, other, a, b] = args.map(String);
      if (script === RELEASE_LOCK) {
        if (values.get(key) === other) values.delete(key);
        return 1;
      }
      if (script === RESERVE_BUDGET) {
        if (values.has(other)) return -1;
        const used = Number(values.get(key) ?? 0);
        if (used + Number(a) > Number(b)) return 0;
        values.set(key, String(used + Number(a)));
        values.set(other, a);
        return 1;
      }
      if (script === SETTLE_BUDGET) {
        if (!values.has(other)) return 0;
        values.set(
          key,
          String(Number(values.get(key) ?? 0) + Number(a) - Number(values.get(other))),
        );
        values.delete(other);
        return 1;
      }
      throw Error('unexpected script');
    },
  };
}
it('rejects invalid dates, reversed ranges and extra input capabilities', () => {
  for (const input of [
    { ...scope, from: '2026-02-30' },
    { ...scope, from: '2026-12-01' },
    { ...scope, sql: 'select *' },
    { ...scope, from: '2020-01-01' },
  ])
    expect(aiScopeSchema.safeParse(input).success).toBe(false);
});
it('whitelists data, isolates company offers and does not mix currencies or undated refunds', () => {
  const raw = fixture();
  Object.assign(raw, { finance: { salary: 'PRIVATE_SALARY' }, email: 'PRIVATE_EMAIL' });
  Object.assign(raw.sales[0], { buyer: 'PRIVATE_BUYER' });
  const result = buildAiContext(raw, scope);
  expect(result.sales).toHaveLength(2);
  expect(result.sales.map((s) => s.currency)).toEqual(['USD', 'BRL']);
  expect(result.reversals).toEqual([]);
  expect(result.undatedReversals[0].count).toBe(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  expect(JSON.stringify(result)).not.toContain('99999');
  expect(buildAiContext(raw, { ...scope, offer: 'PJR_ENG' }).sales).toHaveLength(1);
  expect(buildAiContext(raw, { ...scope, offer: 'UNKNOWN' }).sales).toEqual([]);
});
it('marks dates outside Meta coverage incomplete instead of presenting zero', () => {
  const result = buildAiContext(fixture(), { ...scope, to: '2026-11-13' });
  expect(result.incomplete).toBe(true);
  expect(result.totals).toBeNull();
});
it('does not present cached pending Meta data as current totals', () => {
  const result = buildAiContext({ ...fixture(), trafficStale: true }, scope);
  expect(result.incomplete).toBe(true);
  expect(result.totals).toBeNull();
  expect(result.warnings.join(' ')).toContain('nova consulta Meta está pendente');
});
it('uses Brazil dates for optimization history and removes actor identifiers', () => {
  const raw = fixture();
  (raw.optimizations as unknown[]).push({
    id: 'job',
    at: '2026-11-12T01:00:00Z',
    actorId: 'PRIVATE_ACTOR',
    level: 'campaigns',
    itemId: '123',
    name: 'PJR_ENG',
    accountId: 'act_1',
    currency: 'USD',
    budgetField: 'daily_budget',
    before: { status: 'ACTIVE', budget: 3900 },
    after: { status: 'PAUSED', budget: 3861 },
  });
  const result = buildAiContext(raw, { ...scope, from: '2026-11-11', to: '2026-11-11' });
  expect(result.history).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ACTOR');
  expect(result.history[0].afterMetrics).toBeNull();
});
it('accepts completed provider text and refuses incomplete or empty output', () => {
  expect(
    extractAiAnswer({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Resumo' }] }],
    }).answer,
  ).toBe('Resumo');
  expect(() => extractAiAnswer({ status: 'incomplete', output: [] })).toThrow();
  expect(() => extractAiAnswer({ status: 'completed', output: [] })).toThrow();
});
type MemberState = {
  status: string;
  tools: string[];
  offers: string[];
  all_offers: boolean;
  role: string;
  accountTools?: string[];
};
async function app(redis?: unknown, member?: MemberState) {
  files.set(
    join(homedir(), '.codex/local-data/tmx/ai-preview/data.json'),
    JSON.stringify(fixture()),
  );
  files.set(
    join(homedir(), '.codex/local-data/tmx/ai-preview/company.json'),
    JSON.stringify({ companyId: fixture().companyId }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  const server = Fastify();
  server.decorate('redis', redis ?? memoryRedis());
  server.addHook('preHandler', async (req) => {
    if (req.headers['x-user'])
      req.user = {
        sub: String(req.headers['x-user']),
        role: String(req.headers['x-role'] ?? 'admin'),
      };
  });
  server.decorate('userStore', {
    maybeGetById: async (id: string) =>
      id === 'admin'
        ? { id, role: 'admin' }
        : id === 'douglas' && member
          ? { id, role: 'user', allowedTools: member.accountTools }
          : null,
  });
  server.decorate('db', async (parts: TemplateStringsArray, ...values: unknown[]) => {
    if (values[0] !== fixture().companyId) return [];
    if (parts.join('').includes('FROM company_memberships'))
      return values[1] === 'admin'
        ? [{ role: 'owner', status: 'active', tools: [], all_offers: true }]
        : values[1] === 'douglas' && member
          ? [member]
          : [];
    return (values[1] === true ? ['a', 'b'] : (member?.offers ?? [])).map((offer_id) => ({
      offer_id,
    }));
  });
  registerAiPreview(server);
  await server.ready();
  return server;
}
it('blocks unauthenticated users and users without company membership', async () => {
  const server = await app();
  try {
    for (const headers of [{}, { 'x-user': 'outsider' }])
      expect(
        (await server.inject({ url: '/meta-control/traffic/ai/settings', headers })).statusCode,
      ).toBe(headers['x-user'] ? 403 : 401);
  } finally {
    await server.close();
  }
});
it('saves encrypted settings, never returns key and rejects stale revisions', async () => {
  const server = await app();
  const headers = { 'x-user': 'admin' };
  const url = '/meta-control/traffic/ai/settings';
  try {
    const key = 'sk-test-secret-value-not-a-real-key';
    const result = await server.inject({
      method: 'PUT',
      url,
      headers,
      payload: { ...settingsBody(), instructions: 'Seja direto', apiKey: key },
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).not.toContain(key);
    expect([...files.values()].join('')).not.toContain(key);
    expect((await server.inject({ url, headers })).json().instructions).toBe('Seja direto');
    expect(
      (
        await server.inject({
          method: 'PUT',
          url,
          headers,
          payload: { ...settingsBody(), instructions: 'stale', enabled: false },
        })
      ).statusCode,
    ).toBe(409);
    const other = '00000000-0000-4000-8000-000000000002';
    expect(
      (
        await server.inject({
          method: 'PUT',
          url,
          headers,
          payload: { ...settingsBody(), companyId: other, enabled: false },
        })
      ).statusCode,
    ).toBe(403);
    files.set(
      join(homedir(), '.codex/local-data/tmx/ai-preview/data.json'),
      JSON.stringify({ ...fixture(), companyId: other }),
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/context',
          headers,
          payload: scope,
        })
      ).statusCode,
    ).toBe(422);
    files.set(
      join(homedir(), '.codex/local-data/tmx/ai-preview/company.json'),
      JSON.stringify({ companyId: other }),
    );
    expect((await server.inject({ url, headers })).statusCode).toBe(403);
    files.set(
      join(homedir(), '.codex/local-data/tmx/ai-preview/data.json'),
      JSON.stringify(fixture()),
    );
    files.set(
      join(homedir(), '.codex/local-data/tmx/ai-preview/company.json'),
      JSON.stringify({ companyId: fixture().companyId }),
    );
    expect((await server.inject({ url, headers })).json().configured).toBe(true);
  } finally {
    await server.close();
  }
});
it('requires a key and never calls model when disabled', async () => {
  const server = await app();
  const headers = { 'x-user': 'admin' };
  try {
    expect(
      (
        await server.inject({
          method: 'PUT',
          url: '/meta-control/traffic/ai/settings',
          headers,
          payload: { ...settingsBody(), apiKey: undefined },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload: chatBody(),
        })
      ).statusCode,
    ).toBe(409);
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith('/refresh'))).toBe(
      true,
    );
  } finally {
    await server.close();
  }
});
it('sends only the sanitized company context, without action tools, and saves scoped conversation', async () => {
  const headers = { 'x-user': 'admin' };
  const redis = memoryRedis();
  const server = await app(redis);
  try {
    await server.inject({
      method: 'PUT',
      url: '/meta-control/traffic/ai/settings',
      headers,
      payload: settingsBody(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => {
        if (String(_url).endsWith('/input-tokens'))
          return new Response(JSON.stringify({ input_tokens: 1200 }));
        const body = JSON.parse(String(options.body));
        expect(body.store).toBe(false);
        expect(body.tools).toBeUndefined();
        expect(body.instructions).toContain('somente leitura');
        const input = JSON.parse(body.input[0].content);
        expect(input.data.companyId).toBe(fixture().companyId);
        expect(input.data.sales).toHaveLength(2);
        expect(body.service_tier).toBe('default');
        expect(body.prompt_cache_options).toEqual({ mode: 'explicit' });
        return new Response(
          JSON.stringify({
            model: 'gpt-6.1-sol',
            service_tier: 'default',
            usage: {
              input_tokens: 1200,
              output_tokens: 200,
              total_tokens: 1400,
              input_tokens_details: { cached_tokens: 400, cache_write_tokens: 500 },
            },
            status: 'completed',
            output: [
              { type: 'message', content: [{ type: 'output_text', text: 'Resposta de teste' }] },
            ],
          }),
        );
      }),
    );
    const { scope: _scope, ...payload } = chatBody();
    const result = await server.inject({
      method: 'POST',
      url: '/meta-control/traffic/ai/chat',
      headers,
      payload,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().answer).toBe('Resposta de teste');
    expect([...redis.lists.keys()]).toEqual([`tmx-ai-preview:chat:${fixture().companyId}:admin`]);
    expect(result.json().costMicros).toBe(3890);
    expect(Number(redis.values.get(budgetKey(fixture().companyId)))).toBe(3890);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload,
        })
      ).json(),
    ).toEqual(result.json());
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await server.close();
  }
});
it('reads only the authenticated user history within the provisioned company', async () => {
  const redis = memoryRedis();
  const server = await app(redis);
  const company = fixture().companyId;
  const record = (id: string) =>
    JSON.stringify({ id, companyId: company, at: new Date().toISOString() });
  redis.lists.set(`tmx-ai-preview:chat:${company}:admin`, [record('own')]);
  redis.lists.set(`tmx-ai-preview:chat:${company}:other-user`, [record('private-other')]);
  redis.lists.set('tmx-ai-preview:chat:another-company:admin', [record('private-company')]);
  try {
    const result = await server.inject({
      url: '/meta-control/traffic/ai/history?userId=other-user',
      headers: { 'x-user': 'admin' },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().items.map((v: { id: string }) => v.id)).toEqual(['own']);
  } finally {
    await server.close();
  }
});
it('cryptographically binds each key to its company', () => {
  const encrypted = encryptSecret('secret', companyKey('master', 'company-a'));
  expect(decryptSecret(encrypted, companyKey('master', 'company-a'))).toBe('secret');
  expect(() => decryptSecret(encrypted, companyKey('master', 'company-b'))).toThrow();
});
it('uses Douglas areas and only his granted offers, without traffic, refunds or settings', async () => {
  const member = memberState(),
    server = await app(undefined, member),
    headers = { 'x-user': 'douglas', 'x-role': 'admin' };
  try {
    const status = (
      await server.inject({ url: '/meta-control/traffic/ai/status', headers })
    ).json();
    expect(status.offers.map((o: { id: string }) => o.id)).toEqual(['a']);
    expect(status.canManage).toBe(false);
    expect(status.instructions).toBeUndefined();
    expect(status.consumedMicros).toBeUndefined();
    const result = await server.inject({
      method: 'POST',
      url: '/meta-control/traffic/ai/context',
      headers,
      payload: scope,
    });
    expect(result.statusCode).toBe(200);
    const d = result.json();
    expect(d.sales).toHaveLength(1);
    expect(d.sales[0].offerId).toBe('a');
    expect(d.rows).toEqual([]);
    expect(d.totals).toBeNull();
    expect(d.reversals).toEqual([]);
    expect(d.undatedReversals).toEqual([]);
    expect(d.history).toEqual([]);
    expect(d.incomplete).toBeNull();
    expect(d.metaFetchedAt).toBeNull();
    expect(d.warnings.join(' ')).not.toMatch(/consulta Meta|Cobertura Meta/);
    expect(d.permissionNotice).toContain('não indica cobertura incompleta');
    expect(d.availableAreas).toEqual({
      media: false,
      sales: true,
      upsells: true,
      reversals: false,
      optimizations: false,
    });
    expect(result.body).not.toContain('PJR_ESP');
    expect(result.body).not.toContain('99999');
    for (const [method, path] of [
      ['GET', 'settings'],
      ['PUT', 'settings'],
      ['POST', 'refresh'],
    ] as const)
      expect(
        (
          await server.inject({
            method,
            url: '/meta-control/traffic/ai/' + path,
            headers,
            payload: method === 'PUT' ? settingsBody() : undefined,
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/context',
          headers,
          payload: { ...scope, offer: 'PJR_ESP' },
        })
      ).statusCode,
    ).toBe(422);
    member.tools = member.tools.filter((t) => t !== 'nav:ai-assistant');
    for (const path of ['status', 'history', 'settings'])
      expect(
        (await server.inject({ url: '/meta-control/traffic/ai/' + path, headers })).statusCode,
      ).toBe(403);
  } finally {
    await server.close();
  }
});
it('fails closed for suspended members, account ceilings and unavailable database', async () => {
  const member = memberState(),
    server = await app(undefined, member),
    headers = { 'x-user': 'douglas' };
  try {
    member.status = 'suspended';
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/status', headers })).statusCode,
    ).toBe(403);
    member.status = 'active';
    member.accountTools = ['nav:scoped', 'ofertas', 'nav:overview'];
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/status', headers })).statusCode,
    ).toBe(403);
    member.accountTools = undefined;
    server.db = null;
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/status', headers })).statusCode,
    ).toBe(403);
  } finally {
    await server.close();
  }
});
it('filters media and optimization history by confirmed offer, excluding unknown and foreign campaigns', async () => {
  const member = memberState();
  member.tools.push('nav:traffic-campaigns');
  const server = await app(undefined, member);
  try {
    const raw = fixture();
    const campaign = (id: string, name: string) => ({
      id,
      name,
      accountId: 'act_1',
      status: 'ACTIVE',
      effectiveStatus: 'ACTIVE',
      objective: 'SALES',
      createdAt: null,
      updatedAt: null,
    });
    const insight = (id: string) => ({
      campaignId: id,
      accountId: 'act_1',
      date: '2026-11-11',
      currency: 'BRL',
      spend: '100',
      impressions: '1000',
      linkClicks: '30',
      actions: [],
    });
    Object.assign(raw.snapshot, {
      accounts: [
        {
          id: 'act_1',
          name: 'Account',
          businessId: null,
          businessName: null,
          currency: 'BRL',
          timezone: 'America/Sao_Paulo',
        },
      ],
      campaigns: [
        campaign('1', 'PJR_ENG_ALLOWED'),
        campaign('2', 'PJR_ESP_FORBIDDEN'),
        campaign('3', 'UNKNOWN_FORBIDDEN'),
      ],
      insights: [insight('1'), insight('2'), insight('3')],
    });
    raw.classification.campaigns = { '1': 'PJR_ENG', '2': 'PJR_ESP' };
    Object.assign(raw, {
      optimizations: ['1', '2'].map((id) => ({
        id,
        at: '2026-11-11T12:00:00Z',
        actorId: 'PRIVATE_OPERATOR',
        level: 'campaigns',
        itemId: id,
        name: id === '1' ? 'PJR_ENG_ALLOWED' : 'FORBIDDEN_OPTIMIZATION',
        accountId: 'act_1',
        currency: 'BRL',
        budgetField: null,
        before: { status: 'ACTIVE', budget: null },
        after: { status: 'PAUSED', budget: null },
      })),
    });
    const access = await aiAccess(server, raw.companyId, 'douglas'),
      context = authorizedAiContext(raw, scope, access);
    expect(context.rows).toHaveLength(1);
    expect(context.history).toHaveLength(1);
    expect(context.totals?.spend).toBe(100);
    expect(JSON.stringify(context)).not.toContain('FORBIDDEN');
    expect(JSON.stringify(context)).not.toContain('PRIVATE_OPERATOR');
    member.tools = member.tools.filter((t) => t !== 'nav:traffic-campaigns');
    member.tools.push('nav:ads-intelligence');
    const adsOnly = authorizedAiContext(
      raw,
      scope,
      await aiAccess(server, raw.companyId, 'douglas'),
    );
    expect(adsOnly.scope.level).toBe('ads');
    expect(adsOnly.history).toEqual([]);
  } finally {
    await server.close();
  }
});
it('removes revoked grants from history, cached responses and provider context', async () => {
  const member = memberState(),
    redis = memoryRedis(),
    server = await app(redis, member),
    headers = { 'x-user': 'douglas' };
  try {
    await server.inject({
      method: 'PUT',
      url: '/meta-control/traffic/ai/settings',
      headers: { 'x-user': 'admin' },
      payload: settingsBody(),
    });
    const inputs: Record<string, any>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        const body = JSON.parse(String(options?.body));
        inputs.push(JSON.parse(body.input[0].content));
        return new Response(
          JSON.stringify(
            String(url).endsWith('/input-tokens')
              ? { input_tokens: 100 }
              : {
                  status: 'completed',
                  usage: { input_tokens: 100, output_tokens: 10 },
                  output: [
                    {
                      type: 'message',
                      content: [{ type: 'output_text', text: 'AUTHORIZED_A_ONLY' }],
                    },
                  ],
                },
          ),
        );
      }),
    );
    const payload = chatBody();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(JSON.stringify(inputs)).not.toContain('PJR_ESP');
    expect(JSON.stringify(inputs)).not.toContain('99999');
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/history', headers })).json().items,
    ).toHaveLength(1);
    member.offers = ['b'];
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/history', headers })).json().items,
    ).toEqual([]);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload: chatBody(),
        })
      ).statusCode,
    ).toBe(200);
    expect(inputs.at(-1)!.previousConversation).toEqual([]);
    expect(JSON.stringify(inputs.at(-1)!.data)).not.toContain('PJR_ENG');
    member.tools = member.tools.filter(
      (t) =>
        ![
          'nav:overview',
          'nav:tracking-overview',
          'nav:tracking-journey',
          'nav:tracking-upsell-intelligence',
        ].includes(t),
    );
    expect(
      (await server.inject({ url: '/meta-control/traffic/ai/history', headers })).json().items,
    ).toEqual([]);
    const d = (
      await server.inject({
        method: 'POST',
        url: '/meta-control/traffic/ai/context',
        headers,
        payload: scope,
      })
    ).json();
    expect(d.sales).toEqual([]);
  } finally {
    await server.close();
  }
});
it.each(['preflight', 'generation'])(
  'does not disclose a response after permissions change during %s',
  async (phase) => {
    const member = memberState(),
      redis = memoryRedis(),
      server = await app(redis, member),
      headers = { 'x-user': 'douglas' };
    try {
      await server.inject({
        method: 'PUT',
        url: '/meta-control/traffic/ai/settings',
        headers: { 'x-user': 'admin' },
        payload: settingsBody(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => {
          const counting = String(url).endsWith('/input-tokens');
          if (counting === (phase === 'preflight')) member.offers = [];
          return new Response(
            JSON.stringify(
              counting
                ? { input_tokens: 100 }
                : {
                    status: 'completed',
                    usage: { input_tokens: 100, output_tokens: 10 },
                    output: [
                      {
                        type: 'message',
                        content: [{ type: 'output_text', text: 'MUST_NOT_DISCLOSE' }],
                      },
                    ],
                  },
            ),
          );
        }),
      );
      const result = await server.inject({
        method: 'POST',
        url: '/meta-control/traffic/ai/chat',
        headers,
        payload: chatBody(),
      });
      expect(result.statusCode).toBe(403);
      expect(result.body).not.toContain('MUST_NOT_DISCLOSE');
      expect(redis.lists.size).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(phase === 'preflight' ? 1 : 2);
    } finally {
      await server.close();
    }
  },
);
it('refuses foreign origins and foreign company chat before contacting the provider', async () => {
  const server = await app();
  try {
    expect(
      (
        await server.inject({
          url: '/meta-control/traffic/ai/settings',
          headers: { 'x-user': 'admin', origin: 'https://outsider.example' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers: { 'x-user': 'admin' },
          payload: { ...chatBody(), companyId: '00000000-0000-4000-8000-000000000002' },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await server.close();
  }
});
it('stops before generation when the company budget is exhausted', async () => {
  const redis = memoryRedis();
  const server = await app(redis);
  const headers = { 'x-user': 'admin' };
  try {
    await server.inject({
      method: 'PUT',
      url: '/meta-control/traffic/ai/settings',
      headers,
      payload: settingsBody(),
    });
    redis.values.set(budgetKey(fixture().companyId), '5000000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ input_tokens: 1200 }))),
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload: chatBody(),
        })
      ).statusCode,
    ).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(redis.values.get(budgetKey(fixture().companyId))).toBe('5000000');
  } finally {
    await server.close();
  }
});
it('retains uncertain reservations and never repeats a timed-out generation', async () => {
  const redis = memoryRedis();
  const server = await app(redis);
  const headers = { 'x-user': 'admin' };
  try {
    await server.inject({
      method: 'PUT',
      url: '/meta-control/traffic/ai/settings',
      headers,
      payload: settingsBody(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (String(url).endsWith('/input-tokens'))
          return new Response(JSON.stringify({ input_tokens: 1200 }));
        throw Error('timeout');
      }),
    );
    const payload = chatBody();
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(502);
    expect(Number(redis.values.get(budgetKey(fixture().companyId)))).toBe(reserveMicros(1200));
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/meta-control/traffic/ai/chat',
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await server.close();
  }
});
it('removes only the current company key and disables generation', async () => {
  const server = await app();
  const headers = { 'x-user': 'admin' };
  const url = '/meta-control/traffic/ai/settings';
  try {
    const created = (
      await server.inject({ method: 'PUT', url, headers, payload: settingsBody() })
    ).json();
    const removed = await server.inject({
      method: 'PUT',
      url,
      headers,
      payload: {
        ...settingsBody(),
        revision: created.revision,
        apiKey: undefined,
        enabled: false,
        removeKey: true,
      },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().configured).toBe(false);
    expect(removed.json().enabled).toBe(false);
  } finally {
    await server.close();
  }
});
it('requires authentication for the production assistant', async () => {
  env.NODE_ENV = 'production';
  const server = Fastify();
  registerAiPreview(server);
  expect((await server.inject('/meta-control/traffic/ai/settings')).statusCode).toBe(401);
  await server.close();
});
it('requires the explicit local pilot flag even in test mode', async () => {
  vi.stubEnv('TMX_LOCAL_AI_PREVIEW', '');
  const server = Fastify();
  registerAiPreview(server);
  expect((await server.inject('/meta-control/traffic/ai/settings')).statusCode).toBe(404);
  await server.close();
});
it('migrates the existing encrypted local key without exposing it or losing instructions', async () => {
  const server = await app();
  const root = join(homedir(), '.codex/local-data/tmx/ai-preview');
  const master = 'test-master-secret';
  const key = 'sk-test-key-for-migration-only';
  files.set(join(root, 'secret'), master);
  files.set(
    join(root, `config-${fixture().companyId}.json`),
    JSON.stringify({
      revision: 'legacy',
      instructions: 'Keep these rules',
      enabled: true,
      encryptedKey: encryptSecret(key, master),
    }),
  );
  try {
    const result = await server.inject({
      url: '/meta-control/traffic/ai/settings',
      headers: { 'x-user': 'admin' },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().instructions).toBe('Keep these rules');
    expect(result.body).not.toContain(key);
    const saved = JSON.parse(files.get(join(root, `config-${fixture().companyId}.json`))!);
    expect(saved.keyVersion).toBe(1);
    expect(saved.companyId).toBe(fixture().companyId);
    expect(decryptSecret(saved.encryptedKey, companyKey(master, fixture().companyId))).toBe(key);
  } finally {
    await server.close();
  }
});
