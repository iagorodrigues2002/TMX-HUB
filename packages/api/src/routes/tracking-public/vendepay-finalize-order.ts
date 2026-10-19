import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { encryptSecret } from '../../lib/secret-box.js';
import type { VendepayTransaction } from './vendepay-ingestion-types.js';
import type { upsertVendepayOrder } from './vendepay-upsert-order.js';
type PersistedOrder = Awaited<ReturnType<typeof upsertVendepayOrder>>;
export async function finalizeVendepayOrder({
  sql,
  connection,
  receiptId,
  ingestBrlMinor,
  event,
  skipsUtmify,
  attributedVisitorId,
  resolvedAttributionSource,
  order,
  funnelName,
}: Pick<VendepayTransaction, 'sql' | 'connection' | 'receiptId' | 'ingestBrlMinor'> &
  Omit<PersistedOrder, 'order'> & {
    order: NonNullable<PersistedOrder['order']>;
    funnelName: string | null;
  }) {
  // Only an explicit vendaId/vendid is authoritative at ingestion time.
  // Generic transaction and checkout UUIDs are validated against the
  // configured VendePay intent by Upsell Intelligence before storage.
  if (
    order.status === 'paid' &&
    order.order_kind === 'front' &&
    event.vendid &&
    env.TRACKING_ENCRYPTION_KEY
  ) {
    const identityVisitorId = attributedVisitorId ?? `vendepay:${event.transactionId}`;
    const vendidHash = createHash('sha256').update(event.vendid).digest('hex');
    await sql`
            DELETE FROM tracking_upsell_identities
            WHERE project_id=${connection.project_id} AND source_order_id=${order.id}
              AND vendid_hash<>${vendidHash}
          `;
    await sql`
            INSERT INTO tracking_upsell_identities
              (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,
               vendepay_connection_id)
            VALUES(${ulid()},${connection.project_id},${identityVisitorId},${vendidHash},
              ${encryptSecret(event.vendid, env.TRACKING_ENCRYPTION_KEY)},${order.id},${connection.id})
            ON CONFLICT(project_id,vendid_hash) DO UPDATE SET
              visitor_id=EXCLUDED.visitor_id,source_order_id=EXCLUDED.source_order_id,
              vendepay_connection_id=EXCLUDED.vendepay_connection_id,last_seen_at=now()
          `;
  }
  await sql`
          UPDATE webhook_receipts
          SET state='processed',order_id=${order.id},processed_at=now(),diagnostics='[]'::jsonb
          WHERE id = ${receiptId}
        `;
  if (order.status === 'paid') {
    const explicitMessageId = resolvedAttributionSource.tmx_recovery_message ?? null;
    const [recoveryMatch] = await sql<Array<{ id: string; message_id: string; channel: string }>>`
            SELECT ro.id,rm.id AS message_id,rc.kind AS channel
            FROM recovery_opportunities ro
            JOIN recovery_messages rm ON rm.opportunity_id=ro.id
            JOIN recovery_channels rc ON rc.id=rm.channel_id
            WHERE ro.project_id=${connection.project_id} AND ro.status <> 'recovered'
              AND rm.clicked_at IS NOT NULL
              AND (
                (${explicitMessageId}::text IS NOT NULL AND rm.id=${explicitMessageId})
                OR (${explicitMessageId}::text IS NULL AND (
                  (${event.buyer.email ?? null}::text IS NOT NULL AND lower(ro.email)=lower(${event.buyer.email ?? null}::text))
                  OR (${event.buyer.phone ?? null}::text IS NOT NULL AND regexp_replace(ro.phone,'\\D','','g')=regexp_replace(${event.buyer.phone ?? null}::text,'\\D','','g'))
                ))
              )
              AND rm.clicked_at >= ${event.occurredAt}::timestamptz - interval '30 days'
              AND rm.clicked_at <= ${event.occurredAt}::timestamptz + interval '10 minutes'
            ORDER BY (${explicitMessageId}::text IS NOT NULL AND rm.id=${explicitMessageId}) DESC,rm.clicked_at DESC
            LIMIT 1`;
    if (recoveryMatch) {
      await sql`
              UPDATE recovery_opportunities SET status='recovered',recovered_order_id=${order.id},
                recovered_message_id=${recoveryMatch.message_id},recovered_channel=${recoveryMatch.channel},
                recovered_at=COALESCE(recovered_at,now()),updated_at=now()
              WHERE id=${recoveryMatch.id}`;
      await sql`
              INSERT INTO recovery_message_events(id,message_id,opportunity_id,event_type,event_at,metadata)
              VALUES(${ulid()},${recoveryMatch.message_id},${recoveryMatch.id},'converted',${event.occurredAt},
                ${sql.json({ order_id: order.id, transaction_id: event.transactionId } as never)})`;
      await sql`UPDATE recovery_messages SET state='cancelled' WHERE opportunity_id=${recoveryMatch.id} AND state='pending'`;
    }
  }
  const utmify = await sql<{ id: string }[]>`
          SELECT id FROM tracking_utmify_destinations
          WHERE enabled = true
            AND (project_id = ${connection.project_id} OR (
              scope='global' AND COALESCE((
                SELECT r.enabled FROM tracking_utmify_global_offer_routes r
                WHERE r.project_id=${connection.project_id}
              ),true)=true
            ))
        `;
  const utmifyDeliveryIds =
    utmify.length === 0
      ? []
      : await sql<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type,
               state, last_error)
            SELECT batch.id, ${connection.project_id}, 'utmify', batch.destination_id, ${order.id},
               ${`vendepay:${event.transactionId}:${event.status}`}, ${`order.${event.status}`},
               ${skipsUtmify ? 'skipped' : 'pending'},
               ${
                 skipsUtmify
                   ? 'Cancelamento/abandono não é aceito pela UTMify; evento mantido apenas no TMX.'
                   : null
               }
            FROM unnest(
              ${sql.array(utmify.map(() => ulid()))}::text[],
              ${sql.array(utmify.map((destination) => destination.id))}::text[]
            ) AS batch(id, destination_id)
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
  const queuedUtmifyDeliveryIds = skipsUtmify ? [] : utmifyDeliveryIds.map((row) => row.id);
  if (order.status !== 'paid') {
    return {
      inserted: true,
      deliveryIds: [],
      utmifyDeliveryIds: queuedUtmifyDeliveryIds,
      pushcutDeliveryIds: [],
      tiktokDeliveryIds: [],
    };
  }
  // Pushcut notifies on every paid order regardless of kind — front and
  // upsell both matter to "did a sale just happen", unlike Meta CAPI
  // (below) which only wants front to keep campaign CPA honest.
  const pushcutDestinations = await sql<
    Array<{
      id: string;
      front_notification_name: string;
      upsell_notification_name: string | null;
    }>
  >`
          SELECT id, front_notification_name, upsell_notification_name
          FROM tracking_pushcut_destinations
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
  const eligiblePushcutDestinations = pushcutDestinations.filter((destination) => {
    const notificationName = /^upsell(?:_[2-9][0-9]*)?$/.test(order.order_kind)
      ? destination.upsell_notification_name
      : destination.front_notification_name;
    // Destination opted out of upsell alerts (upsell_notification_name
    // is null) — nothing to enqueue for it on an upsell order.
    return Boolean(notificationName);
  });
  const pushcutDeliveryIds =
    eligiblePushcutDestinations.length === 0
      ? []
      : await sql<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type,
               funnel_name)
            SELECT batch.id, ${connection.project_id}, 'pushcut', batch.destination_id, ${order.id},
               ${`vendepay:${event.transactionId}:${event.status}`}, ${`order.${order.order_kind}`},
               ${funnelName}
            FROM unnest(
              ${sql.array(eligiblePushcutDestinations.map(() => ulid()))}::text[],
              ${sql.array(eligiblePushcutDestinations.map((destination) => destination.id))}::text[]
            ) AS batch(id, destination_id)
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
  // Meta pixels are intentionally front-only. Upsells remain available
  // in TMX, UTMify and Pushcut, but must never populate or optimize any
  // Meta pixel connected to this offer.
  if (order.order_kind !== 'front') {
    return {
      inserted: true,
      deliveryIds: [],
      utmifyDeliveryIds: queuedUtmifyDeliveryIds,
      pushcutDeliveryIds: pushcutDeliveryIds.map((row) => row.id),
      tiktokDeliveryIds: [],
    };
  }
  const [rules] = await sql<Array<{ attributed_only: boolean; minimum_amount_minor: number }>>`
          SELECT attributed_only, minimum_amount_minor
          FROM tracking_meta_rules WHERE project_id = ${connection.project_id}
        `;
  if (
    (rules?.attributed_only && !event.trackingSrc) ||
    (rules && (event.amountMinor ?? 0) < rules.minimum_amount_minor)
  ) {
    return {
      inserted: true,
      deliveryIds: [],
      utmifyDeliveryIds: queuedUtmifyDeliveryIds,
      pushcutDeliveryIds: pushcutDeliveryIds.map((row) => row.id),
      tiktokDeliveryIds: [],
    };
  }
  const pixels = await sql<{ id: string }[]>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${connection.project_id} AND enabled = true
            AND (NOT EXISTS (SELECT 1 FROM meta_pixel_products mpp WHERE mpp.pixel_id=meta_pixels.id)
              OR ${event.product.id ?? null}::text IN (SELECT mpp.product_id FROM meta_pixel_products mpp WHERE mpp.pixel_id=meta_pixels.id))
        `;
  const deliveryIds =
    pixels.length === 0
      ? []
      : await sql<{ id: string }[]>`
            INSERT INTO meta_deliveries
              (id, project_id, pixel_id, order_id, event_id)
            SELECT batch.id, ${connection.project_id}, batch.pixel_id, ${order.id},
              ${`vendepay:${event.transactionId}:purchase`}
            FROM unnest(
              ${sql.array(pixels.map(() => ulid()))}::text[],
              ${sql.array(pixels.map((pixel) => pixel.id))}::text[]
            ) AS batch(id, pixel_id)
            ON CONFLICT (pixel_id, event_id) DO NOTHING
            RETURNING id
          `;
  // TikTok uses a separate durable delivery table because its Events API
  // has different credentials, payload and retry semantics. As with
  // Meta, only the approved front purchase feeds campaign optimization;
  // upsells remain in TMX/UTMify financial reporting.
  const tikTokDestinations = await sql<{ id: string }[]>`
          SELECT id FROM tracking_tiktok_destinations
          WHERE project_id=${connection.project_id} AND enabled=true
        `;
  const tiktokDeliveryIds =
    tikTokDestinations.length === 0
      ? []
      : await sql<{ id: string }[]>`
            INSERT INTO tracking_tiktok_deliveries
              (id,project_id,destination_id,order_id,event_id,event_name)
            SELECT batch.id,${connection.project_id},batch.destination_id,${order.id},
              ${`vendepay:${event.transactionId}:tiktok:purchase`},'Purchase'
            FROM unnest(
              ${sql.array(tikTokDestinations.map(() => ulid()))}::text[],
              ${sql.array(tikTokDestinations.map((destination) => destination.id))}::text[]
            ) AS batch(id, destination_id)
            ON CONFLICT(destination_id,event_id) DO NOTHING
            RETURNING id
          `;
  return {
    inserted: true,
    deliveryIds: deliveryIds.map((row) => row.id),
    utmifyDeliveryIds: queuedUtmifyDeliveryIds,
    pushcutDeliveryIds: pushcutDeliveryIds.map((row) => row.id),
    tiktokDeliveryIds: tiktokDeliveryIds.map((row) => row.id),
  };
}
