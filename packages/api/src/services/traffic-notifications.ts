import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { hasNavigationAccess } from '@page-cloner/shared';
import type { CenterNotification, ToolKey } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { membershipTools } from '../lib/company-tools.js';
import { recordTrafficHealth, trafficAlertPrefix } from './meta-traffic-alerts.js';

const trafficIds = [
  'traffic-overview',
  'traffic-campaigns',
  'traffic-windows',
  'traffic-contingency',
  'traffic-settings',
];
export function canReceiveTraffic(user: { role: string; tools?: readonly string[] }) {
  return (
    user.role === 'admin' ||
    ((user.tools === undefined || user.tools.includes('ofertas')) &&
      trafficIds.some((id) => hasNavigationAccess(user.tools, id)))
  );
}
const alertSchema = z.object({
  id: z.string().regex(/^traffic:/),
  kind: z.literal('traffic'),
  unread: z.literal(true),
  createdAt: z.string().datetime(),
  title: z.string(),
  traffic: z.object({
    type: z.enum(['ad_rejected', 'account_disabled']),
    ownerId: z.string(),
    companyId: z.string().uuid().optional(),
    accountId: z.string().regex(/^act_\d+$/),
    accountName: z.string(),
    campaignId: z.string().optional(),
    campaignName: z.string().optional(),
    adId: z.string().optional(),
    adName: z.string().optional(),
  }),
});

export async function trafficNotices(
  app: FastifyInstance,
  user: { sub: string; role: 'admin' | 'user'; tools?: ToolKey[] },
): Promise<Extract<CenterNotification, { kind: 'traffic' }>[]> {
  if (!canReceiveTraffic(user)) return [];
  const memberships = await app.db!<
    {
      company_id: string;
      role: 'owner' | 'admin' | 'member';
      status: 'active' | 'suspended';
      tools: ToolKey[];
    }[]
  >`SELECT company_id::text,role,status,tools FROM company_memberships WHERE user_id=${user.sub}`;
  const companies = new Set(
    memberships
      .filter(
        (m) =>
          m.status === 'active' &&
          canReceiveTraffic({ role: 'user', tools: membershipTools(m, user.tools) }),
      )
      .map((m) => m.company_id),
  );
  const owners = new Set([user.sub]);
  const publisherMemberships = companies.size
    ? await app.db!<
        { company_id: string; user_id: string }[]
      >`SELECT company_id::text,user_id FROM company_memberships WHERE company_id::text=ANY(${[...companies]}::text[]) AND status='active' AND role IN ('owner','admin')`
    : [];
  const publishers = new Set(publisherMemberships.map((m) => `${m.company_id}:${m.user_id}`));
  for (const id of companies)
    for (const owner of await app.redis.smembers(`traffic-alert-companies:v1:${id}`))
      if (publishers.has(`${id}:${owner}`)) owners.add(owner);
  const visible = new Map<string, Extract<CenterNotification, { kind: 'traffic' }>>();
  for (const owner of owners)
    for (const raw of await app.redis.lrange(`${trafficAlertPrefix(owner)}events`, 0, 999)) {
      let result: ReturnType<typeof alertSchema.safeParse>;
      try {
        result = alertSchema.safeParse(JSON.parse(raw));
      } catch {
        continue;
      }
      if (!result.success) continue;
      const event = result.data;
      if (
        event.traffic.ownerId !== owner ||
        (owner !== user.sub &&
          (!event.traffic.companyId ||
            !companies.has(event.traffic.companyId) ||
            !publishers.has(`${event.traffic.companyId}:${owner}`))) ||
        Date.parse(event.createdAt) < Date.now() - 30 * 86400000
      )
        continue;
      visible.set(event.id, event);
    }
  if (!visible.size) return [];
  const ids = [...visible.keys()];
  const read = await app.db!<
    { event_id: string }[]
  >`SELECT event_id FROM notification_center_reads WHERE user_id=${user.sub} AND event_id=ANY(${ids}::text[])`;
  const readIds = new Set(read.map((r) => r.event_id));
  return [...visible.values()].filter((event) => !readIds.has(event.id));
}

export function registerTrafficAlerts(app: FastifyInstance) {
  app.get('/meta-control/traffic/alerts', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const prefix = trafficAlertPrefix(req.user.sub);
    const state = JSON.parse((await app.redis.get(`${prefix}state`)) ?? 'null');
    return {
      companyId: await app.redis.get(`${prefix}company`),
      intervalMinutes: 5,
      lastCheckedAt: state?.observedAt ?? null,
      accounts: state?.accounts?.length ?? 0,
      incompleteAccounts: state?.incompleteAccounts ?? 0,
    };
  });
  app.post('/meta-control/traffic/alerts/company', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const input = z.object({ companyId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!input.success || !app.db) return reply.code(400).send({ error: 'invalid_company' });
    if (input.data.companyId) {
      const rows =
        await app.db`SELECT c.id FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE c.id=${input.data.companyId} AND m.user_id=${req.user.sub} AND m.status='active' AND m.role IN ('owner','admin')`;
      if (!rows.length) return reply.code(403).send({ error: 'company_forbidden' });
    }
    const prefix = trafficAlertPrefix(req.user.sub);
    const previous = await app.redis.get(`${prefix}company`);
    const tx = app.redis.multi().set(`${prefix}company-initialized`, '1');
    if (input.data.companyId)
      tx.set(`${prefix}company`, input.data.companyId).sadd(
        `traffic-alert-companies:v1:${input.data.companyId}`,
        req.user.sub,
      );
    else tx.del(`${prefix}company`);
    if (previous && previous !== input.data.companyId)
      tx.srem(`traffic-alert-companies:v1:${previous}`, req.user.sub);
    await tx.exec();
    return { saved: true };
  });
  if (env.NODE_ENV !== 'test' || process.env.TMX_LOCAL_TRAFFIC_MONITOR !== '1') return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const raw = JSON.parse(
        await readFile(join(homedir(), '.codex/local-data/tmx/traffic-health.json'), 'utf8'),
      );
      const health = z
        .object({
          observedAt: z.string().datetime(),
          accounts: z.array(
            z.object({
              id: z.string().regex(/^act_\d+$/),
              name: z.string(),
              status: z.number().int(),
              adsComplete: z.boolean(),
              rejected: z.array(
                z.object({
                  id: z.string().regex(/^\d+$/),
                  name: z.string(),
                  campaignId: z.string().regex(/^\d+$/),
                  campaignName: z.string(),
                }),
              ),
            }),
          ),
        })
        .parse(raw);
      if (Math.abs(Date.now() - Date.parse(health.observedAt)) > 20 * 60000) return;
      const prefix = trafficAlertPrefix('admin');
      if (
        JSON.parse((await app.redis.get(`${prefix}state`)) ?? 'null')?.observedAt ===
        health.observedAt
      )
        return;
      if (!(await app.redis.get(`${prefix}company-initialized`)) && app.db) {
        const rows =
          await app.db`SELECT c.id::text FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE c.name='TMX · Homologação' AND m.user_id='admin' AND m.status='active' AND m.role='owner'`;
        if (rows.length === 1)
          await app.redis
            .multi()
            .set(`${prefix}company`, rows[0]!.id)
            .sadd(`traffic-alert-companies:v1:${rows[0]!.id}`, 'admin')
            .exec();
        await app.redis.set(`${prefix}company-initialized`, '1');
      }
      await recordTrafficHealth(app.redis, 'admin', health);
    } catch {
      /* Startup and failed scans preserve the notification baseline. */
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 30000);
  timer.unref();
  app.addHook('onReady', async () => {
    void tick();
  });
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
}
