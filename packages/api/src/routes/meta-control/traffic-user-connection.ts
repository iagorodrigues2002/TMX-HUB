import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { encryptSecret } from '../../lib/secret-box.js';
import { readMetaInventory } from '../../services/meta-inventory.js';
import { validTrafficRange } from '../../services/meta-traffic-reader.js';
import { createPersonalTrafficSync, trafficUserKey } from '../../services/traffic-personal-sync.js';
export { trafficUserKey } from '../../services/traffic-personal-sync.js';
import {
  hasServerTraffic,
  serverTrafficInventory,
  serverTrafficSnapshot,
  serverTrafficStatus,
} from '../../services/traffic-server-cache.js';

async function connectionSecret() {
  if (env.NODE_ENV !== 'test') return env.TRACKING_ENCRYPTION_KEY;
  // Real tokens must not use the synthetic preview's publicly known encryption key.
  const directory = join(homedir(), '.codex/local-data/tmx');
  const path = join(directory, 'traffic-connection.key');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const key = await readFile(path, 'utf8');
  if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid connection encryption key');
  return key;
}

// Preview connection storage is owner-scoped; it never reuses the global admin connection.
export function registerTrafficUserConnection(app: FastifyInstance) {
  const sync = createPersonalTrafficSync(app, connectionSecret);
  app.get('/meta-control/traffic/connection', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId) return reply.code(401).send({ detail: 'Entre no TMX.' });
    reply.header('Cache-Control', 'private, no-store');
    const raw = await app.redis.get(`${trafficUserKey(userId)}connection`);
    if (!raw) {
      if (!hasServerTraffic(userId)) return { connected: false, busy: false };
      const state = await serverTrafficStatus(app.redis);
      return {
        connected: true,
        id: 'server-primary',
        name: 'Operação TMX',
        source: 'server',
        busy: state?.busy ?? false,
        error: state?.lastError ? 'Uma consulta está pendente; últimos dados preservados.' : '',
      };
    }
    const connection = JSON.parse(raw);
    return {
      connected: true,
      id: connection.revision,
      name: connection.name,
      connectedAt: connection.connectedAt,
      busy: sync.busy.has(userId) || !!(await app.redis.get(`${trafficUserKey(userId)}lock`)),
      error: (await app.redis.get(`${trafficUserKey(userId)}error`)) ?? '',
    };
  });
  app.post(
    '/meta-control/traffic/connection',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const userId = req.user?.sub;
      if (!userId) return reply.code(401).send({ detail: 'Entre no TMX.' });
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(100),
          token: z.string().trim().min(20).max(4096),
          businessId: z.string().regex(/^\d+$/).optional(),
          frontOnly: z.boolean().default(false),
        })
        .safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ detail: 'Confira o nome, token e ID da BM.' });
      const secret = await connectionSecret();
      if (!secret)
        return reply.code(503).send({ detail: 'Criptografia da integração indisponível.' });
      let inventory: Awaited<ReturnType<typeof readMetaInventory>>;
      try {
        inventory = await readMetaInventory({
          token: parsed.data.token,
          version: env.META_GRAPH_API_VERSION,
        });
        if (!inventory.accounts.length)
          return reply
            .code(422)
            .send({ detail: 'O token não retornou contas de anúncio atribuídas.' });
        if (
          parsed.data.businessId &&
          !inventory.businesses.some((b) => b.id === parsed.data.businessId)
        )
          return reply
            .code(422)
            .send({ detail: 'A BM informada não pertence às contas retornadas pelo token.' });
      } catch {
        return reply.code(422).send({
          detail: 'A Meta não validou o token. Confira as permissões e os ativos atribuídos.',
        });
      }
      const prefix = trafficUserKey(userId);
      const revision = randomUUID();
      const connection = {
        revision,
        name: parsed.data.name,
        frontOnly: parsed.data.frontOnly,
        encrypted: encryptSecret(parsed.data.token, secret),
        connectedAt: new Date().toISOString(),
      };
      const classified = {
        ...inventory,
        businesses: inventory.businesses.map((b) => ({
          ...b,
          relationship: b.id === parsed.data.businessId ? 'managed' : 'unknown',
        })),
      };
      await app.redis
        .multi()
        .set(`${prefix}connection`, JSON.stringify(connection))
        .set(`${prefix}inventory`, JSON.stringify(classified))
        .sadd('traffic-user:v1:owners', userId)
        .del(`${prefix}error`)
        .exec();
      return { connected: true, name: connection.name, connectedAt: connection.connectedAt };
    },
  );
  app.get('/meta-control/traffic/connection/inventory', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId) return reply.code(401).send({ detail: 'Entre no TMX.' });
    reply.header('Cache-Control', 'private, no-store');
    const raw = await app.redis.get(`${trafficUserKey(userId)}inventory`);
    if (
      !raw &&
      hasServerTraffic(userId) &&
      !(await app.redis.get(`${trafficUserKey(userId)}connection`))
    ) {
      const inventory = await serverTrafficInventory(app.redis, userId);
      return inventory ?? reply.code(409).send({ detail: 'Inventário em processamento.' });
    }
    return raw
      ? reply.send(JSON.parse(raw))
      : reply.code(404).send({ detail: 'Configure o System User.' });
  });
  app.get('/meta-control/traffic/connection/report', async (req, reply) => {
    const userId = req.user?.sub;
    if (!userId) return reply.code(401).send({ detail: 'Entre no TMX.' });
    const range = z.object({ from: z.string(), to: z.string() }).safeParse(req.query);
    if (!range.success || !validTrafficRange(range.data.from, range.data.to))
      return reply.code(400).send({ detail: 'Período inválido.' });
    const prefix = trafficUserKey(userId);
    const raw = await app.redis.get(`${prefix}connection`);
    if (!raw) {
      if (!hasServerTraffic(userId))
        return reply.code(404).send({ detail: 'Configure o System User.' });
      const data = await serverTrafficSnapshot(
        app.redis,
        userId,
        range.data.from,
        range.data.to,
        true,
      );
      if (!data) return reply.code(409).send({ detail: 'Consulta em processamento.' });
      reply.header('Cache-Control', 'private, no-store');
      const { hourly, ...daily } = data.snapshot;
      return (req.query as { hourly?: string }).hourly === '0' ? daily : { ...daily, hourly };
    }
    const connection = JSON.parse(raw);
    const cacheKey = `${prefix}${connection.revision}:${range.data.from}:${range.data.to}`;
    const cached = await app.redis.get(cacheKey);
    await sync.request(userId, range.data.from, range.data.to);
    reply.header('Cache-Control', 'private, no-store');
    if (!cached) return reply.code(409).send({ detail: 'Consulta em processamento.' });
    const snapshot = JSON.parse(cached);
    if ((req.query as { hourly?: string }).hourly === '0') snapshot.hourly = undefined;
    return reply.send(snapshot);
  });
  app.post(
    '/meta-control/traffic/connection/refresh',
    { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const userId = req.user?.sub;
      if (!userId) return reply.code(401).send({ error: 'unauthorized' });
      const range = z.object({ from: z.string(), to: z.string() }).safeParse(req.body);
      if (!range.success || !validTrafficRange(range.data.from, range.data.to))
        return reply.code(400).send({ error: 'invalid_range' });
      if (await app.redis.get(`${trafficUserKey(userId)}connection`))
        await sync.request(userId, range.data.from, range.data.to, true);
      else if (hasServerTraffic(userId))
        await serverTrafficSnapshot(app.redis, userId, range.data.from, range.data.to, true, 30000);
      else return reply.code(404).send({ error: 'connection_required' });
      return reply.code(202).send({ queued: true });
    },
  );
}
