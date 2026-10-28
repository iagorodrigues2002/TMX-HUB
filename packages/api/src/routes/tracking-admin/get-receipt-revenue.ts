import type { FastifyInstance } from 'fastify';
import { hourlyReceiptRevenue, receiptRevenueRows } from '../../services/receipt-revenue.js';
import {
  type TrackingPeriodQuery,
  databaseUnavailable,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerGetReceiptRevenueRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/receipt-revenue',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { from, to } = parseTrackingDate(req.query);
      const rows = await receiptRevenueRows(app.db, req.params.id, to);
      if (rows.length > 20000)
        return reply.code(422).send({
          message:
            'Histórico excede o limite seguro desta consulta; série indisponível, sem truncar valores.',
        });
      return hourlyReceiptRevenue(rows, new Date(from), new Date(to));
    },
  );
}
