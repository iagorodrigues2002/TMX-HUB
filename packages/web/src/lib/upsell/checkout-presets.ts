/**
 * Per-platform column hints + approved-status values. Each platform exports
 * its sales report with a different schema; we use the hints to auto-map
 * columns to the canonical ID Cliente / Produto / Oferta / Status / Data fields.
 *
 * Hints are case-insensitive and matched as substrings against the column
 * header text. The first matching hint wins.
 */

export type CheckoutPlatform =
  | 'hotmart'
  | 'kiwify'
  | 'eduzz'
  | 'monetizze'
  | 'braip'
  | 'ticto'
  | 'cakto'
  | 'perfectpay'
  | 'generic';

export type CanonicalField = 'customerId' | 'product' | 'offer' | 'status' | 'dateTime';

export interface CheckoutPreset {
  id: CheckoutPlatform;
  label: string;
  /** Hints to auto-detect columns. Lowercased substring match against headers. */
  columnHints: Record<CanonicalField, string[]>;
  /**
   * Status values that count as a "completed sale" for the upsell.
   * Comparison is case-insensitive after trim.
   */
  approvedStatuses: string[];
}

export const CHECKOUT_PRESETS: Record<CheckoutPlatform, CheckoutPreset> = {
  hotmart: {
    id: 'hotmart',
    label: 'Hotmart',
    columnHints: {
      customerId: ['comprador - e-mail', 'comprador - email', 'e-mail comprador', 'email comprador', 'comprador email', 'email'],
      product: ['produto - nome', 'produto', 'product'],
      offer: ['oferta', 'offer'],
      status: ['status da transação', 'status transacao', 'status transação', 'status'],
      dateTime: ['data confirmação', 'data confirmacao', 'data da transação', 'data da transacao', 'data', 'date'],
    },
    approvedStatuses: ['approved', 'aprovada', 'aprovado', 'completed', 'paga', 'pago'],
  },
  kiwify: {
    id: 'kiwify',
    label: 'Kiwify',
    columnHints: {
      customerId: ['e-mail do cliente', 'email do cliente', 'e-mail', 'email'],
      product: ['nome do produto', 'produto', 'product name'],
      offer: ['nome da oferta', 'oferta', 'offer name', 'plano'],
      status: ['status do pedido', 'status'],
      dateTime: ['data da compra', 'data', 'date'],
    },
    approvedStatuses: ['paid', 'pago', 'paga', 'aprovado', 'aprovada', 'completed'],
  },
  eduzz: {
    id: 'eduzz',
    label: 'Eduzz',
    columnHints: {
      customerId: ['e-mail', 'email', 'comprador'],
      product: ['conteúdo', 'conteudo', 'produto'],
      offer: ['oferta', 'plano'],
      status: ['situação', 'situacao', 'status'],
      dateTime: ['data da venda', 'data aprovação', 'data aprovacao', 'data'],
    },
    approvedStatuses: ['paga', 'pago', 'aprovada', 'aprovado', 'recebida', 'recebido', 'paid'],
  },
  monetizze: {
    id: 'monetizze',
    label: 'Monetizze',
    columnHints: {
      customerId: ['e-mail comprador', 'email comprador', 'e-mail', 'email'],
      product: ['produto', 'item'],
      offer: ['combinação', 'combinacao', 'oferta'],
      status: ['status', 'situação', 'situacao'],
      dateTime: ['data', 'data compra'],
    },
    approvedStatuses: ['finalizada', 'aprovada', 'aprovado', 'pago', 'paga', 'completed'],
  },
  braip: {
    id: 'braip',
    label: 'Braip',
    columnHints: {
      customerId: ['e-mail comprador', 'email comprador', 'e-mail', 'email'],
      product: ['produto'],
      offer: ['plano', 'oferta'],
      status: ['status'],
      dateTime: ['data pagamento', 'data'],
    },
    approvedStatuses: ['aprovado', 'aprovada', 'pago', 'paga', 'paid'],
  },
  ticto: {
    id: 'ticto',
    label: 'Ticto',
    columnHints: {
      customerId: ['email cliente', 'e-mail cliente', 'email comprador', 'e-mail', 'email'],
      product: ['produto'],
      offer: ['oferta'],
      status: ['status'],
      dateTime: ['data', 'data pagamento'],
    },
    approvedStatuses: ['aprovado', 'aprovada', 'pago', 'paga', 'paid'],
  },
  cakto: {
    id: 'cakto',
    label: 'Cakto',
    columnHints: {
      customerId: ['e-mail', 'email'],
      product: ['produto'],
      offer: ['oferta', 'plano'],
      status: ['status'],
      dateTime: ['data'],
    },
    approvedStatuses: ['aprovado', 'aprovada', 'pago', 'paga', 'paid'],
  },
  perfectpay: {
    id: 'perfectpay',
    label: 'Perfect Pay',
    columnHints: {
      customerId: ['email comprador', 'e-mail comprador', 'email', 'e-mail'],
      product: ['produto'],
      offer: ['plano', 'oferta'],
      status: ['status'],
      dateTime: ['data'],
    },
    approvedStatuses: ['aprovado', 'aprovada', 'pago', 'paga', 'paid', 'completed'],
  },
  generic: {
    id: 'generic',
    label: 'Genérico (manual)',
    columnHints: {
      customerId: ['email', 'e-mail', 'cliente', 'customer'],
      product: ['produto', 'product'],
      offer: ['oferta', 'offer', 'plano'],
      status: ['status', 'situação', 'situacao'],
      dateTime: ['data', 'date'],
    },
    approvedStatuses: ['aprovado', 'aprovada', 'pago', 'paga', 'paid', 'approved', 'completed'],
  },
};

export const PLATFORM_OPTIONS: Array<{ value: CheckoutPlatform; label: string }> = (
  Object.keys(CHECKOUT_PRESETS) as CheckoutPlatform[]
).map((k) => ({ value: k, label: CHECKOUT_PRESETS[k].label }));

/**
 * Auto-map columns by trying each hint as a case-insensitive substring of the
 * header. Returns the column name (as it appears in the header) or null.
 */
export function autoMapColumn(headers: string[], hints: string[]): string | null {
  const normalized = headers.map((h) => ({ raw: h, low: h.toLowerCase().trim() }));
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const match = normalized.find((n) => n.low === h);
    if (match) return match.raw;
  }
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const match = normalized.find((n) => n.low.includes(h));
    if (match) return match.raw;
  }
  return null;
}

export function autoMapAllColumns(
  headers: string[],
  preset: CheckoutPreset,
): Record<CanonicalField, string | null> {
  return {
    customerId: autoMapColumn(headers, preset.columnHints.customerId),
    product: autoMapColumn(headers, preset.columnHints.product),
    offer: autoMapColumn(headers, preset.columnHints.offer),
    status: autoMapColumn(headers, preset.columnHints.status),
    dateTime: autoMapColumn(headers, preset.columnHints.dateTime),
  };
}

export function isApprovedStatus(value: string | undefined, preset: CheckoutPreset): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return preset.approvedStatuses.some((s) => v === s || v.includes(s));
}
