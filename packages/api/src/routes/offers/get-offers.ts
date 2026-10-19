import {
  CreateOfferRequestSchema,
  type DailySnapshot,
  IngestSnapshotsRequestSchema,
  UpdateOfferRequestSchema,
} from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { BadRequestError, HttpProblem, zodToProblem } from '../../lib/problem.js';
import { canManageOffer } from '../../services/offer-store.js';
import {
  IntradayQuerySchema,
  RangeQuerySchema,
  offerToWire,
  resolveRange,
  snapshotToWire,
  validateMemberIds,
} from './offer-to-wire.js';

export function registerGetOffersRoutes(app: FastifyInstance) {
  // GET /v1/offers — list all offers belonging to the caller
  app.get('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    const includeAccess = req.user.role === 'admin';
    return reply.send({
      offers: offers.map((offer) =>
        offerToWire(offer, {
          includeAccess,
          canManage: canManageOffer(offer, req.user!.sub, req.user!.role === 'admin'),
          userId: req.user!.sub,
          isAdmin: req.user!.role === 'admin',
        }),
      ),
    });
  });

  // POST /v1/offers — a user may create and manage only their own offer.
  // Access to this route itself is gated by the `ofertas` tool in routes/index.
  app.post('/offers', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = CreateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    // Only an administrator may share an offer with other accounts. This
    // prevents a standard member from altering another user's tool scope via
    // the member_ids side effect in validateMemberIds.
    if (req.user.role !== 'admin' && parsed.data.member_ids !== undefined) {
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Somente administradores podem compartilhar uma oferta com outros membros.',
        code: 'forbidden',
      });
    }
    const memberIds =
      req.user.role === 'admin'
        ? await validateMemberIds(app, parsed.data.member_ids, req.user.sub)
        : undefined;
    const offer = await app.offerStore.create({
      userId: req.user.sub,
      name: parsed.data.name,
      utmifyAccessEnabled:
        parsed.data.utmify_access_enabled ??
        Boolean(parsed.data.utmify_login && parsed.data.utmify_password),
      ...(parsed.data.company_name ? { companyName: parsed.data.company_name } : {}),
      ...(parsed.data.dashboard_id ? { dashboardId: parsed.data.dashboard_id } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(memberIds ? { memberIds } : {}),
    });
    if (parsed.data.utmify_login && parsed.data.utmify_password) {
      await app.offerStore.setUtmifyCredentials(offer.id, {
        login: parsed.data.utmify_login,
        password: parsed.data.utmify_password,
      });
      const connected = await app.offerStore.get(offer.id);
      void app.utmifySync.syncOffer(connected, true).catch((error) => {
        app.log.warn({ error, offerId: offer.id }, 'initial utmify sync failed');
      });
      return reply
        .code(201)
        .send(
          offerToWire(connected, { includeAccess: req.user.role === 'admin', canManage: true }),
        );
    }
    return reply
      .code(201)
      .send(offerToWire(offer, { includeAccess: req.user.role === 'admin', canManage: true }));
  });

  // PATCH /v1/offers/:id — update name/status/links/etc
  app.patch<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const parsed = UpdateOfferRequestSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const current = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    let nextUtmifyCredentials: { login: string; password: string } | null = null;
    if (parsed.data.utmify_login || parsed.data.utmify_password) {
      const currentCredentials = await app.offerStore.getUtmifyCredentials(current.id);
      const login = parsed.data.utmify_login ?? currentCredentials?.login;
      const password = parsed.data.utmify_password ?? currentCredentials?.password;
      if (!login || !password) {
        throw new BadRequestError(
          'Informe login e senha para conectar a UTMify pela primeira vez.',
        );
      }
      nextUtmifyCredentials = { login, password };
    }
    if (req.user.role !== 'admin' && parsed.data.member_ids !== undefined) {
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Somente administradores podem alterar o acesso de outros membros.',
        code: 'forbidden',
      });
    }
    const memberIds =
      req.user.role === 'admin'
        ? await validateMemberIds(app, parsed.data.member_ids, current.userId)
        : undefined;
    const updated = await app.offerStore.update(req.params.id, current.userId, {
      ...parsed.data,
      ...(memberIds !== undefined ? { member_ids: memberIds } : {}),
    });
    if (nextUtmifyCredentials) {
      await app.offerStore.setUtmifyCredentials(updated.id, nextUtmifyCredentials);
    }
    const finalOffer = await app.offerStore.get(updated.id);
    if (
      finalOffer.utmifyConfigured &&
      finalOffer.dashboardId &&
      (parsed.data.dashboard_id || parsed.data.utmify_login || parsed.data.utmify_password)
    ) {
      void app.utmifySync.syncOffer(finalOffer, true).catch((error) => {
        app.log.warn({ error, offerId: finalOffer.id }, 'utmify reconnect sync failed');
      });
    }
    return reply.send(
      offerToWire(finalOffer, { includeAccess: req.user.role === 'admin', canManage: true }),
    );
  });

  // DELETE /v1/offers/:id
  app.delete<{ Params: { id: string } }>('/offers/:id', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    await app.snapshotStore.deleteAllForOffer(req.params.id);
    await app.intradayStore.deleteAllForOffer(req.params.id);
    await app.offerStore.delete(req.params.id, offer.userId);
    return reply.code(204).send();
  });

  // POST /v1/offers/:id/ingest — accept daily snapshots from n8n / external sources
  app.post<{ Params: { id: string } }>('/offers/:id/ingest', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    await app.offerStore.assertManager(req.params.id, req.user.sub, req.user.role === 'admin');
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
        ...(s.ads ? { ads: s.ads } : {}),
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
      const offer = await app.offerStore.assertAccess(
        req.params.id,
        req.user.sub,
        req.user.role === 'admin',
      );
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const snapshots = await app.snapshotStore.listRange(offer.id, range.from, range.to);
      const totals = app.snapshotStore.aggregate(snapshots);
      return reply.send({
        offer: offerToWire(offer, {
          includeAccess: req.user.role === 'admin',
          canManage: canManageOffer(offer, req.user.sub, req.user.role === 'admin'),
        }),
        from: range.from,
        to: range.to,
        snapshots: snapshots.map(snapshotToWire),
        totals,
      });
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/sync', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    // A sync acionada pelo operador reconstrói todo o histórico recente. A
    // rotina automática continua incremental para não sobrecarregar a UTMify.
    const result = await app.utmifySync.syncOffer(offer, true);
    return reply.send(result);
  });

  // GET /v1/offers/:id/utmify-capabilities — inspect the real response schema
  // without returning credentials, tokens, or the complete ads payload.
  app.get<{ Params: { id: string } }>('/offers/:id/utmify-capabilities', async (req, reply) => {
    if (!req.user) throw new BadRequestError('No user attached.');
    const offer = await app.offerStore.assertManager(
      req.params.id,
      req.user.sub,
      req.user.role === 'admin',
    );
    return reply.send(await app.utmifySync.inspectCapabilities(offer));
  });

  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/offers/:id/intraday',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const parsed = IntradayQuerySchema.safeParse(req.query);
      if (!parsed.success) throw zodToProblem(parsed.error, req.url);
      const offer = await app.offerStore.assertAccess(
        req.params.id,
        req.user.sub,
        req.user.role === 'admin',
      );
      return reply.send(await app.intradayStore.summary(offer.id, new Date(), parsed.data.date));
    },
  );
}
