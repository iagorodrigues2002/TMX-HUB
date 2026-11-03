import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpProblem, NotFoundError } from '../lib/problem.js';
import { encryptSecret } from '../lib/secret-box.js';
import { getBrlRate } from '../services/exchange-rate.js';
import {
  FinanceProviderError,
  financeBalances,
  financeProfiles,
} from '../services/finance-providers.js';

const params = z.object({ id: z.string().uuid() });
const credential = z.object({
  provider: z.enum(['wise', 'lootrush']),
  apiKey: z
    .string()
    .trim()
    .min(16)
    .max(4096)
    .regex(/^[^\s]+$/),
});
export function registerCompanyFinance(
  app: FastifyInstance,
  manager: (
    sql: Sql | TransactionSql,
    company: string,
    user: string,
    lock?: boolean,
  ) => Promise<unknown>,
) {
  const path = '/companies/:id/finance';
  app.put(`${path}/rules`, async (req) => {
    const { id } = params.parse(req.params);
    const input = z
      .object({ vendepayIncome: z.boolean(), withdrawalRecipient: z.string().trim().max(200) })
      .strict()
      .parse(req.body);
    await app.db!.begin(async (tx) => {
      await manager(tx, id, req.user!.sub, true);
      await tx`INSERT INTO company_finance_rules(company_id,vendepay_income,withdrawal_recipient)
        VALUES(${id},${input.vendepayIncome},${input.withdrawalRecipient})
        ON CONFLICT(company_id) DO UPDATE SET vendepay_income=EXCLUDED.vendepay_income,withdrawal_recipient=EXCLUDED.withdrawal_recipient,updated_at=now()`;
      await tx`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'finance.rules.updated',${id})`;
    });
    return { saved: true };
  });
  app.put(`${path}/classification`, async (req) => {
    const { id } = params.parse(req.params);
    const input = z
      .object({
        connectionId: z.string().uuid(),
        externalId: z.string().min(1).max(500),
        category: z.enum(['income', 'fixed', 'variable', 'withdrawal', 'transfer']).nullable(),
      })
      .strict()
      .parse(req.body);
    await app.db!.begin(async (tx) => {
      await manager(tx, id, req.user!.sub, true);
      const rows =
        await tx`UPDATE company_finance_entries SET category_override=${input.category},updated_at=now()
        WHERE company_id=${id} AND connection_id=${input.connectionId} AND external_id=${input.externalId}
        AND kind<>'card_topup'
        AND (${input.category}::text IS NULL OR ${input.category}='transfer'
          OR (${input.category}='income' AND received>0 AND coalesce(sent,0)=0)
          OR (${input.category} IN ('fixed','variable','withdrawal') AND sent>0 AND coalesce(received,0)=0)) RETURNING external_id`;
      if (!rows.length)
        throw new HttpProblem({
          status: 422,
          title: 'Movimentação indisponível ou classificação incompatível com a direção do valor',
        });
      await tx`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'finance.entry.classified',${input.externalId})`;
    });
    return { saved: true };
  });
  app.get(`${path}/exchange`, async (req) => {
    const { id } = params.parse(req.params);
    await manager(app.db!, id, req.user!.sub);
    const connections =
      await app.db!`SELECT balances FROM company_finance_connections WHERE company_id=${id}`;
    const currencies = new Set<string>(['USD']);
    for (const c of connections)
      for (const b of c.balances ?? [])
        if (/^[A-Z]{3}$/.test(b.currency)) currencies.add(b.currency);
    await Promise.all(
      [...currencies].slice(0, 30).map((currency) => getBrlRate(currency, app.db!)),
    );
    const rates =
      await app.db!`SELECT base_currency AS currency,rate::text,fetched_at FROM exchange_rate_cache WHERE target_currency='BRL' AND base_currency IN ${app.db!([...currencies])}`;
    return {
      rates,
      source: 'Referencial do TMX (ExchangeRate-API / AwesomeAPI)',
      indicative: true,
    };
  });
  app.get(`${path}/analytics`, async (req) => {
    const { id } = params.parse(req.params);
    await manager(app.db!, id, req.user!.sub);
    const query = z
      .object({
        month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
        provider: z.enum(['wise', 'lootrush']).optional(),
      })
      .parse(req.query);
    // Aggregate the stored ledger, never the paginated movements shown in the browser.
    const days = await app.db!`
      WITH ledger AS (
        SELECT e.*, (e.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
        FROM company_finance_classified e
        JOIN company_finance_connections c ON c.id=e.connection_id AND c.company_id=e.company_id
        WHERE e.company_id=${id} AND (${query.provider ?? null}::text IS NULL OR c.provider=${query.provider ?? null})
          AND e.occurred_at >= ((${`${query.month}-01`}::date - interval '11 months') AT TIME ZONE 'America/Sao_Paulo')
          AND e.occurred_at < ((${`${query.month}-01`}::date + interval '1 month') AT TIME ZONE 'America/Sao_Paulo')
          AND e.occurred_at <= now()
      ), classified AS (
        SELECT *, CASE
          WHEN lower(status) NOT IN ('completed','complete','success','succeeded','settled','paid','confirmed') THEN 'excluded'
          WHEN category IN ('transfer','card_topup') THEN 'excluded'
          WHEN received > 0 AND coalesce(sent,0)=0 AND received_currency IS NOT NULL THEN 'incoming'
          WHEN sent > 0 AND coalesce(received,0)=0 AND sent_currency IS NOT NULL THEN 'outgoing'
          ELSE 'excluded' END AS direction
        FROM ledger
      )
      SELECT day::text, CASE WHEN direction='incoming' THEN received_currency WHEN direction='outgoing' THEN sent_currency ELSE NULL END AS currency,
        coalesce(sum(received) FILTER(WHERE direction='incoming'),0)::text AS incoming,
        coalesce(sum(sent) FILTER(WHERE direction='outgoing'),0)::text AS outgoing,
        coalesce(sum(sent) FILTER(WHERE direction='outgoing' AND category='fixed'),0)::text AS fixed,
        coalesce(sum(sent) FILTER(WHERE direction='outgoing' AND category='variable'),0)::text AS variable,
        coalesce(sum(sent) FILTER(WHERE direction='outgoing' AND category='withdrawal'),0)::text AS withdrawals,
        count(*) FILTER(WHERE direction<>'excluded')::int AS transactions,
        count(*) FILTER(WHERE direction='excluded')::int AS excluded
      FROM classified GROUP BY day, currency ORDER BY day, currency`;
    return { days, timezone: 'America/Sao_Paulo', month: query.month };
  });
  app.get(path, async (req) => {
    const { id } = params.parse(req.params);
    await manager(app.db!, id, req.user!.sub);
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        provider: z.enum(['wise', 'lootrush']).optional(),
        view: z.enum(['all', 'withdrawals', 'outgoing']).default('all'),
      })
      .parse(req.query);
    const connections =
      await app.db!`SELECT id,provider,profile_id,label,status,error_code,history_start,history_cursor,history_supported,balances,last_sync_at,next_sync_at FROM company_finance_connections WHERE company_id=${id} ORDER BY provider`;
    const [rules] =
      await app.db!`SELECT vendepay_income,withdrawal_recipient FROM company_finance_rules WHERE company_id=${id}`;
    const entries =
      await app.db!`SELECT e.connection_id,e.external_id,e.occurred_at,e.kind,e.status,e.description,e.sent::text,e.sent_currency,e.received::text,e.received_currency,c.provider,e.category_override,e.category FROM company_finance_classified e JOIN company_finance_connections c ON c.id=e.connection_id AND c.company_id=e.company_id WHERE e.company_id=${id} AND (${query.provider ?? null}::text IS NULL OR c.provider=${query.provider ?? null})
        AND (${query.view}='all' OR (lower(e.status) IN ('completed','complete','success','succeeded','settled','paid','confirmed') AND ((${query.view}='withdrawals' AND e.category='withdrawal') OR (${query.view}='outgoing' AND e.sent>0 AND coalesce(e.received,0)=0 AND e.category NOT IN ('withdrawal','transfer','card_topup')))))
        ORDER BY e.occurred_at DESC,e.external_id LIMIT 51 OFFSET ${(query.page - 1) * 50}`;
    return {
      connections,
      rules: rules ?? { vendepay_income: false, withdrawal_recipient: '' },
      entries: entries.slice(0, 50),
      hasMore: entries.length > 50,
      isolated: env.NODE_ENV === 'test',
    };
  });
  app.post(
    `${path}/profiles`,
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = params.parse(req.params);
      await manager(app.db!, id, req.user!.sub);
      const input = credential.strict().parse(req.body);
      try {
        return { profiles: await financeProfiles(input.provider, input.apiKey) };
      } catch (error) {
        req.log.warn(
          {
            provider: input.provider,
            phase: 'profiles',
            code: error instanceof FinanceProviderError ? error.code : 'invalid_provider_response',
          },
          'finance_validation_failed',
        );
        throw new HttpProblem({
          status: 422,
          title: 'Conexão indisponível',
          detail: error instanceof FinanceProviderError ? error.code : 'invalid_provider_response',
        });
      }
    },
  );
  app.post(
    `${path}/connections`,
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = params.parse(req.params);
      await manager(app.db!, id, req.user!.sub);
      if (!env.TRACKING_ENCRYPTION_KEY)
        throw new HttpProblem({ status: 503, title: 'Criptografia indisponível' });
      const input = credential
        .extend({ profileId: z.string().min(1).max(200), label: z.string().trim().min(1).max(80) })
        .strict()
        .parse(req.body);
      let profiles: Awaited<ReturnType<typeof financeProfiles>>;
      let balances: Awaited<ReturnType<typeof financeBalances>>;
      try {
        profiles = await financeProfiles(input.provider, input.apiKey);
        if (!profiles.some((p) => p.id === input.profileId))
          throw new FinanceProviderError('profile_not_authorized');
        balances = await financeBalances(input.provider, input.apiKey, input.profileId);
      } catch (error) {
        req.log.warn(
          {
            provider: input.provider,
            phase: 'connection',
            code: error instanceof FinanceProviderError ? error.code : 'invalid_provider_response',
          },
          'finance_validation_failed',
        );
        throw new HttpProblem({
          status: 422,
          title: 'Conexão indisponível',
          detail: error instanceof FinanceProviderError ? error.code : 'invalid_provider_response',
        });
      }
      await app.db!.begin(async (tx) => {
        await manager(tx, id, req.user!.sub, true);
        const [existing] =
          await tx`SELECT id,profile_id FROM company_finance_connections WHERE company_id=${id} AND provider=${input.provider} FOR UPDATE`;
        if (existing && existing.profile_id !== input.profileId)
          throw new HttpProblem({
            status: 409,
            title: 'Conta diferente',
            detail: 'Substitua apenas a chave da mesma conta para preservar o histórico.',
          });
        const key = encryptSecret(input.apiKey, env.TRACKING_ENCRYPTION_KEY!);
        try {
          await tx`INSERT INTO company_finance_connections(id,company_id,provider,profile_id,label,key_encrypted,balances,history_start)
          VALUES(${randomUUID()},${id},${input.provider},${input.profileId},${input.label},${key},${tx.json(balances)},now()-interval '90 days')
          ON CONFLICT(company_id,provider) DO UPDATE SET key_encrypted=EXCLUDED.key_encrypted,label=EXCLUDED.label,balances=EXCLUDED.balances,status='queued',error_code=NULL,history_supported=NULL,next_sync_at=now(),lease_id=NULL,lease_until=NULL`;
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new HttpProblem({ status: 409, title: 'Conta já vinculada' });
          throw error;
        }
        await tx`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'finance.connected',${input.provider})`;
      });
      return { saved: true };
    },
  );
  app.post(`${path}/connections/:connectionId/sync`, async (req) => {
    const { id, connectionId } = params
      .extend({ connectionId: z.string().uuid() })
      .parse(req.params);
    await manager(app.db!, id, req.user!.sub);
    const rows =
      await app.db!`UPDATE company_finance_connections SET next_sync_at=now() WHERE id=${connectionId} AND company_id=${id} AND key_encrypted IS NOT NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING id`;
    if (!rows.length)
      throw new HttpProblem({
        status: 409,
        title: 'Conta desconectada ou sincronização em andamento',
      });
    return { queued: true };
  });
  app.delete(`${path}/connections/:connectionId`, async (req) => {
    const { id, connectionId } = params
      .extend({ connectionId: z.string().uuid() })
      .parse(req.params);
    await app.db!.begin(async (tx) => {
      await manager(tx, id, req.user!.sub, true);
      const rows =
        await tx`UPDATE company_finance_connections SET key_encrypted=NULL,status='disconnected',lease_id=NULL,lease_until=NULL WHERE id=${connectionId} AND company_id=${id} RETURNING id`;
      if (!rows.length) throw new NotFoundError();
      await tx`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${id},${req.user!.sub},'finance.disconnected',${connectionId})`;
    });
    return { disconnected: true };
  });
}
