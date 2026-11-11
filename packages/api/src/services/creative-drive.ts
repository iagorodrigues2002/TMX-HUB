import { randomUUID } from 'node:crypto';
import { readCreativeDrive } from '@page-cloner/shared/creative-drive-reader';
import { type CreativeDriveState, withCreativeDriveArchive } from '@page-cloner/shared/creative-drive-state';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { CREATIVE_WORKSPACE_COMPANY } from './traffic-server-cache.js';

export const creativeDriveSchedule = 'creative-drive:v1:scheduled';
export const creativeDriveKey = (owner: string) => `creative-drive:v1:${owner}:`;

async function readState(redis: Redis, owner: string) {
  const prefix = creativeDriveKey(owner);
  const [config, catalog, metadata, archive] = await redis.mget(
    prefix + 'config', prefix + 'catalog', prefix + 'metadata', prefix + 'archive',
  );
  const state = withCreativeDriveArchive({
    ...(config ? JSON.parse(config) : { rootUrl: '', requestedAt: 0 }),
    ...(catalog ? JSON.parse(catalog) : { catalog: null, error: '', checkedAt: 0 }),
    metadata: metadata ? JSON.parse(metadata) : {},
  }, archive ? JSON.parse(archive) : null);
  return { state, config, catalog, metadata, archive };
}

export async function cloudCreativeDriveState(redis: Redis, owner: string) {
  return (await readState(redis, owner)).state;
}

export async function configureCloudCreativeDrive(redis: Redis, owner: string, rootUrl: string) {
  const prefix = creativeDriveKey(owner);
  const now = Date.now();
  await redis.multi()
    .set(prefix + 'config', JSON.stringify({ rootUrl, requestedAt: now }))
    .zadd(creativeDriveSchedule, now, owner)
    .exec();
}

export async function updateCloudCreativeMetadata<T>(
  redis: Redis,
  owner: string,
  update: (state: CreativeDriveState) => { metadata?: CreativeDriveState['metadata']; result: T },
): Promise<T> {
  const prefix = creativeDriveKey(owner);
  for (let attempt = 0; attempt < 4; attempt++) {
    const stored = await readState(redis, owner);
    const { metadata, result } = update(stored.state);
    if (!metadata) return result;
    const saved = await redis.eval(
      `for i = 1, 4 do
         if (redis.call('GET', KEYS[i]) or '') ~= ARGV[i] then return 0 end
       end
       redis.call('SET', KEYS[3], ARGV[5])
       return 1`,
      4,
      prefix + 'config', prefix + 'catalog', prefix + 'metadata', prefix + 'archive',
      stored.config ?? '', stored.catalog ?? '', stored.metadata ?? '', stored.archive ?? '',
      JSON.stringify(metadata),
    );
    if (saved === 1) return result;
  }
  throw Error('Os criativos foram atualizados em outra sessão. Tente novamente.');
}

export async function syncCloudCreativeDrive(
  redis: Redis,
  owner: string,
  fetcher: typeof fetch = fetch,
) {
  const prefix = creativeDriveKey(owner);
  const lease = randomUUID();
  if (!(await redis.set(prefix + 'lease', lease, 'PX', 180_000, 'NX'))) return;
  try {
    const { config, state } = await readState(redis, owner);
    if (!config || !state.rootUrl) {
      await redis.zrem(creativeDriveSchedule, owner);
      return;
    }
    const deadline = AbortSignal.timeout(120_000);
    let catalog = state.catalog;
    let error = '';
    try {
      catalog = await readCreativeDrive(state.rootUrl, (url, init) =>
        fetcher(url, {
          ...init,
          signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline,
        }),
      );
    } catch (failure) {
      error = failure instanceof Error && failure.message.startsWith('Esta pasta exige')
        ? failure.message
        : 'Não foi possível concluir a leitura do Drive. Último catálogo preservado.';
    }
    const checkedAt = Date.now();
    await redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] and redis.call('GET', KEYS[2]) == ARGV[2] then
         redis.call('SET', KEYS[3], ARGV[3])
         redis.call('ZADD', KEYS[4], ARGV[4], ARGV[5])
       end`,
      4,
      prefix + 'lease', prefix + 'config', prefix + 'catalog', creativeDriveSchedule,
      lease, config, JSON.stringify({ catalog, error, checkedAt }), checkedAt + 600_000, owner,
    );
  } finally {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end",
      1, prefix + 'lease', lease,
    );
  }
}

export function startCreativeDriveSync(app: FastifyInstance) {
  let running: Promise<void> | undefined;
  function tick() {
    if (running) return;
    running = (async () => {
      const [owner] = await app.redis.zrangebyscore(creativeDriveSchedule, 0, Date.now(), 'LIMIT', 0, 1);
      if (!owner) return;
      const allowed = owner.startsWith('company:')
        ? owner === `company:${await app.redis.get(CREATIVE_WORKSPACE_COMPANY)}`
        : (await app.userStore.maybeGetById(owner))?.role === 'admin';
      if (!allowed) {
        await app.redis.zrem(creativeDriveSchedule, owner);
        return;
      }
      await syncCloudCreativeDrive(app.redis, owner);
    })().catch(() => {
      app.log.warn('A sincronização de criativos do Drive será tentada novamente.');
    }).finally(() => { running = undefined; });
  }
  const timer = setInterval(tick, 15_000);
  timer.unref();
  app.addHook('onReady', async () => { tick(); });
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await running;
  });
}
