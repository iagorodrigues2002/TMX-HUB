import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readMetaTrafficHealth, recordTrafficHealth } from './traffic-meta-alerts.mjs';

export const OWNER = '01KQSEXEWXZ9Y67V2HFK18JHJB';
export const PREFIX = `traffic-sync:v1:${OWNER}:`;
export const RETENTION = 7 * 86400;
const parsed = (value) => {
  try {
    return JSON.parse(value || 'null');
  } catch {
    return null;
  }
};
export function validRange(from, to) {
  return (
    [from, to].every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value,
    ) &&
    from <= to &&
    (Date.parse(to) - Date.parse(from)) / 86400000 < 366
  );
}
export function days(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (name) => parts.find((part) => part.type === name).value;
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  return {
    today,
    yesterday: new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10),
  };
}
export function normalizeFinance(body, owner, from, to) {
  if (body?.from !== from || body.to !== to || !Array.isArray(body.offers))
    throw Error('invalid_finance');
  const fields = [
    'gross_revenue_brl_minor',
    'gross_revenue_usd_minor',
    'net_available_brl_minor',
    'net_available_usd_minor',
  ];
  const offers = body.offers.filter((offer) => offer.owner_id === owner);
  if (
    offers.some(
      (offer) =>
        typeof offer.offer_id !== 'string' ||
        typeof offer.offer_name !== 'string' ||
        !Number.isInteger(offer.fees_missing_operations) ||
        offer.fees_missing_operations < 0 ||
        fields.some(
          (field) =>
            typeof offer[field] !== 'string' ||
            !/^-?\d+$/.test(offer[field]) ||
            !Number.isSafeInteger(Number(offer[field])),
        ),
    )
  )
    throw Error('invalid_finance');
  return {
    offers: offers.map((offer) =>
      Object.fromEntries(
        ['offer_id', 'offer_name', 'owner_id', 'fees_missing_operations', ...fields].map(
          (field) => [field, offer[field]],
        ),
      ),
    ),
  };
}
export async function syncPeriod({
  from,
  to,
  readMeta,
  readFinance,
  redis,
  token,
  canPublish = async () => true,
  lock,
}) {
  if (!validRange(from, to)) throw Error('invalid_range');
  const { snapshot, inventory } = await readMeta(token, from, to);
  if (snapshot.from !== from || snapshot.to !== to) throw Error('invalid_meta_range');
  const finance = await readFinance(from, to);
  if (finance.ownerId !== OWNER || finance.from !== from || finance.to !== to)
    throw Error('invalid_finance_owner');
  const result = {
    source: 'tmx-server',
    revision: 'server-traffic-v2-canonical',
    ownerId: OWNER,
    from,
    to,
    updatedAt: new Date().toISOString(),
    snapshot,
    inventory,
    finance,
  };
  const data = JSON.stringify(result);
  if (Buffer.byteLength(data) > 20 * 1024 * 1024) throw Error('snapshot_too_large');
  if (!(await canPublish())) throw Error('lease_lost');
  const snapshotKey = `${PREFIX}snapshot:${from}:${to}`;
  if (lock) {
    const published = await redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]);return 1 else return 0 end",
      2,
      `${PREFIX}lock`,
      snapshotKey,
      lock,
      data,
      RETENTION,
    );
    if (published !== 1) throw Error('lease_lost');
  } else await redis.set(snapshotKey, data, 'EX', RETENTION);
  return result;
}

async function readFinance(redis, from, to) {
  const [id, name, role, email] = await redis.hmget(`user:${OWNER}`, 'id', 'name', 'role', 'email');
  if (id !== OWNER || !['admin', 'user'].includes(role) || !process.env.JWT_SECRET)
    throw Error('owner_unavailable');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: id, email, role, iat: now, exp: now + 90 }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const token = `${data}.${createHmac('sha256', process.env.JWT_SECRET).update(data).digest('base64url')}`;
  const result = {
    source: 'https://theminex.com',
    ownerId: OWNER,
    ownerName: name,
    from,
    to,
    fetchedAt: new Date().toISOString(),
  };
  for (const view of ['natural', 'general']) {
    const url = new URL(
      '/v1/tracking/overview',
      `http://127.0.0.1:${process.env.PORT || process.env.API_PORT || 4000}`,
    );
    url.search = new URLSearchParams({ from, to, sales_view: view });
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) throw Error('finance_unavailable');
    result[view] = normalizeFinance(await response.json(), OWNER, from, to);
  }
  return result;
}

