export * from '@page-cloner/shared/traffic-campaigns-model';

export type NativeFinanceOffer = Pick<
  import('@/lib/api-client').TrackingOverviewOffer,
  | 'offer_id'
  | 'offer_name'
  | 'owner_id'
  | 'fees_missing_operations'
  | 'gross_revenue_brl_minor'
  | 'gross_revenue_usd_minor'
  | 'net_available_brl_minor'
  | 'net_available_usd_minor'
>;
export function nativeTrafficFinance(
  rows: NativeFinanceOffer[] | undefined,
  userId: string | undefined,
  offer: string,
  links: Record<string, string>,
  currency: 'BRL' | 'USD',
  authorizedOffers = false,
) {
  if (!rows || !userId || offer === '__unclassified') return null;
  const own = authorizedOffers ? rows : rows.filter((row) => row.owner_id === userId);
  const candidates = own.filter((row) => row.offer_name.toUpperCase() === offer.toUpperCase());
  const id = links[offer] || (candidates.length === 1 ? candidates[0]!.offer_id : '');
  const selected = offer ? own.filter((row) => row.offer_id === id) : own;
  if (!selected.length || selected.some((row) => (row.fees_missing_operations ?? 0) > 0))
    return null;
  const minor = (field: 'net_available' | 'gross_revenue') => {
    const key = `${field}_${currency.toLowerCase()}_minor` as keyof (typeof selected)[number];
    const values = selected.map((row) => Number(row[key]));
    return values.every(Number.isSafeInteger) ? values.reduce((a, b) => a + b, 0) / 100 : null;
  };
  return { final: minor('net_available'), gross: minor('gross_revenue') };
}
