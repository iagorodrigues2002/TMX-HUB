import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpProblem } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { aiCompanyRuntime } from './ai-company-runtime.js';
import {
  type AiAccess,
  aiAccess,
  authorizedAiContext,
  permittedHistory,
} from './ai-preview-access.js';
import {
  AI_MODEL,
  AI_PRICES,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  RELEASE_LOCK,
  RESERVE_BUDGET,
  SETTLE_BUDGET,
  budgetKey,
  costMicros,
  reserveMicros,
} from './ai-preview-cost.js';
import { AI_POLICY, aiDataSchema, aiScopeSchema } from './ai-preview-model.js';
import { questionContext, questionScope } from './ai-question-context.js';

const root = join(homedir(), '.codex/local-data/tmx/ai-preview');
const PREFIX = '/meta-control/traffic/ai';
const companySchema = z.object({ companyId: z.string().uuid() });
const configSchema = z.object({
  companyId: z.string().uuid().optional(),
  revision: z.string(),
  instructions: z.string().max(6000),
  enabled: z.boolean(),
  encryptedKey: z.string().optional(),
  keyVersion: z.number().int().min(0).max(1).default(0),
  dailyLimitCents: z.number().int().min(1).max(10_000).default(500),
});
async function companyId() {
  return companySchema.parse(JSON.parse(await readFile(join(root, 'company.json'), 'utf8')))
    .companyId;
}
async function secret() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await writeFile(join(root, 'secret'), randomBytes(32).toString('hex'), {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  return readFile(join(root, 'secret'), 'utf8');
}
export function companyKey(master: string, company: string) {
  return createHmac('sha256', master).update(`tmx-ai-key:v1:${company}`).digest('hex');
}
function bridgeSecret(master: string) {
  return createHmac('sha256', master).update('tmx-ai-bridge:v1').digest('hex');
}
async function atomic(name: string, data: unknown) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = join(root, `${name}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, join(root, name));
}
async function loadConfig(company: string) {
  try {
    const c = configSchema.parse(
      JSON.parse(await readFile(join(root, `config-${company}.json`), 'utf8')),
    );
    if (c.companyId && c.companyId !== company) throw Error('COMPANY_MISMATCH');
    if (!c.companyId || c.keyVersion === 0) {
      const master = await secret();
      const migrated = {
        ...c,
        companyId: company,
        keyVersion: 1,
        revision: randomUUID(),
        encryptedKey: c.encryptedKey
          ? encryptSecret(decryptSecret(c.encryptedKey, master), companyKey(master, company))
          : undefined,
      };
      await atomic(`config-${company}.json`, migrated);
      return migrated;
    }
    return c;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return {
        companyId: company,
        revision: '',
        instructions: '',
        enabled: false,
        encryptedKey: undefined,
        keyVersion: 1,
        dailyLimitCents: 500,
      };
    throw e;
  }
}
const configReads = new Map<string, ReturnType<typeof loadConfig>>();
function readConfig(company: string) {
  const pending = configReads.get(company);
  if (pending) return pending;
  const reading = loadConfig(company).finally(() => {
    configReads.delete(company);
  });
  configReads.set(company, reading);
  return reading;
}
export function extractAiAnswer(value: unknown) {
  const body = z
    .object({
      status: z.string(),
      output: z.array(
        z.object({
          type: z.string(),
          content: z
            .array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
                refusal: z.string().optional(),
              }),
            )
            .optional(),
        }),
      ),
      usage: z
        .object({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .parse(value);
  if (body.status !== 'completed')
    throw Error('Resposta incompleta. Tente uma pergunta mais específica.');
  const answer = body.output
    .filter((x) => x.type === 'message')
    .flatMap((x) => x.content ?? [])
    .map((x) => (x.type === 'output_text' ? x.text : x.type === 'refusal' ? x.refusal : ''))
    .filter(Boolean)
    .join('\n');
  if (!answer) throw Error('A OpenAI não retornou uma resposta de texto.');
  return { answer, usage: body.usage };
}

export function registerAiPreview(app: FastifyInstance) {
  const local = env.NODE_ENV === 'test' && process.env.TMX_LOCAL_AI_PREVIEW === '1';
  if (env.NODE_ENV === 'test' && !local) return;
  const runtime = local ? null : aiCompanyRuntime(app);
  const config = async (company: string) => {
    const value = runtime
      ? configSchema.parse(await runtime.readConfig(company))
      : await readConfig(company);
    if (value.companyId !== company) throw Error('COMPANY_MISMATCH');
    return value;
  };
  const encryptionSecret = async () => (runtime ? runtime.secret() : secret());
  const permissions = new WeakMap<FastifyRequest, AiAccess>();
  const companyChoices = new WeakMap<
    FastifyRequest,
    { id: string; name: string; canManage: boolean }[]
  >();
  const accessFor = (req: FastifyRequest) => permissions.get(req)!;
  let syncing = false;
  let syncError: string | null = null;
  let settingsBusy = false;
  const sync = () => {
    if (runtime) return;
    if (syncing) return;
    syncing = true;
    void secret()
      .then((key) =>
        fetch('http://127.0.0.1:4121/refresh', {
          method: 'POST',
          headers: { 'x-tmx-ai-secret': bridgeSecret(key) },
          signal: AbortSignal.timeout(180000),
        }),
      )
      .then((response) => {
        syncError = response.ok
          ? null
          : 'Não foi possível atualizar a cópia local; última leitura preservada.';
      })
      .catch(() => {
        syncError = 'Ponte local indisponível; última leitura preservada.';
      })
      .finally(() => {
        syncing = false;
      });
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    if (runtime) {
      const collect = () =>
        runtime
          .collectOptimizations()
          .catch(() => app.log.warn('Company AI optimization history sync failed'));
      timer = setInterval(collect, 5 * 60_000);
      timer.unref();
      void collect();
      return;
    }
    sync();
    timer = setInterval(sync, 20 * 60_000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.split('?')[0]?.startsWith(`/v1${PREFIX}`) && !req.url.startsWith(PREFIX)) return;
    reply.header('Cache-Control', 'private, no-store');
    if (!req.user) return reply.code(401).send({ detail: 'Entre no TMX.' });
    if (
      req.headers.origin &&
      !(
        local ? ['http://localhost:3120'] : ['https://theminex.com', 'https://app.theminex.com']
      ).includes(req.headers.origin)
    )
      return reply.code(403).send({ detail: 'Origem não autorizada.' });
    const tenant = runtime
      ? await runtime.resolve(req)
      : { companyId: await companyId(), companies: [] };
    const access = await aiAccess(app, tenant.companyId, req.user.sub);
    companyChoices.set(req, tenant.companies);
    permissions.set(req, access);
    if (/\/(settings|refresh)(?:\?|$)/.test(req.url) && !access.canManage)
      return reply
        .code(403)
        .send({ detail: 'Configuração reservada ao administrador autorizado da empresa.' });
  });
  async function settings(company: string) {
    const c = await config(company);
    const consumedMicros = Number((await app.redis.get(budgetKey(company))) ?? 0);
    return {
      companyId: company,
      revision: c.revision,
      instructions: c.instructions,
      enabled: c.enabled,
      configured: !!c.encryptedKey,
      dailyLimitCents: c.dailyLimitCents,
      consumedMicros,
      usageDay: new Date().toISOString().slice(0, 10),
      prices: AI_PRICES,
      model: AI_MODEL,
      preview: local,
    };
  }
  app.get(`${PREFIX}/settings`, async (req) => ({
    ...(await settings(accessFor(req).companyId)),
    companies: companyChoices.get(req),
  }));
  app.put(`${PREFIX}/settings`, { bodyLimit: 12000 }, async (req, reply) => {
    const input = z
      .object({
        companyId: z.string().uuid(),
        revision: z.string(),
        instructions: z.string().max(6000),
        enabled: z.boolean(),
        dailyLimitCents: z.number().int().min(1).max(10_000),
        apiKey: z
          .string()
          .trim()
          .regex(/^sk-[A-Za-z0-9_-]{16,}$/)
          .max(512)
          .optional(),
        removeKey: z.boolean().optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success || (input.data?.removeKey && (input.data.enabled || input.data.apiKey)))
      return reply
        .code(400)
        .send({ detail: 'Configuração inválida. Para remover a chave, desabilite a IA.' });
    if (settingsBusy)
      return reply.code(409).send({ detail: 'Outra configuração está sendo salva.' });
    settingsBusy = true;
    try {
      const company = accessFor(req).companyId;
      if (input.data.companyId !== company)
        return reply.code(403).send({ detail: 'Empresa não autorizada.' });
      const before = await config(company);
      if (before.revision !== input.data.revision)
        return reply
          .code(409)
          .send({ detail: 'Configuração alterada em outra sessão. Recarregue.' });
      const encryptedKey = input.data.removeKey
        ? undefined
        : input.data.apiKey
          ? encryptSecret(input.data.apiKey, companyKey(await encryptionSecret(), company))
          : before.encryptedKey;
      if (input.data.enabled && !encryptedKey)
        return reply.code(400).send({ detail: 'Adicione a chave da OpenAI antes de habilitar.' });
      const saved = {
        companyId: company,
        keyVersion: 1,
        revision: randomUUID(),
        instructions: input.data.instructions,
        enabled: input.data.enabled,
        dailyLimitCents: input.data.dailyLimitCents,
        encryptedKey,
      };
      if (runtime) {
        if (!(await runtime.saveConfig(company, before.revision, saved)))
          return reply
            .code(409)
            .send({ detail: 'Configuração alterada em outra sessão. Recarregue.' });
      } else await atomic(`config-${company}.json`, saved);
      return settings(company);
    } finally {
      settingsBusy = false;
    }
  });
  async function data(access: AiAccess, scope?: { from: string; to: string }) {
    if (runtime) return runtime.loadData(access, scope);
    const company = await companyId();
    const d = aiDataSchema
      .extend({ trafficStale: z.boolean().default(false) })
      .parse(JSON.parse(await readFile(join(root, 'data.json'), 'utf8')));
    if (d.companyId !== company) throw Error('COMPANY_MISMATCH');
    return d;
  }
  app.get(`${PREFIX}/status`, async (req) => {
    try {
      const access = accessFor(req);
      const d = runtime
        ? {
            companyId: access.companyId,
            offers: await runtime.offers(access.companyId),
            snapshot: runtime.range(),
            fetchedAt: new Date().toISOString(),
          }
        : await data(access);
      const c = await settings(d.companyId);
      return {
        companyId: c.companyId,
        configured: c.configured,
        enabled: c.enabled,
        model: c.model,
        canManage: access.canManage,
        accessRevision: access.revision,
        companies: companyChoices.get(req),
        syncing,
        syncError,
        fetchedAt: d.fetchedAt,
        from: d.snapshot.from,
        to: d.snapshot.to,
        offers: d.offers.filter((o) => access.offerIds.includes(o.id)),
      };
    } catch {
      return {
        configured: false,
        enabled: false,
        model: AI_MODEL,
        syncing,
        syncError: syncError ?? 'Aguardando leitura válida da empresa.',
        offers: [],
        optimizations: 0,
      };
    }
  });
  app.post(`${PREFIX}/refresh`, async () => {
    sync();
    return { syncing };
  });
  async function context(input: unknown, access: AiAccess) {
    const scope = aiScopeSchema.parse(input);
    return authorizedAiContext(await data(access, scope), scope, access);
  }
  app.post(`${PREFIX}/context`, { bodyLimit: 4096 }, async (req, reply) => {
    try {
      return await context(req.body, accessFor(req));
    } catch {
      return reply
        .code(422)
        .send({ detail: 'Recorte não autorizado, período inválido ou dados indisponíveis.' });
    }
  });
  app.post(`${PREFIX}/chat`, { bodyLimit: 16000 }, async (req, reply) => {
    const input = z
      .object({
        companyId: z.string().uuid(),
        requestId: z.string().uuid(),
        question: z.string().trim().min(1).max(3000),
        scope: aiScopeSchema.optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success) return reply.code(400).send({ detail: 'Pergunta ou período inválido.' });
    const company = accessFor(req).companyId;
    if (input.data.companyId !== company)
      return reply.code(403).send({ detail: 'Empresa não autorizada.' });
    const c = await config(company);
    if (!c.enabled || !c.encryptedKey)
      return reply
        .code(409)
        .send({ detail: 'Configure e habilite a OpenAI em Administração global → IA.' });
    const access = accessFor(req);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          question: input.data.question,
          scope: input.data.scope,
          accessRevision: access.revision,
        }),
      )
      .digest('hex');
    const requestKey = `tmx-ai-preview:request:${company}:${req.user!.sub}:${input.data.requestId}`;
    const previous = await app.redis.get(requestKey);
    if (previous) {
      const cached = JSON.parse(previous);
      if (cached.fingerprint === fingerprint && cached.record) return cached.record;
      return reply.code(409).send({
        detail:
          'Esta solicitação já foi processada ou está pendente. Não será cobrada novamente pelo TMX.',
      });
    }
    const lock = `tmx-ai-preview:lock:${company}`;
    const lockToken = randomUUID();
    if (!(await app.redis.set(lock, lockToken, 'EX', 240, 'NX')))
      return reply.code(429).send({ detail: 'Aguarde a análise atual da empresa terminar.' });
    let sent = false;
    let ownRequest = false;
    let reserved = 0;
    const daily = budgetKey(company);
    const reservation = `${requestKey}:reservation`;
    try {
      if (!(await app.redis.set(requestKey, JSON.stringify({ fingerprint }), 'EX', 86400, 'NX')))
        return reply.code(409).send({ detail: 'Solicitação já recebida.' });
      ownRequest = true;
      const memoryKey = `tmx-ai-preview:chat:${company}:${req.user!.sub}`;
      const history = (await app.redis.lrange(memoryKey, 0, 3))
        .reverse()
        .map((v) => JSON.parse(v))
        .filter((v) => permittedHistory(v, access));
      const requestedScope = input.data.scope ?? questionScope(input.data.question) ??
        aiScopeSchema.safeParse(history.at(-1)?.scope).data;
      const available = await data(access, requestedScope);
      const scope = requestedScope ?? {
        from: available.snapshot.from,
        to: available.snapshot.to,
        offer: '',
        query: '',
        level: 'campaigns' as const,
      };
      const d = questionContext(available, authorizedAiContext(available, scope, access), input.data.question);
      if (d.companyId !== company) throw Error('COMPANY_MISMATCH');
      const body = {
        model: AI_MODEL,
        store: false,
        service_tier: 'default',
        prompt_cache_options: { mode: 'explicit' },
        reasoning: { effort: 'low' },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: AI_POLICY,
        input: [
          {
            role: 'user',
            content: JSON.stringify({
              administrativeGuidance: c.instructions,
              previousConversation: history.map((v) => ({
                question: v.question,
                answer: v.answer.slice(0, 5000),
              })),
              data: d,
              question: input.data.question,
            }),
          },
        ],
      };
      if (Buffer.byteLength(JSON.stringify(body)) > 8_000_000)
        return reply
          .code(422)
          .send({ detail: 'O volume excedeu a capacidade de uma única análise. Peça a comparação em etapas.' });
      const master = await encryptionSecret();
      const headers = {
        authorization: `Bearer ${decryptSecret(c.encryptedKey, companyKey(master, company))}`,
        ...(local ? { 'x-tmx-ai-secret': bridgeSecret(master) } : {}),
        'content-type': 'application/json',
      };
      const counted = await fetch(
        local
          ? 'http://127.0.0.1:4121/input-tokens'
          : 'https://api.openai.com/v1/responses/input_tokens',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: body.model,
            instructions: body.instructions,
            input: body.input,
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!counted.ok)
        return reply.code(502).send({
          detail:
            'OpenAI não permitiu a contagem prévia. Confira a chave, a cota e as permissões de Responses. Nenhuma geração foi iniciada.',
        });
      const count = z
        .object({ input_tokens: z.number().int().min(0) })
        .safeParse(await counted.json());
      if (!count.success)
        return reply.code(502).send({
          detail: 'A OpenAI retornou uma contagem de tokens inválida. Nenhuma geração foi iniciada.',
        });
      if (count.data.input_tokens > MAX_INPUT_TOKENS)
        return reply.code(422).send({ detail: 'A análise excedeu a capacidade de contexto do modelo. Peça a comparação em etapas.' });
      reserved = reserveMicros(count.data.input_tokens);
      // Recheck settings after preflight so disabling/replacing the key cancels a not-yet-sent generation.
      if ((await config(company)).revision !== c.revision)
        return reply
          .code(409)
          .send({ detail: 'Configuração alterada durante a análise. Tente novamente.' });
      if ((await aiAccess(app, company, req.user!.sub)).revision !== access.revision)
        return reply
          .code(403)
          .send({ detail: 'Permissões alteradas durante a análise. Recarregue a conversa.' });
      if (
        Number(
          await app.redis.eval(
            RESERVE_BUDGET,
            2,
            daily,
            reservation,
            reserved,
            c.dailyLimitCents * 10000,
          ),
        ) !== 1
      )
        return reply.code(429).send({
          detail:
            'O limite diário de IA da empresa não comporta esta consulta. Reduza o recorte ou ajuste o limite na Administração.',
        });
      sent = true;
      const response = await fetch(
        local ? 'http://127.0.0.1:4121/responses' : 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: { ...headers, 'X-Client-Request-Id': input.data.requestId },
          body: JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(95000),
        },
      );
      if (!response.ok)
        return reply.code(502).send({
          detail:
            'OpenAI recusou ou interrompeu a análise. Confira chave, permissões e cota. A reserva de custo foi mantida por segurança; não houve repetição automática.',
        });
      const raw = await response.json();
      const actual = costMicros(raw);
      if (actual !== null) await app.redis.eval(SETTLE_BUDGET, 2, daily, reservation, actual);
      if ((await aiAccess(app, company, req.user!.sub)).revision !== access.revision)
        return reply
          .code(403)
          .send({ detail: 'Permissões alteradas; resposta não disponibilizada.' });
      const result = extractAiAnswer(raw);
      const record = {
        id: input.data.requestId,
        companyId: company,
        accessRevision: access.revision,
        at: new Date().toISOString(),
        question: input.data.question,
        ...result,
        scope: d.scope,
        fetchedAt: d.fetchedAt,
        costMicros: actual ?? reserved,
        costReserved: actual === null,
        providerRequestId: response.headers.get('x-request-id'),
      };
      await app.redis.set(requestKey, JSON.stringify({ fingerprint, record }), 'EX', 86400);
      await app.redis.lpush(memoryKey, JSON.stringify(record));
      await app.redis.ltrim(memoryKey, 0, 49);
      await app.redis.expire(memoryKey, 30 * 86400);
      return record;
    } catch (error) {
      if (error instanceof HttpProblem && error.status === 403)
        return reply
          .code(403)
          .send({ detail: 'Acesso alterado ou recorte não autorizado. Recarregue a conversa.' });
      return reply.code(502).send({
        detail:
          'Não foi possível concluir a análise. Sem repetição automática. Reservas de consultas já enviadas permanecem no limite diário.',
      });
    } finally {
      if (!sent && ownRequest) {
        await app.redis.eval(SETTLE_BUDGET, 2, daily, reservation, 0);
        await app.redis.del(requestKey);
      }
      await app.redis.eval(RELEASE_LOCK, 1, lock, lockToken);
    }
  });
  app.get(`${PREFIX}/history`, async (req, reply) => {
    try {
      const access = accessFor(req);
      return {
        accessRevision: access.revision,
        items: (
          await app.redis.lrange(`tmx-ai-preview:chat:${access.companyId}:${req.user!.sub}`, 0, 49)
        )
          .map((v) => JSON.parse(v))
          .filter((v) => permittedHistory(v, access)),
      };
    } catch {
      return reply.code(503).send({ detail: 'Histórico indisponível.' });
    }
  });
}
