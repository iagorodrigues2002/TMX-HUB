import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import { saoPauloParts } from './intraday-store.js';
import { trafficInventorySnapshot } from './meta-inventory.js';
import type { readMetaTraffic } from './meta-traffic-reader.js';
type TrafficData = Awaited<ReturnType<typeof readMetaTraffic>>;
type ServerSnapshot = {
  ownerId: string;
  from: string;
  to: string;
  updatedAt: string;
  snapshot: TrafficData['snapshot'];
  inventory: TrafficData['inventory'];
};

export const TRAFFIC_SERVER_OWNER = '01KQSEXEWXZ9Y67V2HFK18JHJB';
export const CREATIVE_WORKSPACE_COMPANY = 'creative-drive:v1:company-id';

export async function creativeWorkspaceCompany(
  redis: Pick<Redis, 'get'>,
  db: Sql | null | undefined,
  user: { sub: string; role: string } | undefined,
) {
  if (!db || user?.role !== 'admin') return null;
  const company = await redis.get(CREATIVE_WORKSPACE_COMPANY);
  if (!company) return null;
  const [membership] = await db<{ company_id: string }[]>`
    SELECT company_id::text FROM company_memberships
    WHERE company_id::text=${company} AND user_id=${user.sub}
      AND status='active' AND role IN ('owner','admin')`;
  return membership?.company_id ?? null;
}

export async function companyCreativeSnapshot(
  redis: Redis,
  company: string,
  from: string,
  to: string,
): Promise<TrafficData['snapshot'] | null> {
  const raw = await redis.get(`traffic-sync:v1:company:${company}:snapshot:${from}:${to}`);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (data.companyId !== company || data.snapshot?.from !== from || data.snapshot?.to !== to)
    throw Error('Invalid creative workspace scope');
  return data.snapshot;
}
export function hasServerTraffic(userId: string) {
  return userId === TRAFFIC_SERVER_OWNER && process.env.TMX_TRAFFIC_SYNC_ENABLED === '1';
}
export async function serverTrafficStatus(redis: Redis) {
  try {
    return JSON.parse(
      (await redis.get(`traffic-sync:v1:${TRAFFIC_SERVER_OWNER}:status`)) ?? 'null',
    );
  } catch {
    return null;
  }
}
export async function serverTrafficSnapshot(
  redis: Redis,
  userId: string,
  from: string,
  to: string,
  requestRefresh = false,
  maxAge = 600000,
) {
  if (!hasServerTraffic(userId)) return null;
  const prefix = `traffic-sync:v1:${userId}:`;
  const raw = await redis.get(`${prefix}snapshot:${from}:${to}`);
  let data: ServerSnapshot | null = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (
    data &&
    (data.ownerId !== userId ||
      data.from !== from ||
      data.to !== to ||
      data.snapshot?.from !== from ||
      data.snapshot?.to !== to)
  )
    throw Error('Invalid traffic scope');
  if (
    requestRefresh &&
    (!data || Date.now() - Date.parse(data.updatedAt) > maxAge) &&
    (await redis.set(`${prefix}requested:${from}:${to}`, '1', 'EX', 300, 'NX'))
  ) {
    await redis
      .multi()
      .lpush(`${prefix}requests`, JSON.stringify({ from, to }))
      .ltrim(`${prefix}requests`, 0, 7)
      .exec();
  }
  return data;
}
export async function serverTrafficInventory(redis: Redis, userId: string) {
  const today = saoPauloParts(new Date()).date;
  const payload = await serverTrafficSnapshot(redis, userId, today, today, true);
  if (!payload) return null;
  return trafficInventorySnapshot(
    payload.inventory ?? [],
    payload.snapshot.fetchedAt,
    [{ id: '343982344905400', relationship: 'managed' }],
    'shared',
  );
}
