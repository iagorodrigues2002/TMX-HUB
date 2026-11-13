import { createHash, randomUUID } from 'node:crypto';
import { type BudgetFx, convertBudget, freshBudgetFx } from '@page-cloner/shared/budget-fx';
import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { makeRedis } from '../lib/redis.js';
import { decryptSecret } from '../lib/secret-box.js';
import { connectionSecret } from '../routes/meta-control/traffic-user-connection.js';
import { type TrafficHealth, trafficAlertPrefix } from './meta-traffic-alerts.js';
import { BUDGET_FX_KEY, loadBudgetFx } from './traffic-budget-fx.js';
import { trafficUserKey } from './traffic-personal-sync.js';
import { TRAFFIC_SERVER_OWNER, creativeWorkspaceCompany, trafficCompanyKey } from './traffic-server-cache.js';

const PREFIX = '/meta-control/traffic/management';
const QUEUE = 'traffic-management-v1';
export const managementCacheTtl = (item: { effectiveStatus: string }) => item.effectiveStatus === 'IN_PROCESS' ? 30 : 1200;
const id = z.string().regex(/^\d{5,30}$/);
const level = z.enum(['campaigns', 'adsets', 'ads']);
const itemSchema = z.object({
  id,
  name: z.string(),
  accountId: id,
  accountName: z.string(),
  currency: z.string(),
  status: z.string(),
  effectiveStatus: z.string(),
  budgetField: z.enum(['daily_budget', 'lifetime_budget']).nullable(),
  budget: z.number().int().nonnegative().nullable(),
});
export type ManagedItem = z.infer<typeof itemSchema>;
export type ManagementAction = { status: 'ACTIVE' | 'PAUSED' } | { budget: number };
type Level = z.infer<typeof level>;
type Data = {
  actor: string;
  scope: string;
  revision: string;
  level: Level;
  item: ManagedItem;
  action: ManagementAction;
};

export function validateManagementBatch(
  items: ManagedItem[],
  action: ManagementAction,
  kind: Level,
) {
  for (const item of items) managementPatch(item, action, kind);
  if (
    'budget' in action &&
    new Set(items.map((item) => `${item.currency}:${item.budgetField}`)).size > 1
  )
    throw new UnrecoverableError(
      'Selecione orçamentos da mesma moeda e do mesmo tipo (diário ou total).',
    );
}

export function managementRejections(item: ManagedItem, kind: Level, health: TrafficHealth | null) {
  const account = health?.accounts.find(
    (account) => account.id.replace(/^act_/, '') === item.accountId,
  );
  const rejected =
    account?.rejected.filter((ad) =>
      kind === 'campaigns'
        ? ad.campaignId === item.id
        : kind === 'ads'
          ? ad.id === item.id
          : ad.adsetId === item.id,
    ) ?? [];
  const complete =
    !!account?.adsComplete &&
    !!health &&
    (account.lastCheckComplete ?? !(health as TrafficHealth & { incompleteAccounts?: number }).incompleteAccounts) &&
    // Company monitor runs every 20 minutes; allow one cycle plus collection time.
    Date.now() - Date.parse(account.checkedAt ?? health.observedAt) < 25 * 60_000 &&
    (kind !== 'adsets' || account.rejected.every((ad) => !!ad.adsetId));
  return {
    rejected,
    rejectionCheckComplete: complete,
    rejectionCheckedAt: account?.checkedAt ?? health?.observedAt ?? null,
  };
}

export function managementPatch(item: ManagedItem, action: ManagementAction, kind: Level) {
  if ('status' in action) {
    if (!['ACTIVE', 'PAUSED'].includes(action.status))
      throw new UnrecoverableError('Status inválido.');
    if (['ARCHIVED', 'DELETED'].includes(item.status))
      throw new UnrecoverableError('Este item foi arquivado ou excluído.');
    return { status: action.status };
  }
  if (kind === 'ads' || !item.budgetField || !item.budget)
    throw new UnrecoverableError('O orçamento é controlado na campanha ou no conjunto.');
  // Only currencies with a verified Meta hundredths offset are editable.
  if (!['USD', 'BRL', 'EUR', 'GBP'].includes(item.currency))
    throw new UnrecoverableError('Edição de orçamento disponível em USD, BRL, EUR e GBP.');
  if (!Number.isSafeInteger(action.budget) || action.budget <= 0)
    throw new UnrecoverableError('Informe um orçamento positivo na moeda da conta.');
  return { [item.budgetField]: action.budget };
}

