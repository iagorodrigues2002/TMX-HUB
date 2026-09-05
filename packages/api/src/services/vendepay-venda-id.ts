const explicitVendaIdKeys = new Set([
  'vendid',
  'vendaid',
  'venda_id',
  'vend_id',
]);
const checkoutIdKeys = new Set([
  'checkoutid',
  'checkout_id',
  'idepotentialcheckoutid',
  'potentialcheckoutid',
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns only buyer-sale identifiers. Checkout and potential-checkout ids are
 * deliberately excluded: they identify the checkout configuration and can be
 * shared by multiple buyers, so they must never become an Upsell vendaId.
 */
export function collectVendaIdCandidates(payload: unknown, transactionId?: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const candidate = value.trim();
    if (!uuidPattern.test(candidate) || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (explicitVendaIdKeys.has(key.toLowerCase())) add(nested);
      walk(nested);
    }
  };
  walk(payload);
  // Some VendePay accounts expose the buyer vendaId only as the canonical
  // transaction UUID. It is a fallback and must be validated against an intent
  // before being persisted.
  add(transactionId);
  return candidates;
}

export function collectCheckoutIds(payload: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (checkoutIdKeys.has(key.toLowerCase()) && typeof nested === 'string') {
        const id = nested.trim();
        if (uuidPattern.test(id) && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      walk(nested);
    }
  };
  walk(payload);
  return ids;
}
