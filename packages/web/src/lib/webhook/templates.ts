/**
 * Webhook templates per checkout platform. Each template is a sample payload
 * the platform actually sends, taken from public docs / observed traffic.
 * Edit before firing — the UI loads them as a starting point.
 */

export type WebhookPlatform =
  | 'hotmart'
  | 'kiwify'
  | 'eduzz'
  | 'monetizze'
  | 'braip'
  | 'ticto'
  | 'cakto'
  | 'perfectpay'
  | 'stripe'
  | 'generic';

export interface WebhookTemplate {
  /** Stable id used in localStorage history. */
  id: string;
  /** Display name in the UI dropdown. */
  label: string;
  /** Headers to add when firing (e.g. signature placeholder). */
  headers: Record<string, string>;
  /** Body sent in the POST. Editable in the UI. */
  body: Record<string, unknown>;
  /**
   * If set, the UI computes an HMAC of the request body using the user-supplied
   * secret and writes the hex digest into this header before firing.
   */
  hmac?: { header: string; algorithm: 'sha256' | 'sha1'; prefix?: string };
}

export interface WebhookPlatformDef {
  id: WebhookPlatform;
  label: string;
  templates: WebhookTemplate[];
}

export const WEBHOOK_PLATFORMS: WebhookPlatformDef[] = [
  {
    id: 'hotmart',
    label: 'Hotmart',
    templates: [
      {
        id: 'hotmart.purchase_approved',
        label: 'PURCHASE_APPROVED',
        headers: { 'X-Hotmart-Hottok': 'YOUR_HOTTOK_HERE' },
        body: {
          id: 'evt_01HXX',
          creation_date: Date.now(),
          event: 'PURCHASE_APPROVED',
          version: '2.0.0',
          data: {
            product: { id: 1234567, name: 'Meu Produto' },
            buyer: { name: 'Cliente Teste', email: 'cliente@example.com' },
            purchase: {
              transaction: 'HP01234567',
              status: 'APPROVED',
              approved_date: Date.now(),
              price: { value: 197.0, currency_value: 'BRL' },
              offer: { code: 'OFFER01' },
              payment: { type: 'CREDIT_CARD', installments_number: 1 },
            },
          },
        },
      },
      {
        id: 'hotmart.purchase_refunded',
        label: 'PURCHASE_REFUNDED',
        headers: { 'X-Hotmart-Hottok': 'YOUR_HOTTOK_HERE' },
        body: {
          id: 'evt_01HXX',
          event: 'PURCHASE_REFUNDED',
          data: { purchase: { transaction: 'HP01234567', status: 'REFUNDED' } },
        },
      },
      {
        id: 'hotmart.subscription_cancellation',
        label: 'SUBSCRIPTION_CANCELLATION',
        headers: { 'X-Hotmart-Hottok': 'YOUR_HOTTOK_HERE' },
        body: {
          event: 'SUBSCRIPTION_CANCELLATION',
          data: { subscription: { code: 'SUB123', status: 'CANCELLED' } },
        },
      },
    ],
  },
  {
    id: 'kiwify',
    label: 'Kiwify',
    templates: [
      {
        id: 'kiwify.order_approved',
        label: 'order.approved',
        headers: {},
        hmac: { header: 'x-kiwify-signature', algorithm: 'sha1' },
        body: {
          order_id: 'kw_01ABC',
          order_status: 'paid',
          product_name: 'Meu Produto',
          Customer: { email: 'cliente@example.com', full_name: 'Cliente Teste' },
          Commissions: { charge_amount: 19700, currency: 'BRL' },
          webhook_event_type: 'order_approved',
        },
      },
      {
        id: 'kiwify.order_refunded',
        label: 'order.refunded',
        headers: {},
        hmac: { header: 'x-kiwify-signature', algorithm: 'sha1' },
        body: {
          order_id: 'kw_01ABC',
          order_status: 'refunded',
          webhook_event_type: 'order_refunded',
        },
      },
    ],
  },
  {
    id: 'eduzz',
    label: 'Eduzz',
    templates: [
      {
        id: 'eduzz.invoice_paid',
        label: 'invoice_paid',
        headers: {},
        body: {
          api_key: 'YOUR_API_KEY',
          trans_cod: 'EZ12345',
          trans_status: 'paid',
          product_name: 'Meu Produto',
          cus_email: 'cliente@example.com',
          trans_value: 197.0,
        },
      },
    ],
  },
  {
    id: 'monetizze',
    label: 'Monetizze',
    templates: [
      {
        id: 'monetizze.venda_finalizada',
        label: 'venda.finalizada',
        headers: {},
        body: {
          tipoEvento: 'venda',
          venda: {
            codigo: 'MZ123456',
            status: 'Finalizada',
            valor: 197.0,
            comprador: { email: 'cliente@example.com', nome: 'Cliente Teste' },
            produto: { nome: 'Meu Produto', codigo: 12345 },
          },
        },
      },
    ],
  },
  {
    id: 'braip',
    label: 'Braip',
    templates: [
      {
        id: 'braip.transaction_paid',
        label: 'transaction.paid',
        headers: { 'X-Braip-Token': 'YOUR_TOKEN_HERE' },
        body: {
          status: 'paid',
          transaction_code: 'BR12345',
          customer: { email: 'cliente@example.com' },
          product_name: 'Meu Produto',
          amount: 19700,
        },
      },
    ],
  },
  {
    id: 'ticto',
    label: 'Ticto',
    templates: [
      {
        id: 'ticto.purchase_paid',
        label: 'purchase.paid',
        headers: {},
        hmac: { header: 'x-ticto-signature', algorithm: 'sha256' },
        body: {
          status: 'paid',
          token: 'TT_TOKEN',
          order_id: 'TC123456',
          customer: { email: 'cliente@example.com', name: 'Cliente Teste' },
          product: { name: 'Meu Produto' },
          amount: 197.0,
        },
      },
    ],
  },
  {
    id: 'cakto',
    label: 'Cakto',
    templates: [
      {
        id: 'cakto.purchase_approved',
        label: 'purchase.approved',
        headers: {},
        body: {
          event: 'purchase.approved',
          data: {
            customer: { email: 'cliente@example.com', name: 'Cliente Teste' },
            product: { name: 'Meu Produto' },
            amount: 197.0,
            status: 'approved',
          },
        },
      },
    ],
  },
  {
    id: 'perfectpay',
    label: 'Perfect Pay',
    templates: [
      {
        id: 'perfectpay.sale_approved',
        label: 'sale.approved',
        headers: { 'token': 'YOUR_TOKEN_HERE' },
        body: {
          token: 'YOUR_TOKEN_HERE',
          code: 'PP12345',
          sale_status_enum: 2,
          sale_status_detail: 'approved',
          customer: { email: 'cliente@example.com', full_name: 'Cliente Teste' },
          product: { name: 'Meu Produto' },
          sale_amount: 197.0,
        },
      },
    ],
  },
  {
    id: 'stripe',
    label: 'Stripe',
    templates: [
      {
        id: 'stripe.checkout_session_completed',
        label: 'checkout.session.completed',
        headers: {},
        hmac: { header: 'stripe-signature', algorithm: 'sha256', prefix: 't=TIMESTAMP,v1=' },
        body: {
          id: 'evt_test_webhook',
          object: 'event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              amount_total: 19700,
              currency: 'brl',
              customer_email: 'cliente@example.com',
              payment_status: 'paid',
            },
          },
        },
      },
    ],
  },
  {
    id: 'generic',
    label: 'Genérico (livre)',
    templates: [
      {
        id: 'generic.test',
        label: 'Test event',
        headers: { 'Content-Type': 'application/json' },
        body: { event: 'test', timestamp: Date.now(), data: { sample: true } },
      },
    ],
  },
];

export function findTemplate(id: string): WebhookTemplate | null {
  for (const p of WEBHOOK_PLATFORMS) {
    const t = p.templates.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

export function platformOf(templateId: string): WebhookPlatform | null {
  for (const p of WEBHOOK_PLATFORMS) {
    if (p.templates.some((t) => t.id === templateId)) return p.id;
  }
  return null;
}
