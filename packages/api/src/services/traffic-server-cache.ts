import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import { hasNavigationAccess, type ToolKey } from '@page-cloner/shared';
import { membershipTools } from '../lib/company-tools.js';
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
  user: { sub: string; role: string; tools?: ToolKey[] } | undefined,
  required?: readonly string[],
) {
  if (!db || !user) return null;
  const company = await redis.get(CREATIVE_WORKSPACE_COMPANY);
  if (!company) return null;
  const [membership] = await db<{ company_id: string; role: string; status: string; tools: unknown }[]>`
    SELECT company_id::text,role,status,tools FROM company_memberships
    WHERE company_id::text=${company} AND user_id=${user.sub}
      AND status='active'`;
  if (!membership) return null;
  const tools = membershipTools(membership, user.tools);
  return ['owner', 'admin'].includes(membership.role) ||
    (tools.includes('ofertas') && (required ?? ['traffic-overview', 'traffic-campaigns', 'traffic-windows', 'traffic-contingency', 'traffic-settings', 'ads-intelligence'])
      .some((id) => hasNavigationAccess(tools, id)))
    ? membership.company_id : null;
}

export const trafficCompanyKey = (company: string) => `traffic-company:v1:${company}:`;

export async function companyTrafficInventory(redis: Redis, company: string) {
  const configured = await redis.get(`${trafficCompanyKey(company)}inventory`);
  const metadata = configured ? JSON.parse(configured) : null;
  const raw = await redis.get(`traffic-daily:v1:${company}:inventory`);
  if (!raw) return metadata;
  const today = saoPauloParts(new Date()).date;
  const snapshot = await redis.get(`traffic-sync:v1:company:${company}:snapshot:2026-08-01:${today}`);
  const fetchedAt = await redis.get(`traffic-daily:v1:${company}:fetched-at`) ??
    (snapshot ? JSON.parse(snapshot).snapshot?.fetchedAt : null);
  if (!fetchedAt) return metadata;
  return trafficInventorySnapshot(JSON.parse(raw), fetchedAt,
    metadata?.businesses ?? [{ id: '343982344905400', relationship: 'managed' }], 'shared');
}

export async function companyCreativeSnapshot(
  redis: Redis,
  company: string,
  from: string,
  to: string,
  requiredTo = to,
): Promise<TrafficData['snapshot'] | null> {
  // Daily snapshots expire after seven days; a historical query can use a prior complete snapshot.
  for (let offset = 0; offset < 7; offset++) {
    const end = new Date(Date.parse(`${to}T12:00:00Z`) - offset * 86400000)
      .toISOString().slice(0, 10);
    if (end < requiredTo) break;
    const raw = await redis.get(`traffic-sync:v1:company:${company}:snapshot:${from}:${end}`);
    if (!raw) continue;
    const data = JSON.parse(raw);
    if (data.companyId !== company || data.snapshot?.from !== from || data.snapshot?.to !== end)
      throw Error('Invalid creative workspace scope');
    if (data.snapshot.failures?.length) continue;
    return data.snapshot;
  }
  return null;
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
