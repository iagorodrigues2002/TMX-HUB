import { type NavigationId, hasNavigationAccess } from '@page-cloner/shared';
import { HttpProblem } from './problem.js';

/** Additional area gate, never a replacement for company/offer ownership checks. */
export function navigationRequirements(rawPath: string, method: string): NavigationId[] | null {
  const path = rawPath.split('?')[0]!.replace(/^\/v1/, '');
  const read = method === 'GET' || method === 'HEAD';
  if (/^\/tracking\/(sale-notice|browser-push)/.test(path)) return null; // Personal opt-in, authorized separately.
  if (/^\/tracking\/upsell-operator-logs/.test(path) || path === '/activity')
    return ['operator-activity'];
  if (/^\/tracking\/destinations\/tiktok\//.test(path)) return ['integration-tiktok'];
  if (/^\/tracking\/syzepay\b/.test(path)) return ['integration-syzepay'];
  if (/^\/tracking\/refunds-dashboard\b/.test(path)) return ['refunds'];
  if (/^\/tracking\/reserve-projection\b/.test(path)) return ['company-finance'];
  if (/^\/tracking\/(overview|sales-composition)\b/.test(path) || /^\/dashboard(?:\/|$)/.test(path))
    return ['overview'];
  if (/^\/ads-intelligence\b/.test(path)) return ['ads-intelligence'];
  if (/^\/companies\/[^/]+\/payees\b/.test(path)) return ['company-finance'];
  if (/^\/companies\/[^/]+\/finance\b/.test(path)) return ['company-finance'];
  if (/^\/companies\/[^/]+\/members\b/.test(path)) return ['company-members'];
  if (/^\/offers(?:\/[^/]+)?$/.test(path)) return read ? null : ['offers-all']; // Shared authorized offer picker.
  const tracking = /^\/offers\/[^/]+\/tracking(?:\/(.*))?$/.exec(path);
  if (tracking) {
    const tail = tracking[1] ?? '';
    if (read && (tail === '' || tail === 'advanced')) return null; // Redacted by handler.
    if (/^upsell/.test(tail)) return ['tracking-upsell-intelligence'];
    if (/^refunds\b/.test(tail)) return ['refunds'];
    if (/^(summary|receipt-revenue|country-activity|countries|funnel-activity)$/.test(tail))
      return ['tracking-overview', 'overview'];
    if (/^(events|journeys|attribution|page-funnel|entry-links|ab-tests)(\/|$)/.test(tail))
      return ['tracking-journey'];
    if (/^(domains|setup)(\/|$)/.test(tail)) return ['tracking-capture'];
    if (/^(diagnostics|health|orphans)(\/|$)/.test(tail)) return ['tracking-diagnostics'];
    if (
      /^(vendepay|gateway|gateways|gateway-connections|fee-settings|product-kinds)(\/|$)/.test(tail)
    )
      return ['integration-payments'];
    if (/^utmify/.test(tail)) return ['integration-utmify'];
    if (/^google-ads/.test(tail)) return ['integration-google'];
    if (/^tiktok/.test(tail)) return ['integration-tiktok'];
    if (/^vturb/.test(tail)) return ['integration-vturb'];
    if (/^pushcut/.test(tail)) return ['integration-pushcut'];
    if (/^(meta|pixels)/.test(tail)) return ['integration-meta'];
    if (read && tail === 'orders') return ['tracking-overview', 'tracking-journey'];
    return []; // Unknown business endpoints stay closed for explicitly scoped members.
  }
  if (/^\/offers\/[^/]+\//.test(path)) return ['offer-detail'];
  if (/^\/tracking\//.test(path)) return [];
  return null;
}

export function assertNavigationAccess(
  user: { role: string; tools?: readonly string[] },
  path: string,
  method: string,
) {
  if (user.role === 'admin' || !user.tools?.includes('nav:scoped')) return;
  const required = navigationRequirements(path, method);
  if (required !== null && !required.some((id) => hasNavigationAccess(user.tools, id))) {
    throw new HttpProblem({
      status: 403,
      title: 'Forbidden',
      code: 'section_forbidden',
      detail: 'Esta área não está liberada para sua conta.',
    });
  }
}

export function canReadNavigation(
  user: { role: string; tools?: readonly string[] },
  id: NavigationId,
) {
  return user.role === 'admin' || hasNavigationAccess(user.tools, id);
}
