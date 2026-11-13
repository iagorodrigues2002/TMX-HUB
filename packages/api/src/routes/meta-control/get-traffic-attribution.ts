import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { filterCompanyNavigationOffers } from '../../lib/company-navigation-access.js';
import { validTrafficRange } from '../../services/meta-traffic-reader.js';
import { loadTrafficAttribution } from '../../services/traffic-attribution.js';
import { creativeWorkspaceCompany } from '../../services/traffic-server-cache.js';
const id = z.string().regex(/^\d+$/).nullable();
const money = z
  .string()
  .regex(/^-?\d+$/)
  .refine((s) => Number.isSafeInteger(Number(s)))
  .nullable();
export const trafficAttributionSchema = z.object({
  source: z.literal('tmx-tracking'),
  ownerId: z.string(),
  from: z.string(),
  to: z.string(),
  fetchedAt: z.string().datetime(),
  rows: z.array(
    z.object({
      offerId: z.string(),
      campaignId: id,
      adsetId: id,
      adId: id,
      accountId: id,
      fronts: z.number().int().nonnegative(),
      upsells: z.number().int().nonnegative(),
      naturalUpsells: z.number().int().nonnegative(),
      clickedUpsells: z.number().int().nonnegative(),
      naturalGrossBrlMinor: money,
      clickedGrossBrlMinor: money,
      naturalGrossUsdMinor: money,
      clickedGrossUsdMinor: money,
      grossBrlMinor: money,
      netBrlMinor: money,
      grossUsdMinor: money,
      upsellGrossBrlMinor: money.optional(),
      upsellGrossUsdMinor: money.optional(),
      netUsdMinor: money,
    }),
  ),
});
export function registerTrafficAttribution(app: FastifyInstance) {
  app.get('/meta-control/traffic/attribution', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('Cache-Control', 'private, no-store');
    const parsed = z.object({ from: z.string(), to: z.string() }).safeParse(req.query);
    if (!parsed.success || !validTrafficRange(parsed.data.from, parsed.data.to))
      return reply.code(400).send({ error: 'invalid_range' });
    const { from, to } = parsed.data;
    if (env.NODE_ENV === 'test' && req.user.sub === 'admin') {
      if (await app.redis.get('traffic-user:v1:admin:connection'))
        return reply.code(409).send({ error: 'personal_attribution_not_linked' });
      try {
        const config = z
          .object({
            port: z.number().int().min(1).max(65535),
            key: z.string().regex(/^[a-f0-9]{64}$/),
            viewerUserId: z.literal('admin'),
          })
          .parse(
            JSON.parse(
              await readFile(join(homedir(), '.codex/local-data/tmx/finance-bridge.json'), 'utf8'),
            ),
          );
        const res = await fetch(
          `http://127.0.0.1:${config.port}/attribution?${new URLSearchParams({ from, to })}`,
          {
            headers: { 'x-tmx-local-key': config.key },
            redirect: 'error',
            signal: AbortSignal.timeout(100000),
          },
        );
        if (!res.ok) throw Error('unavailable');
        const data = trafficAttributionSchema.parse(await res.json());
        if (data.ownerId !== '01KQSEXEWXZ9Y67V2HFK18JHJB' || data.from !== from || data.to !== to)
          throw Error('owner_or_period');
        return data;
      } catch {
        return reply.code(503).send({
          error: 'attribution_unavailable',
          detail: 'Não foi possível consultar a atribuição real do TMX.',
        });
      }
    }
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const company = await creativeWorkspaceCompany(app.redis, app.db, req.user, ['traffic-overview', 'traffic-campaigns', 'traffic-windows', 'ads-intelligence']);
    if (!company && env.NODE_ENV !== 'test') return reply.code(403).send({ error: 'company_forbidden' });
    const offers = company
      ? await app.db<{ id: string }[]>`
          SELECT offer_id AS id FROM company_offers WHERE company_id::text=${company}`
      : await filterCompanyNavigationOffers(
          app.db,
          req.user,
          await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin'),
          '/meta-control/traffic/attribution',
        );
    const rows = await loadTrafficAttribution(
      app.db,
      offers.map((o) => o.id),
      new Date(`${from}T03:00:00Z`),
      new Date(Date.parse(`${to}T03:00:00Z`) + 86400000),
    );
    return {
      source: 'tmx-tracking',
      ownerId: req.user.sub,
      from,
      to,
      fetchedAt: new Date().toISOString(),
      rows,
    };
  });
}
