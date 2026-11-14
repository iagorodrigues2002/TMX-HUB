import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { membershipTools } from '../lib/company-tools.js';
import { HttpProblem } from '../lib/problem.js';
import type { AiAccess } from './ai-preview-access.js';
import { aiDataSchema, optimizationSchema } from './ai-preview-model.js';
import { learnOptimizationOutcomes } from './ai-optimization-learning.js';
import { archivedTraffic } from './traffic-daily-store.js';
import { companyCreativeSnapshot } from './traffic-server-cache.js';

export function aiCompanyRuntime(app: FastifyInstance) {
  const db = () => {
    if (!app.db) throw new HttpProblem({ status: 503, title: 'Unavailable' });
    return app.db;
  };
  async function companies(userId: string) {
    const user = await app.userStore.maybeGetById(userId);
    if (!user) return [];
    const rows =
      await db()`SELECT c.id::text,c.name,m.role,m.status,m.tools FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE m.user_id=${userId} AND m.status='active' ORDER BY c.name,c.id`;
    return rows
      .filter((m) =>
        membershipTools(
          { role: m.role, status: m.status, tools: m.tools },
          user.allowedTools,
        ).includes('nav:ai-assistant'),
      )
      .map((m) => ({
        id: String(m.id),
        name: String(m.name),
        canManage: user.role === 'admin' && ['owner', 'admin'].includes(m.role),
      }));
  }
  async function resolve(req: FastifyRequest) {
    const choices = await companies(req.user!.sub);
    const query = req.query as { companyId?: unknown };
    const body = req.body as { companyId?: unknown } | undefined;
    const requested = query?.companyId ?? body?.companyId;
    const manager = /\/(settings|refresh)(?:\?|$)/.test(req.url);
    const selected =
      requested === undefined
        ? choices.find((c) => !manager || c.canManage)?.id
        : z.string().uuid().parse(requested);
    if (!selected || !choices.some((c) => c.id === selected))
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Empresa não autorizada para o assistente.',
      });
    return { companyId: selected, companies: choices };
  }
  async function offers(company: string) {
    const rows =
      await db()`SELECT offer_id FROM company_offers WHERE company_id::text=${company} ORDER BY offer_id`;
    return Promise.all(
      rows.map(async (r) => ({
        id: String(r.offer_id),
        name: (await app.offerStore.get(String(r.offer_id))).name,
      })),
    );
  }
  const range = () => ({
    from: '2026-08-01',
    to: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
  });
  async function collectOptimizations() {
    const sql = db();
    const enabled =
      await sql`SELECT company_id::text FROM company_ai_settings WHERE config->>'enabled'='true'`;
    if (!enabled.length) return;
    const companies = new Set(enabled.map((c) => `company:${c.company_id}`));
    const jobs = await app.redis.zrange('bull:traffic-management-v1:completed', -1000, -1);
    const pipeline = app.redis.pipeline();
    for (const id of jobs)
      pipeline.hmget(`bull:traffic-management-v1:${id}`, 'data', 'returnvalue', 'finishedOn');
    const results = await pipeline.exec();
    for (const [index, result] of (results ?? []).entries()) {
      if (result[0]) continue;
      const [input, output, finished] = result[1] as (string | null)[];
      if (!input || !output || !finished) continue;
      let event: ReturnType<typeof optimizationSchema.safeParse>;
      let company: string;
      try {
        const d = JSON.parse(input);
        const r = JSON.parse(output);
        if (!companies.has(d.scope)) continue;
        company = d.scope.slice('company:'.length);
        event = optimizationSchema.safeParse({
          id: jobs[index],
          at: new Date(Number(finished)).toISOString(),
          actorId: d.actor,
          level: d.level,
          itemId: d.item.id,
          name: d.item.name,
          accountId: d.item.accountId,
          currency: d.item.currency,
          budgetField: d.item.budgetField,
          before: { status: d.item.status, budget: d.item.budget },
          after: { status: r.status, budget: r.budget },
        });
      } catch {
        continue;
      }
      if (event.success)
        await sql`INSERT INTO company_ai_optimizations(company_id,event_id,event,occurred_at) VALUES(${company},${event.data.id},${sql.json(event.data)},${event.data.at}) ON CONFLICT DO NOTHING`;
    }
    for (const { company_id: company } of enabled) {
      const today = range().to;
      const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
      const cached = await app.redis.mget(...[today, yesterday].map(d => `traffic-sync:v1:company:${company}:snapshot:2026-08-01:${d}`));
      const saved = cached.find(Boolean);
      if (!saved) continue;
      const source = JSON.parse(saved);
      if (source.companyId !== company) continue;
      const events = await sql`SELECT event FROM company_ai_optimizations WHERE company_id::text=${company} ORDER BY occurred_at DESC LIMIT 1000`;
      const classification = await app.redis.get(`traffic-company:v1:${company}:settings:classification`);
      const names = await offers(company);
      for (let offset = 0; offset < events.length; offset += 100) {
        const data = aiDataSchema.parse({ companyId: company, fetchedAt: source.snapshot.fetchedAt, snapshot: source.snapshot,
          offers: names, sales: [], reversals: [], optimizations: events.slice(offset, offset + 100).map(e => e.event),
          classification: classification ? JSON.parse(classification).value : { campaigns: {}, links: {} } });
        for (const observation of learnOptimizationOutcomes(data)) {
          await sql`INSERT INTO company_ai_learning(company_id,event_id,offer_id,observation)
            VALUES(${company},${observation.eventId},${observation.offerId},${sql.json(observation)})
            ON CONFLICT(company_id,event_id) DO UPDATE SET observation=EXCLUDED.observation,offer_id=EXCLUDED.offer_id,learned_at=now()
            WHERE company_ai_learning.observation IS DISTINCT FROM EXCLUDED.observation`;
        }
      }
    }
  }
  async function loadData(access: AiAccess, selected = range(), includeUpsellIntelligence = false) {
    const sql = db();
    const company = access.companyId;
    const names = await offers(company);
    const ids = access.offerIds;
    // Only already-collected company snapshots; this path never queries or changes Meta.
    const today = range().to;
    const dates = [
      ...new Set([
        today,
        new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10),
        selected.to,
      ]),
    ];
    const cached =
      access.campaigns || access.ads
        ? await app.redis.mget(
            ...dates.map((day) => `traffic-sync:v1:company:${company}:snapshot:2026-08-01:${day}`),
          )
        : [];
    const raw = cached.find(Boolean);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && saved.companyId !== company) throw Error('COMPANY_MISMATCH');
    const now = new Date().toISOString();
    // Use the same daily archive as Ads Intelligence, not an older aggregate Redis snapshot.
    const creativeSnapshot = access.ads
      ? await archivedTraffic(sql, company, selected.from, selected.to)
        ?? await companyCreativeSnapshot(app.redis, company, selected.from, selected.to)
      : null;
    const snapshot = creativeSnapshot ?? saved?.snapshot ?? {
      ...selected,
      fetchedAt: now,
      accounts: [],
      campaigns: [],
      insights: [],
      failures: [],
    };
    const sales =
      (access.sales || access.upsells) && ids.length
        ? await sql`SELECT p.offer_id,(o.paid_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS date,o.currency,o.order_kind,count(*)::int AS count,sum(o.amount_minor)::text AS gross_minor,
          COALESCE(original.country,CASE WHEN upper(o.buyer->>'country') ~ '^[A-Z]{2}$' AND upper(o.buyer->>'country') NOT IN ('XX','ZZ') THEN upper(o.buyer->>'country') ELSE 'ZZ' END) AS country
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id JOIN company_offers c ON c.offer_id=p.offer_id
      LEFT JOIN LATERAL (
        SELECT e.journey_id FROM tracking_events e WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
          AND e.event_name='InitiateCheckout' AND e.received_at<=o.paid_at AND e.received_at>=o.paid_at-interval '30 days'
        ORDER BY e.received_at DESC,e.id DESC LIMIT 1
      ) checkout ON true
      LEFT JOIN LATERAL (
        SELECT upper(e.source->>'country') country FROM tracking_events e
        WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
          AND (checkout.journey_id IS NULL OR e.journey_id=checkout.journey_id)
          AND e.event_name IN ('AdClick','PageView','InitiateCheckout')
          AND e.received_at<=o.paid_at AND e.received_at>=o.paid_at-interval '30 days'
          AND upper(e.source->>'country') ~ '^[A-Z]{2}$' AND upper(e.source->>'country') NOT IN ('XX','ZZ')
        ORDER BY e.received_at ASC,e.id ASC LIMIT 1
      ) original ON true
      WHERE c.company_id::text=${company} AND p.offer_id=ANY(${ids}::text[]) AND o.status='paid'
      AND o.paid_at>=(${selected.from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND o.paid_at<(((${selected.to}::date)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') GROUP BY 1,2,3,4,7`
        : [];
    const reversals =
      access.reversals && ids.length
        ? await sql`SELECT p.offer_id,(COALESCE(o.chargeback_at,o.refunded_at) AT TIME ZONE 'America/Sao_Paulo')::date::text AS date,o.currency,CASE WHEN o.chargeback_at IS NOT NULL OR o.status='chargeback' THEN 'chargeback' ELSE 'refund' END AS kind,count(*)::int AS count,sum(o.amount_minor)::text AS amount_minor
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id JOIN company_offers c ON c.offer_id=p.offer_id
      WHERE c.company_id::text=${company} AND p.offer_id=ANY(${ids}::text[]) AND (o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL OR o.status IN ('refunded','chargeback')) GROUP BY 1,2,3,4`
        : [];
    const upsellIntelligence = includeUpsellIntelligence && access.upsells && ids.length
      ? await sql`SELECT p.offer_id AS "offerId",o.id AS "orderId",o.paid_at AS "paidAt",s.stage_key AS "stageKey",s.name AS "stageName",
          mr.result AS "manualResult",mr.checked_at AS "checkedAt",
          EXISTS(SELECT 1 FROM tracking_orders u WHERE u.project_id=o.project_id AND u.provider=o.provider
            AND u.paid_at IS NOT NULL AND (CASE WHEN u.order_kind='upsell' THEN 'upsell_1' ELSE u.order_kind END)=s.stage_key
            AND ((NULLIF(lower(trim(o.buyer->>'email')),'') IS NOT NULL AND lower(trim(u.buyer->>'email'))=lower(trim(o.buyer->>'email')))
              OR (NULLIF(regexp_replace(o.buyer->>'phone','[^0-9]','','g'),'') IS NOT NULL AND regexp_replace(u.buyer->>'phone','[^0-9]','','g')=regexp_replace(o.buyer->>'phone','[^0-9]','','g'))
              OR (o.visitor_id IS NOT NULL AND u.visitor_id=o.visitor_id))) AS purchased
        FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
        JOIN company_offers c ON c.offer_id=p.offer_id
        JOIN tracking_upsell_stages s ON s.project_id=o.project_id AND s.enabled=true
        LEFT JOIN tracking_upsell_manual_test_results mr ON mr.project_id=o.project_id AND mr.order_id=o.id AND mr.stage_id=s.id
        WHERE c.company_id::text=${company} AND p.offer_id=ANY(${ids}::text[]) AND o.order_kind='front' AND o.paid_at IS NOT NULL
          AND ((o.paid_at>=(${selected.from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND o.paid_at<(((${selected.to}::date)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
            OR (mr.checked_at>=(${selected.from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND mr.checked_at<(((${selected.to}::date)+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')))
        ORDER BY o.paid_at DESC,o.id,s.stage_key`
      : undefined;
    const events = access.optimizations
      ? await sql`SELECT event FROM company_ai_optimizations WHERE company_id::text=${company} ORDER BY occurred_at DESC LIMIT 100`
      : [];
    const rates = access.reversals || access.sales || access.upsells
      ? await sql`SELECT base_currency,rate::text,fetched_at FROM exchange_rate_cache WHERE target_currency='BRL'`
      : [];
    const learning = access.optimizations && (access.campaigns || access.ads) && ids.length
      ? await sql`SELECT observation FROM company_ai_learning WHERE company_id::text=${company} AND offer_id=ANY(${ids}::text[]) ORDER BY learned_at DESC`
      : [];
    const config = await app.redis.get(`traffic-company:v1:${company}:settings:classification`);
    return {
      ...aiDataSchema.parse({
        companyId: company,
        fetchedAt: now,
        offers: names,
        snapshot,
        sales,
        reversals,
        exchangeRates: Object.fromEntries(rates.map(r => [r.base_currency, { rate: Number(r.rate), fetchedAt: new Date(r.fetched_at).toISOString() }])),
        learning: learning.map(l => l.observation),
        upsellIntelligence: upsellIntelligence?.map(r => ({ ...r, paidAt: new Date(r.paidAt).toISOString(), checkedAt: r.checkedAt ? new Date(r.checkedAt).toISOString() : null })),
        optimizations: events.map((e) => e.event).reverse(),
        classification: config ? JSON.parse(config).value : { campaigns: {}, links: {} },
      }),
      trafficStale:
        (!creativeSnapshot && !saved) || (selected.to >= today && Date.now() - Date.parse(snapshot.fetchedAt) > 3600000),
    };
  }
  return {
    resolve,
    offers,
    range,
    loadData,
    collectOptimizations,
    secret: () => {
      if (!env.TRACKING_ENCRYPTION_KEY) throw Error('Encryption key unavailable');
      return env.TRACKING_ENCRYPTION_KEY;
    },
    readConfig: async (company: string) => {
      const [row] =
        await db()`SELECT config FROM company_ai_settings WHERE company_id::text=${company}`;
      return (
        row?.config ?? {
          companyId: company,
          revision: '',
          instructions: '',
          enabled: false,
          keyVersion: 1,
          dailyLimitCents: 500,
        }
      );
    },
    saveConfig: async (company: string, revision: string, value: Record<string, unknown>) => {
      const sql = db();
      const rows =
        await sql`INSERT INTO company_ai_settings(company_id,config) VALUES(${company},${sql.json(JSON.parse(JSON.stringify(value)))}) ON CONFLICT(company_id) DO UPDATE SET config=EXCLUDED.config,updated_at=now() WHERE company_ai_settings.config->>'revision'=${revision} RETURNING company_id`;
      return rows.length === 1;
    },
  };
}
