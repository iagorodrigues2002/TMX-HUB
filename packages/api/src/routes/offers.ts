import {
  CreateOfferRequestSchema,
  IngestSnapshotsRequestSchema,
  UpdateOfferRequestSchema,
  type DailySnapshot,
} from '@page-cloner/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BadRequestError, zodToProblem } from '../lib/problem.js';
import { computeMetrics } from '../services/snapshot-store.js';
import type { Offer } from '@page-cloner/shared';

function offerToWire(o: Offer): Record<string, unknown> {
  return {
    id: o.id,
    name: o.name,
    dashboard_id: o.dashboardId,
    description: o.description,
    status: o.status,
    fronts: o.fronts ?? [],
    upsells: o.upsells ?? [],
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const RangeQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function resolveRange(q: { from?: string; to?: string }): { from: string; to: string } {
  // Default: last 7 days inclusive (today minus 6).
  const to = q.to ?? isoToday();
  const from = q.from ?? isoNDaysAgo(6);
  return { from, to };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /v1/offers — list all offers belonging to the caller
  app.get('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offers = await app.offerStore.listByUser(req.user.sub);
    return reply.send({ offers: offers.map(offerToWire) });
  });

  // POST /v1/offers — create a new offer
  app.post('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = CreateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const offer = await app.offerStore.create({
      userId: req.user.sub,
      name: parsed.data.name,
      ...(parsed.data.dashboard_id ? { dashboardId: parsed.data.dashboard_id } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    });
    return reply.code(201).send(offerToWire(offer));
  });

  // PATCH /v1/offers/:id — update name/status/links/etc
  app.patch<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = UpdateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const updated = await app.offerStore.update(req.params.id, req.user.sub, parsed.data);
    return reply.send(offerToWire(updated));
  });

  // DELETE /v1/offers/:id
  app.delete<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    await app.offerStore.assertOwner(req.params.id, req.user.sub);
    await app.snapshotStore.deleteAllForOffer(req.params.id);
    await app.offerStore.delete(req.params.id, req.user.sub);
    return reply.code(204).send();
  });

  // POST /v1/offers/:id/ingest — accept daily snapshots from n8n / external sources
  app.post<{ Params: { id: string } }>('/offers/:id/ingest', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    await app.offerStore.assertOwner(req.params.id, req.user.sub);
    const parsed = IngestSnapshotsRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);

    const now = new Date().toISOString();
    const upserted: DailySnapshot[] = [];
    for (const s of parsed.data.snapshots) {
      const snap: DailySnapshot = {
        offerId: req.params.id,
        date: s.date,
        spend: s.spend,
        sales: s.sales,
        revenue: s.revenue,
        ic: s.ic,
        ...(s.impressions !== undefined ? { impressions: s.impressions } : {}),
        ...(s.clicks !== undefined ? { clicks: s.clicks } : {}),
        ...(s.adsets ? { adsets: s.adsets } : {}),
        updatedAt: now,
      };
      await app.snapshotStore.upsert(snap);
      upserted.push(snap);
    }
    return reply.send({
      offer_id: req.params.id,
      ingested: upserted.length,
      dates: upserted.map((s) => s.date),
    });
  });

  // GET /v1/offers/:id/snapshots?from=&to= — daily series + aggregated totals
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/offers/:id/snapshots',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const offer = await app.offerStore.assertOwner(req.params.id, req.user.sub);
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const snapshots = await app.snapshotStore.listRange(offer.id, range.from, range.to);
      const totals = app.snapshotStore.aggregate(snapshots);
      return reply.send({
        offer: offerToWire(offer),
        from: range.from,
        to: range.to,
        snapshots: snapshots.map(snapshotToWire),
        totals,
      });
    },
  );

  // GET /v1/dashboard/summary?from=&to= — cross-offer aggregation for the home
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/dashboard/summary',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const offers = await app.offerStore.listByUser(req.user.sub);
      const perOffer: Array<{
        offer: Record<string, unknown>;
        totals: ReturnType<typeof computeMetrics>;
        snapshots_count: number;
      }> = [];
      let spend = 0;
      let sales = 0;
      let revenue = 0;
      let ic = 0;
      for (const offer of offers) {
        const snaps = await app.snapshotStore.listRange(offer.id, range.from, range.to);
        const totals = app.snapshotStore.aggregate(snaps);
        spend += totals.spend;
        sales += totals.sales;
        revenue += totals.revenue;
        ic += totals.ic;
        perOffer.push({
          offer: offerToWire(offer),
          totals,
          snapshots_count: snaps.length,
        });
      }
      return reply.send({
        from: range.from,
        to: range.to,
        totals: computeMetrics({ spend, sales, revenue, ic }),
        offers: perOffer,
      });
    },
  );
};

function snapshotToWire(s: DailySnapshot): Record<string, unknown> {
  return {
    date: s.date,
    spend: s.spend,
    sales: s.sales,
    revenue: s.revenue,
    ic: s.ic,
    impressions: s.impressions,
    clicks: s.clicks,
    adsets: s.adsets,
    metrics: computeMetrics({ spend: s.spend, sales: s.sales, revenue: s.revenue, ic: s.ic }),
    updated_at: s.updatedAt,
  };
}

export default plugin;
