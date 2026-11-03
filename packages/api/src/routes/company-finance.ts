import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpProblem, NotFoundError } from '../lib/problem.js';
import { encryptSecret } from '../lib/secret-box.js';
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
    const entries =
      await app.db!`SELECT e.external_id,e.occurred_at,e.kind,e.status,e.description,e.sent::text,e.sent_currency,e.received::text,e.received_currency,c.provider FROM company_finance_entries e JOIN company_finance_connections c ON c.id=e.connection_id AND c.company_id=e.company_id WHERE e.company_id=${id} AND (${query.provider ?? null}::text IS NULL OR c.provider=${query.provider ?? null})
        AND (${query.view}='all' OR (${query.view}='withdrawals' AND e.kind IN ('sell','withdraw','offramp')) OR (${query.view}='outgoing' AND e.sent IS NOT NULL))
        ORDER BY e.occurred_at DESC,e.external_id LIMIT 51 OFFSET ${(query.page - 1) * 50}`;
    return {
      connections,
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
