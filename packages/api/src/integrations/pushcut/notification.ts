/**
 * Builds the JSON body for a Pushcut webhook notification.
 * Reference: https://www.pushcut.io/support/notifications#webhook-json
 *
 * Pushcut's notification (title/sound/actions) is pre-defined in the app;
 * this JSON body overrides title/text dynamically per push and optionally
 * targets specific devices. Any other key Pushcut doesn't recognize is
 * ignored by their server, so it's safe to always include devices/title/
 * text even when empty/default.
 */

export interface PushcutOrderInput {
  kind: 'front' | 'upsell';
  buyerName?: string;
  productName?: string;
  amountBrlMinor: number | null;
  currency: string;
  country?: string;
  /** Gateway/account that originated the order, e.g. "Vendepay Iago". */
  platformName?: string;
  /** Offer/funnel name (e.g. "SLM_ESP"). Resolved from Redis (OfferStore)
   * at webhook-ingestion time, since the delivery worker only has a
   * Postgres connection. */
  funnelName?: string;
}

function money(brlMinor: number | null): string {
  if (brlMinor == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    brlMinor / 100,
  );
}

export function buildPushcutNotificationPayload(
  input: PushcutOrderInput,
  devices: string[],
): Record<string, unknown> {
  const buyer = input.buyerName?.trim() || 'Cliente';
  const product = input.productName?.trim();
  const amount = money(input.amountBrlMinor);
  const funnel = input.funnelName?.trim();
  const platform = input.platformName?.trim();
  const kindLabel = input.kind === 'upsell' ? 'Upsell aprovado' : 'Venda aprovada';
  const title = funnel ? `${kindLabel} · ${funnel}` : kindLabel;
  const details = product ? `${buyer} · ${product} · ${amount}` : `${buyer} · ${amount}`;
  const text = platform ? `${platform} · ${details}` : details;
  return {
    title,
    text,
    ...(devices.length > 0 ? { devices } : {}),
  };
}
