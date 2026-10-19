import type { FastifyInstance } from 'fastify';
import { BadRequestError, HttpProblem, zodToProblem } from '../../lib/problem.js';
import { canManageOffer } from '../../services/offer-store.js';
import { computeMetrics } from '../../services/snapshot-store.js';
import {
  AiFeedbackSchema,
  RangeQuerySchema,
  assertAiAccess,
  offerToWire,
  resolveRange,
} from './offer-to-wire.js';

export function registerPatchAiAnalysesAnalysisIdFeedbackRoutes(app: FastifyInstance) {
  app.patch<{ Params: { id: string; analysisId: string } }>(
    '/offers/:id/ai-analyses/:analysisId/feedback',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      assertAiAccess(req.user);
      if (req.user.role !== 'admin') {
        throw new HttpProblem({
          status: 403,
          title: 'Forbidden',
          detail: 'Apenas administradores podem registrar feedback para a IA.',
          code: 'admin_required',
        });
      }
      await app.offerStore.assertAccess(req.params.id, req.user.sub, true);
      const parsed = AiFeedbackSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      return reply.send(
        await app.offerStore.setAiAnalysisFeedback(
          req.params.id,
          req.params.analysisId,
          parsed.data.feedback,
        ),
      );
    },
  );

  // GET /v1/dashboard/summary?from=&to= — account-isolated home dashboard.
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/dashboard/summary',
    async (req, reply) => {
      if (!req.user) throw new BadRequestError('No user attached.');
      const range = resolveRange(RangeQuerySchema.parse(req.query));
      const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
      const perOffer = await Promise.all(
        offers.map(async (offer) => {
          const snaps = await app.snapshotStore.listRange(offer.id, range.from, range.to);
          return {
            offer: offerToWire(offer, {
              includeAccess: req.user!.role === 'admin',
              canManage: canManageOffer(offer, req.user!.sub, req.user!.role === 'admin'),
            }),
            totals: app.snapshotStore.aggregate(snaps),
            snapshots_count: snaps.length,
            currency: offer.currency ?? 'BRL',
            owner_id: offer.userId,
          };
        }),
      );
      const owners = new Map<string, typeof perOffer>();
      for (const entry of perOffer) {
        const accountOffers = owners.get(entry.owner_id) ?? [];
        accountOffers.push(entry);
        owners.set(entry.owner_id, accountOffers);
      }
      const ownerUsers = await Promise.all(
        [...owners.keys()].map(async (id) => [id, await app.userStore.maybeGetById(id)] as const),
      );
      const ownerNames = new Map(
        ownerUsers.map(([id, user]) => [id, user?.name ?? 'Conta indisponível'] as const),
      );
      const accounts = [...owners.entries()].map(([ownerId, accountOffers]) => {
        const byCurrency = new Map<
          string,
          { spend: number; sales: number; revenue: number; ic: number }
        >();
        let spend = 0;
        let sales = 0;
        let revenue = 0;
        let ic = 0;
        for (const entry of accountOffers) {
          spend += entry.totals.spend;
          sales += entry.totals.sales;
          revenue += entry.totals.revenue;
          ic += entry.totals.ic;
          const currencyTotals = byCurrency.get(entry.currency) ?? {
            spend: 0,
            sales: 0,
            revenue: 0,
            ic: 0,
          };
          currencyTotals.spend += entry.totals.spend;
          currencyTotals.sales += entry.totals.sales;
          currencyTotals.revenue += entry.totals.revenue;
          currencyTotals.ic += entry.totals.ic;
          byCurrency.set(entry.currency, currencyTotals);
        }
        return {
          owner_id: ownerId,
          owner_name:
            ownerId === req.user!.sub
              ? 'Minha conta'
              : (ownerNames.get(ownerId) ?? 'Conta compartilhada'),
          is_current_user: ownerId === req.user!.sub,
          totals: computeMetrics({ spend, sales, revenue, ic }),
          currency_totals: [...byCurrency.entries()].map(([currency, values]) => ({
            currency,
            totals: computeMetrics(values),
          })),
          offers: accountOffers.map(
            ({ currency: _currency, owner_id: _ownerId, ...entry }) => entry,
          ),
        };
      });
      return reply.send({
        from: range.from,
        to: range.to,
        // Do not return a grand total: it could accidentally mix accounts in
        // a future client. Consumers must render the independent accounts.
        totals: null,
        currency_totals: [],
        accounts,
        offers: perOffer.map(({ currency: _currency, owner_id: _ownerId, ...entry }) => entry),
      });
    },
  );
}
