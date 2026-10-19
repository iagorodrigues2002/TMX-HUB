import { ulid } from 'ulid';
import { readRotatingTrackingToken } from './attribution.js';
import type { VendepayTransaction } from './vendepay-ingestion-types.js';
export async function upsertVendepayOrder({
  sql,
  normalized,
  req,
  connection,
  ingestBrlMinor,
  ingestExchangeRate,
  ingestConvertedAt,
}: VendepayTransaction) {
  const event = normalized.event;
  const skipsUtmify = event.status === 'cancelled' || event.status === 'abandoned';
  const trackingIdentity = event.trackingSrc
    ? readRotatingTrackingToken(event.trackingSrc, req)
    : null;
  let attributedVisitorId =
    trackingIdentity?.projectId === connection.project_id ? trackingIdentity.visitorId : null;
  // Older checkout links sometimes carried a plain visitor id instead of
  // the signed TMX token. Accept it only when it already exists in this
  // project; never persist an arbitrary src value as a visitor identity.
  if (!attributedVisitorId && event.trackingSrc) {
    const [knownVisitor] = await sql<{ visitor_id: string }[]>`
            SELECT visitor_id FROM tracking_visitors
            WHERE project_id=${connection.project_id} AND visitor_id=${event.trackingSrc}
            LIMIT 1
          `;
    attributedVisitorId = knownVisitor?.visitor_id ?? null;
  }
  // If Vendepay omitted src, recover the visitor from identity data the
  // lead previously supplied to tmx.identify()/checkout. This is an exact
  // email/phone match scoped to the same offer, never a proximity guess.
  if (!attributedVisitorId && (event.buyer.email || event.buyer.phone)) {
    const [identityMatch] = await sql<{ visitor_id: string }[]>`
            SELECT e.visitor_id FROM tracking_events e
            WHERE e.project_id=${connection.project_id}
              AND e.received_at >= ${event.occurredAt}::timestamptz - interval '30 days'
              AND e.received_at <= ${event.occurredAt}::timestamptz + interval '1 day'
              AND (
                (${event.buyer.email ?? null}::text IS NOT NULL
                  AND lower(e.properties->>'email')=lower(${event.buyer.email ?? null}::text))
                OR
                (${event.buyer.phone ?? null}::text IS NOT NULL
                  AND regexp_replace(e.properties->>'phone','\\D','','g')=
                      regexp_replace(${event.buyer.phone ?? null}::text,'\\D','','g'))
              )
            ORDER BY abs(extract(epoch FROM (${event.occurredAt}::timestamptz-e.received_at)))
            LIMIT 1
          `;
    attributedVisitorId = identityMatch?.visitor_id ?? null;
  }
  let [productKind] = event.product.id
    ? await sql<{ kind: string }[]>`
              SELECT kind FROM tracking_product_kinds
              WHERE project_id = ${connection.project_id} AND product_id = ${event.product.id}
            `
    : [];
  if (!productKind && event.product.name) {
    [productKind] = await sql<{ kind: string }[]>`
            SELECT order_kind AS kind FROM tracking_orders
            WHERE project_id=${connection.project_id}
              AND order_kind <> 'unknown'
              AND lower(trim(product->>'name'))=lower(trim(${event.product.name}))
            ORDER BY updated_at DESC LIMIT 1
          `;
  }
  const orderKind = productKind?.kind ?? 'unknown';
  // Upsell checkouts frequently omit src/UTMs. Inherit them from the
  // closest prior front sale for the same exact email/phone so every
  // incremental order remains tied to the originating campaign.
  const [parentFront] = /^upsell(?:_[2-9][0-9]*)?$/.test(orderKind)
    ? await sql<
        Array<{
          external_id: string;
          visitor_id: string | null;
          attribution_source: Record<string, string>;
        }>
      >`
                SELECT external_id, visitor_id, attribution_source
                FROM tracking_orders
                WHERE project_id=${connection.project_id}
                  AND status='paid' AND order_kind='front'
                  AND occurred_at <= ${event.occurredAt}
                  AND occurred_at >= ${event.occurredAt}::timestamptz - interval '30 days'
                  AND (
                    (${event.buyer.email ?? null}::text IS NOT NULL
                      AND lower(buyer->>'email')=lower(${event.buyer.email ?? null}::text))
                    OR
                    (${event.buyer.phone ?? null}::text IS NOT NULL
                      AND regexp_replace(buyer->>'phone','\\D','','g')=
                          regexp_replace(${event.buyer.phone ?? null}::text,'\\D','','g'))
                  )
                ORDER BY occurred_at DESC LIMIT 1
              `
    : [];
  attributedVisitorId ??= parentFront?.visitor_id ?? null;
  const [visitorSource] = attributedVisitorId
    ? await sql<
        Array<{ first_source: Record<string, string>; last_source: Record<string, string> }>
      >`
              SELECT first_source, last_source FROM tracking_visitors
              WHERE project_id=${connection.project_id} AND visitor_id=${attributedVisitorId}
              LIMIT 1
            `
    : [];
  const resolvedAttributionSource = {
    ...(parentFront?.attribution_source ?? {}),
    ...(visitorSource?.first_source ?? {}),
    ...(visitorSource?.last_source ?? {}),
    ...event.source,
  };
  // BRL figures were computed before the transaction (see above) — the
  // rate lookup may make a network call and shouldn't hold a tx open.
  const amountBrlMinor = ingestBrlMinor;
  const exchangeRate = ingestExchangeRate;
  const convertedAt = ingestConvertedAt;
  // Some emergency/manual imports used Vendepay's visible eight-character
  // order code (the first UUID segment). When the authoritative webhook
  // later arrives, promote that row to the full UUID instead of counting
  // the same purchase twice.
  const uuidMatch = event.transactionId.match(
    /^([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  if (uuidMatch) {
    const legacyExternalId = uuidMatch[1]!.toUpperCase();
    await sql`
            UPDATE tracking_orders legacy
            SET external_id=${event.transactionId}, updated_at=now()
            WHERE legacy.project_id=${connection.project_id}
              AND legacy.provider='vendepay'
              AND upper(legacy.external_id)=${legacyExternalId}
              AND NOT EXISTS (
                SELECT 1 FROM tracking_orders canonical
                WHERE canonical.project_id=${connection.project_id}
                  AND canonical.provider='vendepay'
                  AND canonical.external_id=${event.transactionId}
              )
          `;
  }
  const [order] = await sql<{ id: string; status: string; order_kind: string }[]>`
          INSERT INTO tracking_orders
            (id, project_id, provider, external_id, status, amount_minor, currency,
             amount_brl_minor, exchange_rate, converted_at,
             visitor_id, buyer, raw_status, occurred_at, paid_at, payment_method,
             product, attribution_source, order_kind, cancelled_at, refunded_at, chargeback_at,
             vendepay_connection_id)
          VALUES
            (${ulid()}, ${connection.project_id}, 'vendepay', ${event.transactionId},
             ${event.status}, ${event.amountMinor ?? null}, ${event.currency ?? null},
             ${amountBrlMinor}, ${exchangeRate}, ${convertedAt},
             ${attributedVisitorId ?? null}, ${sql.json(event.buyer)}, ${event.rawStatus ?? null},
             ${event.occurredAt}, ${event.status === 'paid' ? event.occurredAt : null},
             ${event.paymentMethod ?? null}, ${sql.json(event.product)}, ${sql.json(resolvedAttributionSource)},
             ${orderKind}, ${event.status === 'cancelled' ? event.occurredAt : null},
             ${event.status === 'refunded' ? event.occurredAt : null},
             ${event.status === 'chargeback' ? event.occurredAt : null}, ${connection.id})
          ON CONFLICT (project_id, provider, external_id) DO UPDATE SET
            status = CASE
              WHEN tracking_orders.status IN ('refunded', 'chargeback') THEN tracking_orders.status
              WHEN tracking_orders.status = 'paid' AND EXCLUDED.status IN ('pending', 'refused', 'unknown')
                THEN tracking_orders.status
              WHEN tracking_orders.status IN ('cancelled', 'refused') AND EXCLUDED.status IN ('pending', 'unknown')
                THEN tracking_orders.status
              ELSE EXCLUDED.status
            END,
            amount_minor = COALESCE(EXCLUDED.amount_minor, tracking_orders.amount_minor),
            currency = COALESCE(EXCLUDED.currency, tracking_orders.currency),
            amount_brl_minor = COALESCE(EXCLUDED.amount_brl_minor, tracking_orders.amount_brl_minor),
            exchange_rate = COALESCE(EXCLUDED.exchange_rate, tracking_orders.exchange_rate),
            converted_at = COALESCE(EXCLUDED.converted_at, tracking_orders.converted_at),
            visitor_id = COALESCE(EXCLUDED.visitor_id, tracking_orders.visitor_id),
            buyer = tracking_orders.buyer || EXCLUDED.buyer,
            raw_status = COALESCE(EXCLUDED.raw_status, tracking_orders.raw_status),
            payment_method = COALESCE(EXCLUDED.payment_method, tracking_orders.payment_method),
            product = tracking_orders.product || EXCLUDED.product,
            attribution_source = tracking_orders.attribution_source || EXCLUDED.attribution_source,
            occurred_at = LEAST(tracking_orders.occurred_at, EXCLUDED.occurred_at),
            paid_at = CASE
              WHEN EXCLUDED.status = 'paid' THEN COALESCE(tracking_orders.paid_at, EXCLUDED.paid_at)
              ELSE tracking_orders.paid_at
            END,
            cancelled_at = CASE
              WHEN EXCLUDED.status = 'cancelled'
                THEN COALESCE(tracking_orders.cancelled_at, EXCLUDED.cancelled_at, now())
              ELSE tracking_orders.cancelled_at
            END,
            refunded_at = CASE
              WHEN EXCLUDED.status = 'refunded'
                THEN COALESCE(tracking_orders.refunded_at, EXCLUDED.refunded_at, now())
              ELSE tracking_orders.refunded_at
            END,
            chargeback_at = CASE
              WHEN EXCLUDED.status = 'chargeback'
                THEN COALESCE(tracking_orders.chargeback_at, EXCLUDED.chargeback_at, now())
              ELSE tracking_orders.chargeback_at
            END,
            -- A mapping added after the order first arrived should still "heal" it on the
            -- next webhook (e.g. pending -> paid); never downgrade an already-known kind.
            order_kind = CASE
              WHEN EXCLUDED.order_kind <> 'unknown' THEN EXCLUDED.order_kind
              ELSE tracking_orders.order_kind
            END,
            vendepay_connection_id = EXCLUDED.vendepay_connection_id,
            updated_at = now()
          RETURNING id, status, order_kind
        `;
  return { event, skipsUtmify, attributedVisitorId, resolvedAttributionSource, order };
}
