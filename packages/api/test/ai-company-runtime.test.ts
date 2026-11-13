import Fastify, { type FastifyInstance } from 'fastify';
import postgres, { type Sql } from 'postgres';
import Redis from 'ioredis';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({
  env: { NODE_ENV: 'production', TRACKING_ENCRYPTION_KEY: 'isolated-ai-test-encryption-master' },
}));
import { registerAiPreview, companyKey } from '../src/services/ai-preview.js';
import { aiCompanyRuntime } from '../src/services/ai-company-runtime.js';
import { aiAccess } from '../src/services/ai-preview-access.js';
import { decryptSecret } from '../src/lib/secret-box.js';
import douglas from './fixtures/ai-douglas-permissions.json';

describe.skipIf(!process.env.AI_TEST_DATABASE_URL)('isolated company AI integration', () => {
  const a = '00000000-0000-4000-8000-000000000001',
    b = '00000000-0000-4000-8000-000000000002';
  const base = '/meta-control/traffic/ai';
  const scope = { from: '2026-11-11', to: '2026-11-12', offer: '', query: '', level: 'campaigns' };
  let sql: Sql, redis: Redis, child: ChildProcess, directory: string, app: FastifyInstance;
  const provider = vi.fn();
  const servers: FastifyInstance[] = [];
  async function server() {
    const s = Fastify();
    servers.push(s);
    s.decorate('db', sql);
    s.decorate('redis', redis);
    s.decorate('userStore', {
      maybeGetById: async (id: string) =>
        ['owner', 'douglas', 'colleague', 'both'].includes(id)
          ? { id, role: id === 'owner' ? 'admin' : 'user' }
          : null,
    });
    s.decorate('offerStore', { get: async (id: string) => ({ id, name: id }) });
    s.addHook('onRequest', async (req) => {
      const sub = req.headers['x-test-user'];
      if (typeof sub === 'string')
        req.user = { sub, role: sub === 'owner' ? 'admin' : 'user' } as typeof req.user;
    });
    s.setErrorHandler((error, _req, reply) =>
      reply.code((error as { status?: number }).status ?? 400).send({ detail: error.message }),
    );
    registerAiPreview(s);
    await s.ready();
    return s;
  }
  const headers = (user = 'owner') => ({ 'x-test-user': user, origin: 'https://theminex.com' });
  async function settings(company = a, key = 'sk-isolated-company-a-not-real') {
    return app.inject({
      method: 'PUT',
      url: base + '/settings',
      headers: headers(),
      payload: {
        companyId: company,
        revision: '',
        instructions: 'Somente leitura',
        enabled: true,
        dailyLimitCents: 500,
        apiKey: key,
      },
    });
  }
  const ask = (user: string, company = a, requestId = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: base + '/chat',
      headers: headers(user),
      payload: { companyId: company, requestId, question: 'Mostre os dados autorizados', scope },
    });
  beforeAll(async () => {
    const url =
      process.env.AI_TEST_DATABASE_URL ??
      'postgres://tmx_tasks_test:synthetic-native-only@127.0.0.1:32768/tmx_ai_test';
    const target = new URL(url);
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/tmx_ai_test')
      throw Error('Dedicated local AI test database required');
    sql = postgres(url, { max: 1, onnotice: () => {} });
    const schema = 'ai_' + randomUUID().replaceAll('-', '');
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    await sql.unsafe(`SET search_path TO ${schema}`);
    await sql.unsafe(
      `CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE company_memberships(company_id uuid,user_id text,role text,status text,tools jsonb,all_offers boolean);CREATE TABLE company_offers(company_id uuid,offer_id text);CREATE TABLE company_offer_grants(company_id uuid,offer_id text,user_id text);CREATE TABLE tracking_projects(id text,offer_id text);CREATE TABLE tracking_orders(project_id text,status text,paid_at timestamptz,currency text,order_kind text,amount_minor bigint,refunded_at timestamptz,chargeback_at timestamptz);`,
    );
    await sql.unsafe(
      await readFile(new URL('../migrations/121_company_ai.sql', import.meta.url), 'utf8'),
    );
    await sql`CREATE TABLE exchange_rate_cache(base_currency text,target_currency text,rate numeric,fetched_at timestamptz)`;
    await sql`INSERT INTO exchange_rate_cache VALUES('USD','BRL',5,now())`;
    await sql.unsafe(`ALTER TABLE tracking_orders ADD COLUMN id text, ADD COLUMN provider text, ADD COLUMN buyer jsonb, ADD COLUMN visitor_id text;
      CREATE TABLE tracking_upsell_stages(id text,project_id text,stage_key text,name text,enabled boolean);
      CREATE TABLE tracking_upsell_manual_test_results(project_id text,order_id text,stage_id text,result text,checked_at timestamptz);`);
    await sql.unsafe(await readFile(new URL('../migrations/122_company_ai_learning.sql', import.meta.url), 'utf8'));
    directory = await mkdtemp('/tmp/tmx-ai-company-test-');
    child = spawn(
      'redis-server',
      [
        '--port',
        '0',
        '--unixsocket',
        join(directory, 'redis.sock'),
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { stdio: 'pipe' },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdout!.on('data', (v) => {
        if (/ready to accept connections/i.test(String(v))) resolve();
      });
    });
    redis = new Redis(join(directory, 'redis.sock'));
    await redis.ping();
  }, 15000);
  beforeEach(async () => {
    await sql.unsafe(
      'TRUNCATE tracking_upsell_stages,tracking_upsell_manual_test_results,company_ai_optimizations,company_ai_settings,companies,company_memberships,company_offers,company_offer_grants,tracking_projects,tracking_orders CASCADE',
    );
    await redis.flushdb();
    await sql`INSERT INTO companies VALUES(${a},'A'),(${b},'B')`;
    const tools = [...douglas.tools, 'nav:ai-assistant'];
    for (const company of [a, b])
      await sql`INSERT INTO company_memberships VALUES(${company},'owner','owner','active','[]',true),(${company},'both','member','active',${sql.json(tools)},true)`;
    for (const user of ['douglas', 'colleague'])
      await sql`INSERT INTO company_memberships VALUES(${a},${user},'member','active',${sql.json(tools)},false)`;
    await sql`INSERT INTO company_offers VALUES(${a},'PJR_ENG'),(${a},'PJR_FR'),(${b},'FOREIGN')`;
    await sql`INSERT INTO company_offer_grants VALUES(${a},'PJR_ENG','douglas'),(${a},'PJR_ENG','colleague')`;
    await sql`INSERT INTO tracking_projects VALUES('p1','PJR_ENG'),('p2','PJR_FR'),('p3','FOREIGN')`;
    await sql`INSERT INTO tracking_orders(project_id,status,paid_at,currency,order_kind,amount_minor,refunded_at,chargeback_at) VALUES('p1','paid','2026-11-12T12:00:00Z','USD','upsell',3500,null,null),('p2','paid','2026-11-12T12:00:00Z','USD','front',99999,null,null),('p3','paid','2026-11-12T12:00:00Z','USD','front',88888,null,null)`;
    provider.mockReset();
    provider.mockImplementation(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('input_tokens')
              ? { input_tokens: 100 }
              : {
                  status: 'completed',
                  model: 'gpt-6.1-sol',
                  service_tier: 'default',
                  output: [
                    {
                      type: 'message',
                      content: [{ type: 'output_text', text: 'Resposta de teste' }],
                    },
                  ],
                  usage: {
                    input_tokens: 100,
                    output_tokens: 10,
                    total_tokens: 110,
                    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  },
                },
          ),
          { headers: { 'x-request-id': 'isolated-provider' } },
        ),
    );
    vi.stubGlobal('fetch', provider);
    app = await server();
  });
  afterEach(async () => {
    for (const s of servers.splice(0)) await s.close();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    if (sql) {
      const [r] = await sql`SELECT current_schema() AS name`;
      if (/^ai_[a-f0-9]+$/.test(r.name)) await sql.unsafe(`DROP SCHEMA ${r.name} CASCADE`);
      await sql.end();
    }
    if (redis) await redis.quit();
    if (child) {
      const done = new Promise((r) => child.once('exit', r));
      child.kill();
      await done;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('lists only authorized companies and denies foreign membership, revoked AI and settings', async () => {
    const s = await app.inject({ url: base + '/status', headers: headers('douglas') });
    expect(s.statusCode).toBe(200);
    expect(s.json().companies.map((c: { id: string }) => c.id)).toEqual([a]);
    expect(s.json().offers.map((o: { id: string }) => o.id)).toEqual(['PJR_ENG']);
    for (const path of [
      '/status?companyId=' + b,
      '/history?companyId=' + b,
      '/settings?companyId=' + a,
    ])
      expect((await app.inject({ url: base + path, headers: headers('douglas') })).statusCode).toBe(
        403,
      );
    await sql`UPDATE company_memberships SET tools=${sql.json(douglas.tools)} WHERE user_id='douglas'`;
    expect(
      (await app.inject({ url: base + '/status', headers: headers('douglas') })).statusCode,
    ).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it('keeps persisted credentials company-bound after server restart and rejects stale writes', async () => {
    expect((await settings()).statusCode).toBe(200);
    expect((await settings(b, 'sk-isolated-company-b-not-real')).statusCode).toBe(200);
    const rows =
      await sql`SELECT company_id::text,config FROM company_ai_settings ORDER BY company_id`;
    expect(JSON.stringify(rows)).not.toContain('sk-isolated');
    expect(
      decryptSecret(
        rows[0].config.encryptedKey,
        companyKey('isolated-ai-test-encryption-master', a),
      ),
    ).toBe('sk-isolated-company-a-not-real');
    expect(() =>
      decryptSecret(
        rows[0].config.encryptedKey,
        companyKey('isolated-ai-test-encryption-master', b),
      ),
    ).toThrow();
    expect((await settings()).statusCode).toBe(409);
    const reopened = await server();
    const result = await reopened.inject({
      url: base + '/settings?companyId=' + a,
      headers: headers(),
    });
    expect(result.json().configured).toBe(true);
    expect(result.body).not.toContain('encryptedKey');
    expect(result.body).not.toContain('sk-isolated');
  });
  it('enforces CAS across server instances and preserves the winning configuration', async () => {
    const runtime = aiCompanyRuntime(app);
    await runtime.saveConfig(a, '', { revision: 'one' });
    const values = await Promise.all(
      ['two', 'three'].map((revision) => runtime.saveConfig(a, 'one', { revision })),
    );
    expect(values.filter(Boolean)).toHaveLength(1);
    expect((await runtime.readConfig(a)).revision).toBe('two');
  });
  it('sends only permitted offer data and area fields to the real provider boundary', async () => {
    await settings();
    const response = await ask('douglas');
    expect(response.statusCode, response.body).toBe(200);
    expect(provider).toHaveBeenCalledTimes(2);
    const [url, options] = provider.mock.calls[1];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options.headers.authorization).toBe('Bearer sk-isolated-company-a-not-real');
    expect(options.headers['x-tmx-ai-secret']).toBeUndefined();
    const body = JSON.parse(options.body),
      data = JSON.parse(body.input[0].content).data;
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(data.offers).toEqual([{ id: 'PJR_ENG', name: 'PJR_ENG' }]);
    expect(data.salesAnalysis.currency).toBe('BRL');
    expect(data.salesAnalysis.byOffer).toEqual([
      { offerId: 'PJR_ENG', name: 'PJR_ENG', count: 1, amountMinor: 17500, missingCurrencies: [],
        byKind: [{ kind: 'upsell', count: 1, amountMinor: 17500, missingCurrencies: [] }] },
    ]);
    expect(data.rows).toEqual([]);
    expect(data.reversals).toEqual([]);
    expect(data.history).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(/99999|88888|FOREIGN|PJR_FR/);
  });
  it('reads upsell intelligence marks and buyer matches without exposing buyers or other offers', async () => {
    await sql`INSERT INTO tracking_upsell_stages VALUES('s1','p1','upsell_1','Etapa 1',true),('s2','p1','upsell_2','Etapa 2',true),('s3','p1','upsell_3','Etapa 3',true),('foreign','p2','upsell_1','Secret stage',true)`;
    await sql`INSERT INTO tracking_orders(project_id,status,paid_at,currency,order_kind,amount_minor,id,provider,buyer) VALUES('p1','paid','2026-11-12T12:00:00Z','USD','front',1000,'f1','vendepay','{"phone":"+55 (11) 999"}'),('p1','paid','2026-11-10T12:00:00Z','USD','front',1000,'old','vendepay','{}')`;
    await sql`UPDATE tracking_orders SET provider='vendepay',buyer='{"phone":"5511999"}' WHERE project_id='p1' AND order_kind='upsell'`;
    await sql`INSERT INTO tracking_upsell_manual_test_results VALUES('p1','f1','s1','failed','2026-11-12T12:30:00Z'),('p1','f1','s2','worked','2026-11-12T12:30:00Z'),('p1','old','s3','failed','2026-11-12T12:30:00Z')`;
    const data = await aiCompanyRuntime(app).loadData(await aiAccess(app,a,'douglas'),{...scope,from:'2026-11-12',to:'2026-11-12'},true);
    expect(data.upsellIntelligence).toHaveLength(4);
    expect(data.upsellIntelligence!.find(r => r.orderId==='f1' && r.stageKey==='upsell_1')).toMatchObject({purchased:true,manualResult:'failed'});
    expect(data.upsellIntelligence!.find(r => r.orderId==='old')).toMatchObject({manualResult:'failed'});
    expect(JSON.stringify(data.upsellIntelligence)).not.toMatch(/Secret stage|5511999|buyer/);
    await settings();
    const reply = await app.inject({method:'POST',url:base+'/chat',headers:headers('douglas'),payload:{companyId:a,requestId:randomUUID(),question:'Quais itens do Upsell Intelligence estão sem marcação hoje?',scope:{...scope,from:'2026-11-12',to:'2026-11-12'}}});
    expect(reply.statusCode,reply.body).toBe(200);
    const sent=JSON.parse(JSON.parse(provider.mock.calls.at(-1)![1].body).input[0].content).data.upsellIntelligence;
    expect(sent.byOffer[0]).toMatchObject({stages:3,updatedStages:3,statuses:{'venda realizada':1,'funcionou':1,'sem marcação':1}});
    expect(JSON.stringify(sent)).not.toMatch(/Secret stage|5511999|buyer/);
  });
  it('separates conversations by user and company and deduplicates retries', async () => {
    await settings();
    await settings(b, 'sk-isolated-company-b-not-real');
    const id = randomUUID();
    expect((await ask('both', a, id)).statusCode).toBe(200);
    expect((await ask('both', a, id)).statusCode).toBe(200);
    expect(provider).toHaveBeenCalledTimes(2);
    const history = async (user: string, company: string) =>
      (
        await app.inject({ url: base + '/history?companyId=' + company, headers: headers(user) })
      ).json().items;
    expect(await history('both', a)).toHaveLength(1);
    expect(await history('both', b)).toEqual([]);
    expect(await history('douglas', a)).toEqual([]);
    expect((await ask('both', b)).statusCode).toBe(200);
    expect(provider.mock.calls.at(-1)![1].headers.authorization).toBe(
      'Bearer sk-isolated-company-b-not-real',
    );
    expect(
      JSON.parse(JSON.parse(provider.mock.calls.at(-1)![1].body).input[0].content)
        .previousConversation,
    ).toEqual([]);
  });
  it('hides earlier history after an offer grant is revoked and blocks suspended members', async () => {
    await settings();
    expect((await ask('douglas')).statusCode).toBe(200);
    await sql`DELETE FROM company_offer_grants WHERE user_id='douglas'`;
    expect(
      (await app.inject({ url: base + '/history', headers: headers('douglas') })).json().items,
    ).toEqual([]);
    await sql`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
    expect((await ask('douglas')).statusCode).toBe(403);
  });
  it('checks changed permissions after preflight before any paid generation', async () => {
    await settings();
    provider.mockImplementationOnce(async () => {
      await sql`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
      return new Response(JSON.stringify({ input_tokens: 100 }));
    });
    expect((await ask('douglas')).statusCode).toBe(403);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('refuses snapshots belonging to another company', async () => {
    const access = await aiAccess(app, a, 'owner');
    await redis.set(
      `traffic-sync:v1:company:${a}:snapshot:2026-08-01:${scope.to}`,
      JSON.stringify({ companyId: b, snapshot: {} }),
    );
    await expect(aiCompanyRuntime(app).loadData(access, scope)).rejects.toThrow('COMPANY_MISMATCH');
  });
  it('keeps learned memory company-scoped and outside ungranted areas', async () => {
    const observation = { eventId: 'event', offerId: 'PJR_ENG', action: 'increase_budget', at: new Date().toISOString(), observedAt: new Date().toISOString(), beforeRoas: 1, afterRoas: 2, beforeSpend: 100, afterSpend: 200 };
    await sql`INSERT INTO company_ai_learning(company_id,event_id,offer_id,observation) VALUES(${a},'event','PJR_ENG',${sql.json(observation)}),(${b},'foreign','FOREIGN',${sql.json({ ...observation, eventId: 'foreign', offerId: 'FOREIGN' })})`;
    const runtime = aiCompanyRuntime(app);
    const owner = await aiAccess(app, a, 'owner');
    const member = await aiAccess(app, a, 'douglas');
    expect((await runtime.loadData(owner, scope)).learning).toEqual([observation]);
    expect((await runtime.loadData(member, scope)).learning).toEqual([]);
  });
  it('persists matured learning without duplicate cases and survives runtime restart', async () => {
    await settings();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const date = (n: number) => new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
    const event = { id: 'mature', at: date(-7) + 'T12:00:00Z', actorId: 'owner', level: 'campaigns', itemId: '123456', name: 'PJR_ENG', accountId: 'act_123456', currency: 'BRL', budgetField: 'daily_budget', before: { status: 'ACTIVE', budget: 10000 }, after: { status: 'ACTIVE', budget: 20000 } };
    await sql`INSERT INTO company_ai_optimizations(company_id,event_id,event,occurred_at) VALUES(${a},'mature',${sql.json(event)},${event.at})`;
    const snapshot = { from: date(-10), to: today, fetchedAt: new Date().toISOString(),
      accounts: [{ id: 'act_123456', name: 'test', businessId: null, businessName: null, currency: 'BRL', timezone: 'America/Sao_Paulo' }],
      campaigns: [{ id: '123456', name: 'PJR_ENG', accountId: 'act_123456', status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: 'OUTCOME_SALES', createdAt: null, updatedAt: null }], failures: [],
      insights: [-10,-9,-8,-6,-5,-4].map(n => ({ campaignId: '123456', accountId: 'act_123456', date: date(n), currency: 'BRL', spend: '100', impressions: '1000', linkClicks: '10', actions: [{ action_type: 'purchase', value: '1' }], actionValues: [{ action_type: 'purchase', value: n < -7 ? '100' : '200' }] })) };
    await redis.set(`traffic-sync:v1:company:${a}:snapshot:2026-08-01:${today}`, JSON.stringify({ companyId: a, snapshot }));
    await aiCompanyRuntime(app).collectOptimizations();
    await aiCompanyRuntime(app).collectOptimizations();
    const learned = await sql`SELECT observation FROM company_ai_learning WHERE company_id=${a}`;
    expect(learned).toHaveLength(1);
    expect(learned[0].observation).toMatchObject({ offerId: 'PJR_ENG', beforeRoas: 1, afterRoas: 2 });
    expect((await aiCompanyRuntime(app).loadData(await aiAccess(app, a, 'owner'), scope)).learning).toHaveLength(1);
  });
  it('retains only enabled company optimization events, deduplicates, and survives malformed jobs', async () => {
    await settings();
    for (const [id, company] of [
      ['one', a],
      ['two', b],
    ]) {
      await redis.zadd('bull:traffic-management-v1:completed', Date.now(), id);
      await redis.hset('bull:traffic-management-v1:' + id, {
        data: JSON.stringify({
          scope: 'company:' + company,
          actor: 'owner',
          level: 'campaigns',
          item: {
            id: '123',
            name: 'PJR_ENG',
            accountId: 'act_123',
            currency: 'USD',
            budgetField: 'daily_budget',
            status: 'ACTIVE',
            budget: 3900,
          },
        }),
        returnvalue: JSON.stringify({ status: 'ACTIVE', budget: 3861 }),
        finishedOn: String(Date.now()),
      });
    }
    await redis.zadd('bull:traffic-management-v1:completed', Date.now(), 'malformed');
    await redis.hset('bull:traffic-management-v1:malformed', {
      data: '{',
      returnvalue: '{}',
      finishedOn: 'bad',
    });
    const runtime = aiCompanyRuntime(app);
    await runtime.collectOptimizations();
    await runtime.collectOptimizations();
    const rows = await sql`SELECT company_id::text,event_id,event FROM company_ai_optimizations`;
    expect(rows).toHaveLength(1);
    expect(rows[0].company_id).toBe(a);
    expect(rows[0].event.after.budget).toBe(3861);
    await redis.del('bull:traffic-management-v1:completed');
    await runtime.collectOptimizations();
    expect(await sql`SELECT event_id FROM company_ai_optimizations`).toHaveLength(1);
  });
});
