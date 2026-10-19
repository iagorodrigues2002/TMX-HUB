import type { FastifyInstance } from 'fastify';
import { SUPPORTED_CURRENCIES, normalizeVendepay } from '../../integrations/vendepay/normalize.js';
import { convertToBrlMinor, warmupBrlRates } from '../../services/exchange-rate.js';
import { databaseUnavailable } from './pagination-schema.js';

export function registerPostOrdersBackfillCurrencyRoutes(app: FastifyInstance) {
  // Backfill: re-run the currency + BRL conversion on orders whose
  // currency is NULL (arrived before we mapped this Vendepay moeda code)
  // or whose amount_brl_minor is NULL (predates the conversion feature or
  // the rate service was down). Reads the original payload from
  // webhook_receipts so we don't lose data if normalization improves.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/orders/backfill-currency',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const rows = await app.db<
        Array<{
          order_id: string;
          amount_minor: number | null;
          currency: string | null;
          amount_brl_minor: number | null;
          payload: unknown;
        }>
      >`
        SELECT o.id AS order_id, o.amount_minor, o.currency, o.amount_brl_minor,
               r.payload
        FROM tracking_orders o
        JOIN tracking_projects p ON p.id = o.project_id
        LEFT JOIN webhook_receipts r ON r.order_id = o.id
        WHERE p.offer_id = ${req.params.id}
          AND (o.currency IS NULL OR o.amount_brl_minor IS NULL)
          AND o.amount_minor IS NOT NULL
        ORDER BY o.occurred_at DESC
        LIMIT 500
      `;
      // Warm the rate cache first so per-order lookups are pure cache hits.
      await warmupBrlRates(SUPPORTED_CURRENCIES, app.db);
      let currencyFixed = 0;
      let brlFilled = 0;
      const failures: Array<{ order_id: string; reason: string }> = [];
      for (const row of rows) {
        // Re-derive currency from the original payload when we still don't
        // have one.
        let currency = row.currency;
        let amountMinor = row.amount_minor;
        if (!currency && row.payload) {
          const result = normalizeVendepay(row.payload);
          if (result.kind === 'processable') {
            currency = result.event.currency ?? null;
            amountMinor = result.event.amountMinor ?? row.amount_minor;
            if (currency && currency !== row.currency) currencyFixed++;
          }
        }
        if (!currency || amountMinor == null) {
          failures.push({ order_id: row.order_id, reason: 'currency_still_unknown' });
          continue;
        }
        // Compute BRL if missing.
        if (row.amount_brl_minor != null && currency === row.currency) continue;
        const converted = await convertToBrlMinor(amountMinor, currency, app.db);
        if (!converted) {
          failures.push({ order_id: row.order_id, reason: `no_rate_for_${currency}` });
          continue;
        }
        await app.db`
          UPDATE tracking_orders
          SET currency = ${currency},
              amount_minor = ${amountMinor},
              amount_brl_minor = ${converted.brlMinor},
              exchange_rate = ${converted.rate},
              converted_at = now()
          WHERE id = ${row.order_id}
        `;
        brlFilled++;
      }
      return reply.send({
        candidates: rows.length,
        currency_fixed: currencyFixed,
        brl_filled: brlFilled,
        failures,
      });
    },
  );

  // Re-apply lifecycle events kept in the immutable webhook receipt ledger.
  // This only changes historical refunded/chargeback orders, so it never
  // replays a paid purchase or emits a conversion a second time.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/orders/backfill-reversals',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const receipts = await app.db<Array<{ payload: unknown; connection_id: string }>>`
        SELECT r.payload, r.connection_id
        FROM webhook_receipts r
        JOIN vendepay_connections c ON c.id = r.connection_id
        JOIN tracking_projects p ON p.id = c.project_id
        WHERE p.offer_id = ${req.params.id}
          AND r.received_at >= now() - interval '180 days'
        ORDER BY r.received_at ASC
        LIMIT 5000
      `;
      let recognized = 0;
      let updated = 0;
      let missingOrder = 0;
      for (const receipt of receipts) {
        const normalized = normalizeVendepay(receipt.payload);
        if (
          normalized.kind !== 'processable' ||
          !['refunded', 'chargeback'].includes(normalized.event.status)
        )
          continue;
        recognized += 1;
        const event = normalized.event;
        const rows = await app.db`
          UPDATE tracking_orders o
          SET
            status = CASE
              WHEN o.status = 'chargeback' THEN 'chargeback'
              WHEN o.status = 'refunded' AND ${event.status} = 'refunded' THEN 'refunded'
              ELSE ${event.status}
            END,
            refunded_at = CASE
              WHEN ${event.status} = 'refunded' THEN COALESCE(o.refunded_at, ${event.occurredAt})
              ELSE o.refunded_at
            END,
            chargeback_at = CASE
              WHEN ${event.status} = 'chargeback' THEN COALESCE(o.chargeback_at, ${event.occurredAt})
              ELSE o.chargeback_at
            END,
            updated_at = now()
          FROM tracking_projects p
          WHERE o.project_id = p.id
            AND p.offer_id = ${req.params.id}
            AND o.gateway_connection_id = ${receipt.connection_id}
            AND o.external_id = ${event.transactionId}
          RETURNING o.id
        `;
        if (rows.length) updated += 1;
        else missingOrder += 1;
      }
      return reply.send({
        inspected: receipts.length,
        recognized,
        updated,
        missing_order: missingOrder,
      });
    },
  );

  // Force-resend UTMify deliveries that are already 'delivered' but were
  // sent with an older payload shape (e.g. before the utm_* name|id fix or
  // before the BRL conversion). Generates a fresh idempotency-key by
  // appending the attempts counter so UTMify actually re-processes rather
  // than returning the cached response.
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-deliveries/resend-paid',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const rows = await app.db<{ id: string }[]>`
        UPDATE tracking_delivery_outbox d
        SET state = 'pending', last_error = NULL, next_attempt_at = now()
        FROM tracking_projects p, tracking_orders o
        WHERE d.project_id = p.id
          AND o.id = d.order_id
          AND p.offer_id = ${req.params.id}
          AND d.destination_kind = 'utmify'
          AND d.state = 'delivered'
          AND o.status = 'paid'
        RETURNING d.id
      `;
      await Promise.allSettled(
        rows.map(({ id }) =>
          app.utmifyDeliveryQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-resend-${Date.now()}` },
          ),
        ),
      );
      return reply.send({ resend_queued: rows.length });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-deliveries/resend-value-repairs',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const rows = await app.db<{ id: string }[]>`
        UPDATE tracking_delivery_outbox d
        SET state = 'pending', last_error = NULL, next_attempt_at = now()
        FROM tracking_projects p, tracking_orders o
        WHERE d.project_id = p.id
          AND o.id = d.order_id
          AND p.offer_id = ${req.params.id}
          AND d.destination_kind = 'utmify'
          AND o.status = 'paid'
          AND o.amount_brl_minor IS NOT NULL
          AND o.converted_at IS NOT NULL
          AND o.converted_at > d.created_at
          AND o.converted_at >= now() - interval '30 minutes'
        RETURNING d.id
      `;
      await Promise.allSettled(
        rows.map(({ id }) =>
          app.utmifyDeliveryQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-value-repair-${Date.now()}` },
          ),
        ),
      );
      return reply.code(202).send({ repaired_queued: rows.length });
    },
  );
}