export async function startWorker() {
  if (process.env.TMX_TRAFFIC_SYNC_ENABLED !== '1') return () => {};
  const token = process.env.TMX_TRAFFIC_META_TOKEN;
  if (typeof token !== 'string' || token.length < 40) throw Error('meta_credential_required');
  const { readMetaTraffic } = await import('./traffic-meta-reader.mjs');
  const Redis = createRequire(import.meta.url)('ioredis');
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
  });
  redis.on('error', () => {});
  let busy = false;
  let stopping = false;
  let activeLock = null;
  const attempts = new Map();
  let state = {
    source: 'tmx-server',
    ownerId: OWNER,
    startedAt: new Date().toISOString(),
    heartbeatAt: '',
    busy: false,
    lastError: '',
    periods: {},
  };
  const publish = async () => {
    state.heartbeatAt = new Date().toISOString();
    await redis.set(`${PREFIX}status`, JSON.stringify(state), 'EX', 300);
  };
  async function tick() {
    if (busy || stopping) return;
    busy = true;
    const lock = randomUUID();
    let locked = false;
    let renewal;
    try {
      if (await redis.get(`traffic-user:v1:${OWNER}:connection`)) return;
      locked = (await redis.set(`${PREFIX}lock`, lock, 'PX', 12 * 60000, 'NX')) === 'OK';
      if (!locked) return;
      activeLock = lock;
      const old = parsed(await redis.get(`${PREFIX}status`));
      if (old?.ownerId === OWNER) state = { ...state, periods: old.periods ?? {} };
      state.busy = true;
      state.lastError = '';
      await publish();
      renewal = setInterval(() => {
        if (stopping) return;
        void redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end",
            1,
            `${PREFIX}lock`,
            lock,
            12 * 60000,
          )
          .catch(() => {});
        void publish().catch(() => {});
      }, 30000);
      const requests = [];
      for (let index = 0; index < 4; index++) {
        const value = await redis.rpop(`${PREFIX}requests`);
        if (!value) break;
        try {
          const range = JSON.parse(value);
          if (validRange(range.from, range.to)) requests.push({ ...range, interval: 60000 });
        } catch {}
      }
      const date = days();
      const healthAt = await redis.get(`traffic-alerts:v1:${OWNER}:state`);
      if (!healthAt || Date.now() - Date.parse(parsed(healthAt)?.observedAt) > 300000) {
        try {
          await recordTrafficHealth(redis, OWNER, await readMetaTrafficHealth(token));
        } catch {
          /* Health failures preserve the last baseline and never imply an account block. */
        }
      }
      requests.push(
        { from: date.today, to: date.today, interval: 600000 },
        { from: date.yesterday, to: date.yesterday, interval: 3600000 },
      );
      const seen = new Set();
      for (const range of requests) {
        if (stopping) break;
        const key = `${range.from}:${range.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const previous = parsed(await redis.get(`${PREFIX}snapshot:${key}`));
        if (
          previous?.ownerId === OWNER &&
          Date.now() - Date.parse(previous.updatedAt) < range.interval
        ) {
          state.periods[key] = { updatedAt: previous.updatedAt, error: '' };
          continue;
        }
        if (Date.now() - (attempts.get(key) ?? 0) < Math.min(range.interval, 600000)) continue;
        attempts.set(key, Date.now());
        try {
          const result = await syncPeriod({
            from: range.from,
            to: range.to,
            redis,
            token,
            readMeta: readMetaTraffic,
            readFinance: (from, to) => readFinance(redis, from, to),
            canPublish: async () => !stopping,
            lock,
          });
          state.periods[key] = { updatedAt: result.updatedAt, error: '' };
          await publish();
        } catch {
          state.periods[key] = {
            updatedAt: previous?.updatedAt ?? null,
            error: 'Leitura não concluída. Última consulta válida preservada.',
          };
          state.lastError = 'Uma consulta não foi concluída. Nova tentativa automática programada.';
        }
      }
      const retained = Object.entries(state.periods).slice(-24);
      state.periods = Object.fromEntries(retained);
    } catch {
      state.lastError = 'Sincronizador temporariamente indisponível. Dados anteriores preservados.';
    } finally {
      if (renewal) clearInterval(renewal);
      if (locked) {
        state.busy = false;
        if (!stopping) await publish().catch(() => {});
        await redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
            1,
            `${PREFIX}lock`,
            lock,
          )
          .catch(() => {});
      }
      activeLock = null;
      busy = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, 30000);
  const initial = setTimeout(() => {
    void tick();
  }, 15000);
  return async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    clearTimeout(initial);
    if (activeLock)
      await redis
        .eval(
          "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
          1,
          `${PREFIX}lock`,
          activeLock,
        )
        .catch(() => {});
    if (!busy) await redis.quit();
  };
}

async function main() {
  const api = spawn(process.execPath, ['dist/server.js'], { stdio: 'inherit' });
  let stop = async () => {};
  api.once('exit', (code) => {
    void stop().finally(() => process.exit(code ?? 1));
  });
  api.once('error', () => {
    void stop().finally(() => process.exit(1));
  });
  try {
    stop = await startWorker();
  } catch {
    console.error('traffic-sync: worker unavailable; API remains active');
  }
  const shutdown = async (signal) => {
    await stop();
    api.kill(signal);
  };
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      void shutdown(signal);
    });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  void main().catch(() => {
    console.error('traffic-sync: startup failed');
    process.exit(1);
  });
