import { createHash } from 'node:crypto';
import {
  type VendepayNormalizeResult,
  VendepayWebhookSchema,
  amountToMinor,
  countryCode,
  currencyCode,
  get,
  isoDate,
  paymentMethodCode,
  statusAt,
  textAt,
  textByNormalizedKey,
} from './normalize-fields.js';

export function normalizeVendepay(raw: unknown, receivedAt = new Date()): VendepayNormalizeResult {
  const parsed = VendepayWebhookSchema.safeParse(raw);
  if (!parsed.success) {
    const key = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
    return {
      kind: 'quarantined',
      reason: 'invalid_envelope',
      diagnostics: ['Envelope inválido'],
      dedupeKey: key,
    };
  }
  const payload = parsed.data;
  const transactionId = textAt(payload, [
    'transaction_id',
    'transaction.id',
    'order.transaction_id',
    'data.transaction_id',
    'data.order_id',
    'order_id',
    'id',
    'checkoutId',
    'checkout.id',
  ]);
  const { status, rawStatus } = statusAt(payload);
  const eventId = textAt(payload, ['event_id', 'data.event_id', 'webhook_id']);
  const fallbackKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (!transactionId) {
    return {
      kind: 'quarantined',
      reason: 'missing_transaction_id',
      diagnostics: ['Nenhum identificador transacional reconhecido'],
      dedupeKey: eventId ?? fallbackKey,
    };
  }
  const buyerName = textAt(payload, [
    'buyer.name',
    'customer.name',
    'data.customer.name',
    'nomeComprador',
    'comprador.nome',
    'comprador.name',
  ]);
  const email = textAt(payload, [
    'buyer.email',
    'customer.email',
    'data.customer.email',
    'emailComprador',
    'comprador.email',
  ])?.toLowerCase();
  const phone = textAt(payload, [
    'buyer.phone',
    'customer.phone',
    'data.customer.phone',
    'telefoneComprador',
    'comprador.telefone',
    'comprador.phone',
  ]);
  const country = countryCode(
    textAt(payload, [
      'buyer.country',
      'buyer.address.country',
      'customer.country',
      'customer.country_code',
      'customer.address.country',
      'customer.address.country_code',
      'data.customer.country',
      'data.customer.country_code',
      'data.customer.address.country',
      'billing_address.country',
      'address.country',
      'endereco.pais',
      'comprador.pais',
      'checkout.pais',
    ]),
  );
  const postalCode = textAt(payload, [
    'buyer.postalCode',
    'buyer.postal_code',
    'buyer.zipCode',
    'buyer.zip_code',
    'buyer.zip',
    'buyer.cep',
    'buyer.address.postalCode',
    'buyer.address.postal_code',
    'buyer.address.zipCode',
    'buyer.address.zip_code',
    'buyer.address.zip',
    'buyer.address.cep',
    'customer.postalCode',
    'customer.postal_code',
    'customer.zipCode',
    'customer.zip_code',
    'customer.zip',
    'customer.cep',
    'customer.address.postalCode',
    'customer.address.postal_code',
    'customer.address.zipCode',
    'customer.address.zip_code',
    'customer.address.zip',
    'customer.address.cep',
    'data.customer.address.postalCode',
    'data.customer.address.postal_code',
    'data.customer.address.zipCode',
    'data.customer.address.zip_code',
    'data.customer.address.zip',
    'data.customer.address.cep',
    'billing_address.postal_code',
    'billing_address.zip',
    'billing_address.cep',
    'address.postal_code',
    'address.zip',
    'address.cep',
    'endereco.cep',
    'comprador.cep',
    'checkout.cep',
  ]);
  const occurredAt = isoDate(
    get(payload, 'paid_at') ??
      get(payload, 'updated_at') ??
      get(payload, 'created_at') ??
      get(payload, 'data.created_at') ??
      get(payload, 'createdAt'),
    receivedAt,
  );
  const amountMinor = amountToMinor(
    get(payload, 'amount') ??
      get(payload, 'total') ??
      get(payload, 'value') ??
      get(payload, 'data.amount') ??
      get(payload, 'valorPago') ??
      get(payload, 'checkout.total') ??
      get(payload, 'checkout.valor'),
  );
  const currency = currencyCode(
    textAt(payload, ['currency', 'data.currency', 'order.currency', 'moeda', 'checkout.moeda']),
  );
  const trackingSrc = textAt(payload, [
    'src',
    'metadata.src',
    'data.src',
    'order.src',
    'urlParams.src',
    // Current Vendepay payloads can rename the checkout query `src` to
    // trackeamentoId. Treat it as the same signed TMX tracking token.
    'trackeamentoId',
    'trackingId',
    'tracking_id',
    'data.trackeamentoId',
    'data.trackingId',
    'data.tracking_id',
    'order.trackeamentoId',
    'checkout.trackeamentoId',
  ]);
  const vendid =
    textAt(payload, [
      'vendid',
      'vendId',
      'vend_id',
      'data.vendid',
      'data.vendId',
      'order.vendid',
      'transaction.vendid',
      'customer.vendid',
      'buyer.vendid',
      'vendaId',
      'venda_id',
      'data.vendaId',
      'data.venda_id',
      'order.vendaId',
      'transaction.vendaId',
    ]) ?? textByNormalizedKey(payload, new Set(['vendid', 'vendaid']));
  const paymentMethod = paymentMethodCode(
    textAt(payload, [
      'payment_method',
      'paymentMethod',
      'transaction.payment_method',
      'data.payment_method',
      'order.payment_method',
      'metodoPagamento',
    ]),
  );
  const productId = textAt(payload, [
    'product.id',
    'data.product.id',
    'order.product_id',
    'product_id',
    'produtoId',
    'checkout.produtoId',
  ]);
  const productName = textAt(payload, [
    'product.name',
    'data.product.name',
    'order.product_name',
    'product_name',
    'nomeProduto',
  ]);
  const planId = textAt(payload, ['offer.id', 'plan.id', 'data.offer.id', 'offer_id', 'plan_id']);
  const planName = textAt(payload, [
    'offer.name',
    'plan.name',
    'data.offer.name',
    'offer_name',
    'plan_name',
  ]);
  const sourceEntries = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'sck',
    'fbclid',
    '_fbp',
    '_fbc',
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
    'placement',
    'site_source_name',
    'tmx_recovery',
    'tmx_recovery_opportunity',
    'tmx_recovery_message',
    'tmx_recovery_channel',
  ] as const;
  const source = {
    ...Object.fromEntries(
      sourceEntries.flatMap((key) => {
        const value = textAt(payload, [
          key,
          `metadata.${key}`,
          `data.${key}`,
          `tracking.${key}`,
          `trackingParameters.${key}`,
          `urlParams.${key}`,
          ...(key.startsWith('utm_')
            ? [
                key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
                `urlParams.${key.replace(/_([a-z])/g, (_, letter: string) =>
                  letter.toUpperCase(),
                )}`,
              ]
            : []),
        ]);
        return value ? [[key, value]] : [];
      }),
    ),
    ...(trackingSrc ? { src: trackingSrc } : {}),
  };
  const dedupeKey = eventId
    ? createHash('sha256')
        // Keep provider retries idempotent, but allow a corrected replay that
        // adds the tracking token omitted from the first payload. The order
        // upsert still guarantees a single commercial transaction.
        .update(`event|${eventId}|${trackingSrc ?? ''}`)
        .digest('hex')
    : createHash('sha256')
        .update(
          [
            'transaction',
            transactionId,
            status,
            amountMinor ?? '',
            currency ?? '',
            trackingSrc ?? '',
          ].join('|'),
        )
        .digest('hex');
  return {
    kind: 'processable',
    dedupeKey,
    event: {
      transactionId,
      ...(eventId ? { providerEventId: eventId } : {}),
      status,
      ...(rawStatus ? { rawStatus } : {}),
      ...(trackingSrc ? { trackingSrc } : {}),
      ...(vendid ? { vendid } : {}),
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(currency ? { currency } : {}),
      buyer: {
        ...(buyerName ? { name: buyerName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(country ? { country } : {}),
        ...(postalCode ? { postalCode } : {}),
      },
      ...(paymentMethod ? { paymentMethod } : {}),
      product: {
        ...(productId ? { id: productId } : {}),
        ...(productName ? { name: productName } : {}),
        ...(planId ? { planId } : {}),
        ...(planName ? { planName } : {}),
      },
      source,
      occurredAt,
    },
  };
}

export {
  SUPPORTED_CURRENCIES,
  VendepayWebhookSchema,
  type NormalizedVendepayEvent,
  type VendepayNormalizeResult,
  type VendepayStatus,
} from './normalize-fields.js';
