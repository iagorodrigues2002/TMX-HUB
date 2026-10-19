/**
 * Builds Meta CAPI custom_data for a Purchase event.
 * Always includes value/currency/order_id (the essentials). Adds catalog
 * fields (content_ids, contents, num_items, content_type, content_name)
 * whenever the Vendepay payload gave us a product id, so Advantage+ / DPA
 * campaigns can match this purchase back to a product in the catalog.
 * Falls back gracefully when product data is missing: essentials still
 * ship, catalog fields are simply absent.
 */
export function buildPurchaseCustomData(row: {
  external_id: string;
  amount_minor: number | null;
  currency: string | null;
  amount_brl_minor: number | null;
  product: { id?: string; name?: string; planId?: string; planName?: string } | null;
}): Record<string, unknown> {
  // Always report in BRL when the ingestion converted successfully, so Meta's
  // ROAS lines up with the ad account (which runs in BRL). Fall back to the
  // original amount + currency only if conversion didn't happen (rate unknown
  // and never cached). This preserves the value → Meta always sees a number,
  // just occasionally in the original currency.
  const useBrl = row.amount_brl_minor != null;
  const minor = useBrl ? row.amount_brl_minor! : (row.amount_minor ?? 0);
  const value = Number((minor / 100).toFixed(2));
  const base: Record<string, unknown> = {
    order_id: row.external_id,
    value,
    currency: useBrl ? 'BRL' : row.currency,
  };
  // Prefer offer/plan id when present (an "offer" in Vendepay is a specific
  // price plan, closer to a SKU); fall back to the product id.
  const contentId = row.product?.planId?.trim() || row.product?.id?.trim();
  if (!contentId) return base;
  base.content_type = 'product';
  base.content_ids = [contentId];
  base.contents = [
    {
      id: contentId,
      quantity: 1,
      item_price: value,
    },
  ];
  base.num_items = 1;
  const name = row.product?.planName?.trim() || row.product?.name?.trim();
  if (name) base.content_name = name;
  return base;
}
