import { expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import type { ToolKey } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { canReceiveTraffic, trafficNotices } from '../src/services/traffic-notifications.js';
const company = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const grants: ToolKey[] = ['ofertas', 'nav:scoped', 'nav:traffic-campaigns'];
it('requires active company-local traffic access, excludes other companies and honors read state', async () => {
  const memberships = [
    { company_id: company, role: 'member', status: 'active', tools: grants },
    {
      company_id: other,
      role: 'member',
      status: 'active',
      tools: ['ofertas', 'nav:scoped', 'nav:offers-all'],
    },
    {
      company_id: '00000000-0000-4000-8000-000000000003',
      role: 'member',
      status: 'suspended',
      tools: grants,
    },
  ];
  let publisherActive = true;
  const db = vi.fn(async (strings: TemplateStringsArray) =>
    strings.join('').includes('notification_center_reads')
      ? [{ event_id: 'traffic:read' }]
      : strings.join('').includes('company_id::text,user_id')
        ? publisherActive
          ? [{ company_id: company, user_id: 'source' }]
          : []
        : memberships,
  );
  const event = (id: string, companyId: string) =>
    JSON.stringify({
      id,
      kind: 'traffic',
      unread: true,
      title: 'Anúncio reprovado',
      createdAt: new Date().toISOString(),
      traffic: {
        ownerId: 'source',
        companyId,
        type: 'ad_rejected',
        accountId: 'act_1',
        accountName: 'Conta',
        campaignName: 'Campanha',
      },
    });
  const redis = {
    get: vi.fn(async () => null),
    smembers: vi.fn(async () => ['source']),
    lrange: vi.fn(async (key: string) =>
      key.includes(':source:')
        ? [
            event('traffic:new', company),
            event('traffic:read', company),
            event('traffic:foreign', other),
          ]
        : [],
    ),
  };
  const app = { db, redis } as unknown as FastifyInstance;
  const result = await trafficNotices(app, { sub: 'member', role: 'user', tools: grants });
  expect(result.map((e) => e.id)).toEqual(['traffic:new']);
  expect(redis.smembers).toHaveBeenCalledTimes(1);
  expect(redis.smembers).toHaveBeenCalledWith(`traffic-alert-companies:v1:${company}`);
  publisherActive = false;
  expect(await trafficNotices(app, { sub: 'member', role: 'user', tools: grants })).toEqual([]);
  db.mockClear();
  redis.smembers.mockClear();
  expect(
    await trafficNotices(app, {
      sub: 'member',
      role: 'user',
      tools: ['ofertas', 'nav:scoped', 'nav:offers-all'],
    }),
  ).toEqual([]);
  expect(db).not.toHaveBeenCalled();
  expect(canReceiveTraffic({ role: 'user', tools: [] })).toBe(false);
  expect(canReceiveTraffic({ role: 'user', tools: grants })).toBe(true);
});
