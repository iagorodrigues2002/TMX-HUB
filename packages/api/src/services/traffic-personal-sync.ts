import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { saoPauloParts } from './intraday-store.js';
import { trafficInventorySnapshot } from './meta-inventory.js';
import {
  readMetaTrafficHealth,
  recordTrafficHealth,
  trafficAlertPrefix,
} from './meta-traffic-alerts.js';
import { readMetaTraffic, validTrafficRange } from './meta-traffic-reader.js';

export const trafficUserKey = (id: string) => `traffic-user:v1:${encodeURIComponent(id)}:`;
export function createPersonalTrafficSync(
  app: FastifyInstance,
  secret: () => Promise<string | undefined>,
) {
  const busy = new Set<string>();
  const leases = new Map<string, string>();
  let stopping = false;
  let ownerCursor = 0;
  async function run(userId: string, from: string, to: string, minAge = 600000) {
    if (stopping || busy.has(userId) || busy.size >= 2 || !validTrafficRange(from, to)) return;
    busy.add(userId);
    const prefix = trafficUserKey(userId);
    const lease = randomUUID();
    let locked = false;
    let connectionRaw: string | null = null;
    let renewal: ReturnType<typeof setInterval> | undefined;
    try {
      locked = (await app.redis.set(`${prefix}lock`, lease, 'PX', 720000, 'NX')) === 'OK';
      if (!locked) return;
      leases.set(`${prefix}lock`, lease);
      if (stopping) return;
      renewal = setInterval(() => {
        void app.redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end",
            1,
            `${prefix}lock`,
            lease,
            720000,
          )
          .catch(() => {});
      }, 30000);
      renewal.unref();
      const raw = await app.redis.get(`${prefix}connection`);
      if (!raw) return;
      connectionRaw = raw;
      const connection = JSON.parse(raw);
      const key = `${prefix}${connection.revision}:${from}:${to}`;
      const cached = await app.redis.get(key);
      const encryption = await secret();
      if (!encryption) throw Error('Encryption unavailable');
      const token = decryptSecret(connection.encrypted, encryption);
      const health = JSON.parse(
        (await app.redis.get(`${trafficAlertPrefix(userId)}state`)) ?? 'null',
      );
      if (!health || Date.now() - Date.parse(health.observedAt) > 300000) {
        try {
          const scan = await readMetaTrafficHealth(token);
          if (
            !stopping &&
            (await app.redis.get(`${prefix}connection`)) === raw &&
            (await app.redis.get(`${prefix}lock`)) === lease
          )
            await recordTrafficHealth(app.redis, userId, scan);
        } catch {
          /* Keep the previous health baseline on failed scans. */
        }
      }
      if (cached && Date.now() - Date.parse(JSON.parse(cached).fetchedAt) < minAge) return;
      const { snapshot, inventory } = await readMetaTraffic(token, from, to);
      if (snapshot.from !== from || snapshot.to !== to) throw Error('Invalid report period');
      const current = await app.redis.get(`${prefix}connection`);
      if (stopping || current !== raw) return;
      const { purchaseClassification, ...data } = snapshot;
      const result = { ...data, ...(connection.frontOnly ? { purchaseClassification } : {}) };
      const previousInventory = JSON.parse((await app.redis.get(`${prefix}inventory`)) ?? 'null');
      const nextInventory = inventory
        ? trafficInventorySnapshot(
            inventory,
            snapshot.fetchedAt,
            previousInventory?.businesses ?? [],
          )
        : null;
      const published = await app.redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] and redis.call('GET',KEYS[2])==ARGV[2] then redis.call('SET',KEYS[3],ARGV[3],'EX',604800);redis.call('DEL',KEYS[4]);if ARGV[4]~='' then redis.call('SET',KEYS[5],ARGV[4]);end;return 1 else return 0 end",
        5,
        `${prefix}lock`,
        `${prefix}connection`,
        key,
        `${prefix}error`,
        `${prefix}inventory`,
        lease,
        raw,
        JSON.stringify(result),
        nextInventory ? JSON.stringify(nextInventory) : '',
      );
      if (published !== 1) return;
    } catch {
      try {
        if (
          !stopping &&
          connectionRaw &&
          (await app.redis.get(`${prefix}connection`)) === connectionRaw
        )
          await app.redis.set(
            `${prefix}error`,
            'A Meta não concluiu a leitura. Últimos dados preservados.',
            'EX',
            600,
          );
      } catch {
        /* Redis outages must not reject detached jobs. */
      }
    } finally {
      leases.delete(`${prefix}lock`);
      if (renewal) clearInterval(renewal);
      if (locked)
        await app.redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
            1,
            `${prefix}lock`,
            lease,
          )
          .catch(() => {});
      busy.delete(userId);
    }
  }
  async function request(userId: string, from: string, to: string, force = false) {
    if (!validTrafficRange(from, to)) throw Error('Invalid traffic range');
    await app.redis.set(`${trafficUserKey(userId)}requested`, JSON.stringify({ from, to }));
    void run(userId, from, to, force ? 30000 : 600000).catch(() => {});
  }
  if (env.NODE_ENV === 'production') {
    let checking = false;
    const tick = async () => {
      if (stopping || checking) return;
      checking = true;
      try {
        const today = saoPauloParts(new Date()).date;
        const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000)
          .toISOString()
          .slice(0, 10);
        const owners = await app.redis.smembers('traffic-user:v1:owners');
        let checked = 0;
        while (checked++ < owners.length && !stopping && busy.size < 2) {
          const userId = owners[ownerCursor % owners.length]!;
          ownerCursor = (ownerCursor + 1) % owners.length;
          if (busy.has(userId)) continue;
          if ((await app.redis.hget(`user:${userId}`, 'id')) !== userId) continue;
          const raw = await app.redis.get(`${trafficUserKey(userId)}requested`);
          let range: { from: string; to: string } | null = null;
          try {
            range = raw ? JSON.parse(raw) : null;
          } catch {
            range = null;
          }
          // A requested range survives restarts; today and yesterday are checked without an open browser.
          void (async () => {
            if (range && validTrafficRange(range.from, range.to))
              await run(userId, range.from, range.to);
            await run(userId, today, today);
            await run(userId, yesterday, yesterday, 3600000);
          })().catch(() => {});
        }
      } catch {
        /* A failed sweep preserves cached reports and retries on the next tick. */
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => void tick(), 60000);
    timer.unref();
    app.addHook('onReady', async () => {
      void tick();
    });
    app.addHook('onClose', async () => {
      stopping = true;
      clearInterval(timer);
      await Promise.allSettled(
        [...leases].map(([key, value]) =>
          app.redis.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
            1,
            key,
            value,
          ),
        ),
      );
    });
  }
  return { busy, request };
}