export function managementMatches(item: ManagedItem, action: ManagementAction) {
  return 'status' in action ? item.status === action.status : item.budget === action.budget;
}

export async function applyManagement(
  original: ManagedItem,
  action: ManagementAction,
  kind: Level,
  read: () => Promise<ManagedItem>,
  write: (patch: Record<string, string | number>) => Promise<void>,
) {
  const current = await read();
  if (current.accountId !== original.accountId)
    throw new UnrecoverableError('A conta do item mudou. Revise a seleção.');
  const patch = managementPatch(current, action, kind);
  if (managementMatches(current, action)) return current;
  if (
    'budget' in action &&
    (current.budget !== original.budget || current.budgetField !== original.budgetField)
  )
    throw new UnrecoverableError('O orçamento mudou desde a confirmação. Consulte novamente.');
  if ('status' in action && current.status !== original.status)
    throw new UnrecoverableError('O status mudou desde a confirmação. Consulte novamente.');
  await write(patch);
  const confirmed = await read();
  if (!managementMatches(confirmed, action))
    throw Error('A Meta ainda não confirmou a alteração. A fila fará uma nova verificação.');
  return confirmed;
}

async function graph(token: string, path: string, patch?: Record<string, string | number>) {
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`, {
    method: patch ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(patch ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: patch
      ? new URLSearchParams(Object.entries(patch).map(([k, v]) => [k, String(v)]))
      : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  return graphResult(response.status, result);
}

function graphResult<T>(status: number, result: T) {
  const failure = z.object({ error: z.object({ code: z.number().optional() }) }).safeParse(result);
  if (status >= 400 || failure.success) {
    const code = failure.success ? Number(failure.data.error.code) : 0;
    const message = `Meta recusou a operação (código ${code || status}).`;
    if ([1, 2, 4, 17, 32, 613, 80004].includes(code) || status === 429 || status >= 500)
      throw Error(`${message} Nova tentativa será espaçada automaticamente.`);
    throw new UnrecoverableError(
      `${message} Confira permissões, limites e o estado do item no Gerenciador.`,
    );
  }
  return result;
}

export async function readManagementObjects(token: string, ids: string[], fields: string) {
  if (!ids.length || ids.length > 50) throw new UnrecoverableError('Lote inválido.');
  const path = (id: string) => `${id}?fields=${encodeURIComponent(fields)}`;
  if (ids.length === 1) return { [ids[0]!]: await graph(token, path(ids[0]!)) };
  // Multi-ID queries are deprecated; batch subrequests remain read-only GETs.
  const batch = await graph(token, '', {
    batch: JSON.stringify(ids.map((id) => ({ method: 'GET', relative_url: path(id) }))),
    include_headers: 'false',
  });
  if (!Array.isArray(batch) || batch.length !== ids.length || batch.some((entry) => !entry?.body))
    throw Error('Resposta incompleta da Meta. Nenhuma alteração foi enviada.');
  return Object.fromEntries(
    ids.map((id, i) => [id, graphResult(batch[i].code, JSON.parse(batch[i].body))]),
  );
}

async function readItems(token: string, ids: string[], kind: Level): Promise<ManagedItem[]> {
  // The level-specific field also prevents treating an ad ID as a campaign ID.
  const fields = `id,name,account_id,status,effective_status,${
    {
      campaigns: 'objective,daily_budget,lifetime_budget',
      adsets:
        'optimization_goal,daily_budget,lifetime_budget,campaign{daily_budget,lifetime_budget}',
      ads: 'creative{id}',
    }[kind]
  }`;
  const values = await readManagementObjects(token, ids, fields);
  const accountIds = [...new Set(ids.map((id) => values[id]?.account_id).filter(Boolean))];
  if (accountIds.length === 0) throw new UnrecoverableError('Nenhum item acessível nesta conexão.');
  const accounts = await readManagementObjects(
    token,
    accountIds.map((id) => `act_${id}`),
    'name,currency',
  );
  return ids.map((id) => {
    const value = values[id];
    if (!value || value.error)
      throw new UnrecoverableError('Um item não está acessível. Revise a seleção.');
    const account = accounts[`act_${value.account_id}`];
    if (!account || account.error) throw new UnrecoverableError('Conta de anúncio indisponível.');
    const inherited =
      kind === 'adsets' &&
      (Number(value.campaign?.daily_budget) > 0 || Number(value.campaign?.lifetime_budget) > 0);
    const budgetField = inherited
      ? null
      : Number(value.daily_budget) > 0
        ? 'daily_budget'
        : Number(value.lifetime_budget) > 0
          ? 'lifetime_budget'
          : null;
    return itemSchema.parse({
      id: value.id,
      name: value.name,
      accountId: value.account_id,
      accountName: account.name,
      currency: account.currency,
      status: value.status,
      effectiveStatus: value.effective_status,
      budgetField,
      budget: budgetField ? Number(value[budgetField]) : null,
    });
  });
}

async function credentials(app: FastifyInstance, actor: string) {
  const user = await app.userStore.maybeGetById(actor);
  // Read access to traffic does not grant permission to spend or stop delivery.
  if (!user || user.role !== 'admin')
    throw new UnrecoverableError('Somente administradores podem gerenciar a veiculação.');
  const company = await creativeWorkspaceCompany(app.redis, app.db, {
    sub: actor,
    role: user.role,
  });
  const owner = company ? TRAFFIC_SERVER_OWNER : actor;
  if (!company && app.db && env.NODE_ENV !== 'test')
    throw new UnrecoverableError('Empresa não autorizada para gerenciar o Tráfego.');
  const scope = company ? `company:${company}` : `user:${actor}`;
  const raw = company
    ? await app.redis.get(`${trafficCompanyKey(company)}connection`)
    : await app.redis.get(`${trafficUserKey(owner)}connection`);
  if (raw) {
    const saved = JSON.parse(raw);
    const secret = await connectionSecret();
    if (!secret) throw new UnrecoverableError('Criptografia indisponível.');
    return {
      scope,
      owner,
      revision: saved.revision as string,
      token: decryptSecret(saved.encrypted, secret),
    };
  }
  if (owner === TRAFFIC_SERVER_OWNER && process.env.TMX_TRAFFIC_META_TOKEN)
    return {
      scope,
      owner,
      revision: createHash('sha256').update(process.env.TMX_TRAFFIC_META_TOKEN).digest('hex'),
      token: process.env.TMX_TRAFFIC_META_TOKEN,
    };
  throw new UnrecoverableError('Configure o System User antes de gerenciar campanhas.');
}

export function registerTrafficManagement(app: FastifyInstance) {
  const queue = new Queue<Data>(QUEUE, { connection: app.redis });
  let worker: Worker<Data> | undefined;
  app.addHook('onReady', async () => {
    if (env.NODE_ENV === 'test') return;
    worker = new Worker<Data>(
      QUEUE,
      async (job) => {
        const access = await credentials(app, job.data.actor);
        if (access.scope !== job.data.scope || access.revision !== job.data.revision)
          throw new UnrecoverableError(
            'A conexão ou permissão mudou. Confirme a operação novamente.',
          );
        const lease = randomUUID();
        const locks = [
          `traffic-sync:v1:${access.owner}:lock`,
          `${trafficUserKey(access.owner)}lock`,
        ];
        const acquired: string[] = [];
        try {
          for (const key of locks) {
            if (!(await app.redis.set(key, lease, 'EX', 180, 'NX')))
              throw Error('A consulta da Meta está em andamento. A alteração aguarda na fila.');
            acquired.push(key);
          }
          const confirmed = await applyManagement(
            job.data.item,
            job.data.action,
            job.data.level,
            async () => (await readItems(access.token, [job.data.item.id], job.data.level))[0]!,
            async (patch) => {
              await graph(access.token, job.data.item.id, patch);
            },
          );
          await app.redis.set(
            `${QUEUE}:item:${access.scope}:${access.revision}:${job.data.level}:${confirmed.id}`,
            JSON.stringify({ item: confirmed, observedAt: new Date().toISOString() }),
            'EX',
            managementCacheTtl(confirmed),
          );
          return { ...confirmed, observedAt: new Date().toISOString() };
        } finally {
          for (const key of acquired)
            await app.redis.eval(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
              1,
              key,
              lease,
            );
        }
      },
      {
        connection: makeRedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
        concurrency: 1,
        limiter: { max: 1, duration: 65_000 },
      },
    );
    worker.on('error', () => app.log.error('Traffic management queue unavailable'));
  });
  app.addHook('onClose', async () => {
    await worker?.close();
    await queue.close();
  });
  app.get(`${PREFIX}/capabilities`, async (req) => {
    const admin = req.user?.role === 'admin';
    return { allowed: admin, preview: env.NODE_ENV === 'test' };
  });
  app.get(`${PREFIX}/fx`, async (req, reply) => {
    if (req.user?.role !== 'admin')
      return reply.code(403).send({ detail: 'Acesso administrativo necessário.' });
    try {
      return await loadBudgetFx(app.redis, env.NODE_ENV === 'test');
    } catch (error) {
      return reply
        .code(503)
        .send({ detail: error instanceof Error ? error.message : 'Cotação indisponível.' });
    }
  });
  app.post(
    `${PREFIX}/items`,
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = z.object({ level, ids: z.array(id).min(1).max(50) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ detail: 'Selecione até 50 itens.' });
      if (req.user?.role !== 'admin')
        return reply.code(403).send({ detail: 'Acesso administrativo necessário.' });
      const { level: kind } = parsed.data;
      const ids = [...new Set(parsed.data.ids)];
      try {
        const preview = env.NODE_ENV === 'test';
        const access = preview ? null : await credentials(app, req.user!.sub);
        const key = (id: string) =>
          preview
            ? `${QUEUE}:preview:${req.user!.sub}:${kind}:${id}`
            : `${QUEUE}:item:${access!.scope}:${access!.revision}:${kind}:${id}`;
        const cached = await Promise.all(
          ids.map(async (id) => {
            const raw = await app.redis.get(key(id));
            return raw
              ? preview
                ? { item: itemSchema.parse(JSON.parse(raw)), observedAt: null }
                : JSON.parse(raw)
              : null;
          }),
        );
        const missing = ids.filter((_, index) => !cached[index]);
        if (missing.length && access) {
          const lock = `${QUEUE}:read:${access.scope}:${access.revision}:${kind}:${createHash(
            'sha256',
          )
            .update([...missing].sort().join(','))
            .digest('hex')}`;
          const lease = randomUUID();
          if (!(await app.redis.set(lock, lease, 'EX', 65, 'NX')))
            return reply
              .code(429)
              .send({ detail: 'Atualização da Meta em andamento. Aguarde alguns instantes.' });
          try {
            const items = await readItems(access.token, missing, kind);
            for (const item of items) {
              const entry = { item, observedAt: new Date().toISOString() };
              await app.redis.set(key(item.id), JSON.stringify(entry), 'EX', managementCacheTtl(item));
              cached[ids.indexOf(item.id)] = entry;
            }
          } finally {
            await app.redis.eval(
              "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
              1,
              lock,
              lease,
            );
          }
        }
        const healthRaw = await app.redis.get(
          preview
            ? `${QUEUE}:preview:${req.user!.sub}:health`
            : `${trafficAlertPrefix(access!.owner)}state`,
        );
        const health = healthRaw ? (JSON.parse(healthRaw) as TrafficHealth) : null;
        return {
          items: cached.filter(Boolean).map((entry) => ({
            ...entry.item,
            observedAt: entry.observedAt,
            ...managementRejections(entry.item, kind, health),
          })),
        };
      } catch (error) {
        return reply.code(422).send({
          detail:
            error instanceof Error ? error.message : 'Não foi possível ler os controles da Meta.',
        });
      }
    },
  );
  app.post(
    `${PREFIX}/prepare`,
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = z.object({ level, ids: z.array(id).min(1).max(50) }).safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ detail: 'Selecione até 50 itens do mesmo nível.' });
      if (env.NODE_ENV === 'test') {
        if (req.user?.role !== 'admin')
          return reply.code(403).send({ detail: 'Acesso administrativo necessário.' });
        const cached = await Promise.all(
          parsed.data.ids.map((id) =>
            app.redis.get(`${QUEUE}:preview:${req.user!.sub}:${parsed.data.level}:${id}`),
          ),
        );
        if (cached.some((item) => !item))
          return reply.code(409).send({
            detail:
              'Orçamento ainda não importado para a prévia. Nenhuma consulta ou alteração real foi enviada.',
          });
        return { planId: '', items: cached.map((raw) => itemSchema.parse(JSON.parse(raw!))) };
      }
      try {
        const access = await credentials(app, req.user!.sub);
        const items = await readItems(
          access.token,
          [...new Set(parsed.data.ids)],
          parsed.data.level,
        );
        const planId = randomUUID();
        await app.redis.set(
          `${QUEUE}:plan:${planId}`,
          JSON.stringify({
            actor: req.user!.sub,
            scope: access.scope,
            revision: access.revision,
            level: parsed.data.level,
            items,
            expires: Date.now() + 300000,
          }),
          'EX',
          300,
        );
        return { planId, items };
      } catch (error) {
        return reply.code(422).send({
          detail: error instanceof Error ? error.message : 'Não foi possível consultar a Meta.',
        });
      }
    },
  );
  app.post(`${PREFIX}/operations`, async (req, reply) => {
    const parsed = z
      .object({
        planId: z.string().uuid(),
        action: z.union([
          z.object({ status: z.enum(['ACTIVE', 'PAUSED']) }).strict(),
          z.object({ budget: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict(),
          z
            .object({
              budget: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
              currency: z.enum(['BRL', 'USD']),
              quoteId: z.string().uuid(),
            })
            .strict(),
        ]),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ detail: 'Operação inválida.' });
    if (env.NODE_ENV === 'test')
      return reply
        .code(409)
        .send({ detail: 'Prévia local: alterações reais na Meta estão bloqueadas.' });
    try {
      const access = await credentials(app, req.user!.sub);
      const raw = await app.redis.get(`${QUEUE}:plan:${parsed.data.planId}`);
      if (!raw)
        return reply.code(409).send({ detail: 'A confirmação expirou. Consulte novamente.' });
      const plan = JSON.parse(raw) as Omit<Data, 'item' | 'action'> & {
        items: ManagedItem[];
        expires: number;
      };
      if (
        plan.actor !== req.user!.sub ||
        plan.scope !== access.scope ||
        plan.revision !== access.revision
      )
        return reply.code(403).send({ detail: 'Esta operação pertence a outra conexão.' });
      const actionKey = JSON.stringify(parsed.data.action);
      const previous = await app.redis.get(`${QUEUE}:action:${parsed.data.planId}`);
      let quote: BudgetFx | null = null;
      if ('quoteId' in parsed.data.action) {
        const rawQuote = await app.redis.get(`${BUDGET_FX_KEY}:${parsed.data.action.quoteId}`);
        quote = rawQuote ? JSON.parse(rawQuote) : null;
        if (!quote || (!previous && !freshBudgetFx(quote)))
          return reply
            .code(409)
            .send({ detail: 'A cotação expirou. Atualize e revise os valores novamente.' });
        if (new Set(plan.items.map((item) => item.budgetField)).size > 1)
          return reply
            .code(400)
            .send({ detail: 'Selecione orçamentos do mesmo tipo (diário ou total).' });
      } else validateManagementBatch(plan.items, parsed.data.action, plan.level);
      const actions = plan.items.map((item) => {
        const action = parsed.data.action;
        const native: ManagementAction =
          'quoteId' in action
            ? { budget: convertBudget(action.budget, action.currency, item.currency, quote!) }
            : action;
        managementPatch(item, native, plan.level);
        return native;
      });
      if (!previous && plan.expires < Date.now())
        return reply.code(409).send({ detail: 'A confirmação expirou. Consulte novamente.' });
      const claim = await app.redis.set(
        `${QUEUE}:action:${parsed.data.planId}`,
        actionKey,
        'EX',
        604800,
        'NX',
      );
      if (!claim && (await app.redis.get(`${QUEUE}:action:${parsed.data.planId}`)) !== actionKey)
        return reply.code(409).send({ detail: 'Esta confirmação já foi usada para outra ação.' });
      await app.redis.expire(`${QUEUE}:plan:${parsed.data.planId}`, 604800);
      await queue.addBulk(
        plan.items.map((item, index) => ({
          name: 'apply',
          data: {
            actor: plan.actor,
            scope: plan.scope,
            revision: plan.revision,
            level: plan.level,
            item,
            action: actions[index]!,
          },
          opts: {
            jobId: `${parsed.data.planId}-${item.id}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 65_000 },
            removeOnComplete: { age: 604800 },
            removeOnFail: { age: 604800 },
          },
        })),
      );
      await app.redis.lrem(`${QUEUE}:recent:${req.user!.sub}`, 0, parsed.data.planId);
      await app.redis.lpush(`${QUEUE}:recent:${req.user!.sub}`, parsed.data.planId);
      await app.redis.ltrim(`${QUEUE}:recent:${req.user!.sub}`, 0, 9);
      await app.redis.expire(`${QUEUE}:recent:${req.user!.sub}`, 604800);
      return { batchId: parsed.data.planId };
    } catch (error) {
      return reply.code(422).send({
        detail: error instanceof Error ? error.message : 'Não foi possível agendar a alteração.',
      });
    }
  });
  app.get(`${PREFIX}/operations`, async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (req.user?.role !== 'admin')
      return reply.code(403).send({ detail: 'Acesso administrativo necessário.' });
    const recent = await app.redis.lrange(`${QUEUE}:recent:${req.user!.sub}`, 0, 9);
    const existing = await Promise.all(recent.map(async (id) =>
      await app.redis.get(`${QUEUE}:plan:${id}`) ? id : null));
    return { batches: existing.filter((id): id is string => id !== null) };
  });
  app.get(`${PREFIX}/operations/:batchId`, async (req, reply) => {
    if (req.user?.role !== 'admin')
      return reply.code(403).send({ detail: 'Acesso administrativo necessário.' });
    const batchId = z
      .string()
      .uuid()
      .safeParse((req.params as { batchId: string }).batchId);
    if (!batchId.success) return reply.code(400).send({ detail: 'Operação inválida.' });
    // Keep the plan while jobs run so a reload can recover the exact item list.
    const raw = await app.redis.get(`${QUEUE}:plan:${batchId.data}`);
    if (!raw) return reply.code(404).send({ detail: 'Operação não encontrada ou expirada.' });
    const plan = JSON.parse(raw) as { actor: string; items: ManagedItem[] };
    if (plan.actor !== req.user!.sub)
      return reply.code(403).send({ detail: 'Operação de outro usuário.' });
    const results = await Promise.all(
      plan.items.map(async (item) => {
        const job = await Job.fromId<Data>(queue, `${batchId.data}-${item.id}`);
        return {
          id: item.id,
          name: item.name,
          state: job ? await job.getState() : 'failed',
          result: job?.returnvalue ?? null,
          error: job?.failedReason ?? (job ? null : 'Registro da operação expirado. Confira o status atual na Meta antes de reenviar.'),
        };
      }),
    );
    reply.header('Cache-Control', 'private, no-store');
    return { batchId: batchId.data, results };
  });
}
