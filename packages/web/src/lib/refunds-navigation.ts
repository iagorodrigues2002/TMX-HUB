import type { DateRange } from './date-range';

type Search = Pick<URLSearchParams, 'get'>;

export function refundOfferId(search: Search): string {
  // An explicitly empty canonical parameter means the existing aggregate, not the legacy offer.
  return search.get('offer') ?? search.get('offer_id') ?? '';
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function refundRouteFilters(search: Search, fallback: DateRange) {
  const from = search.get('from');
  const to = search.get('to');
  const range = validDate(from) && validDate(to) && from <= to ? { from, to } : fallback;
  return { offerId: refundOfferId(search), ...range };
}

export function refundReportHref(offerId: string, range: DateRange, search = '') {
  const params = new URLSearchParams(search);
  params.set('offer', offerId);
  params.delete('offer_id');
  params.set('from', range.from);
  params.set('to', range.to);
  return `/reembolsos?${params.toString()}`;
}

export function refundCompanyHref(companyId: string, range: DateRange, search = '') {
  const params = new URLSearchParams(search);
  if (companyId) params.set('company_id', companyId);
  else params.delete('company_id');
  params.delete('product');
  return refundReportHref('', range, params.toString());
}

export function refundOfferFilters(
  current: { offerId: string; product: string; page: number },
  offerId: string,
) {
  return current.offerId === offerId ? current : { offerId, product: '', page: 1 };
}
