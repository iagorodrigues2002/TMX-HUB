import { refundOfferId } from './refunds-navigation';

export function resolveOfferContextId(
  pathname: string,
  search: Pick<URLSearchParams, 'get'>,
  offerIds: string[],
  storedOfferId: string,
) {
  // The refunds aggregate has no active offer, even if another screen stored one.
  if (pathname === '/reembolsos') return refundOfferId(search);
  const routeOfferId = /^\/ofertas\/([^/]+)$/.exec(pathname)?.[1];
  const candidate = routeOfferId || search.get('offer') || storedOfferId;
  return offerIds.includes(candidate) ? candidate : (offerIds[0] ?? '');
}
