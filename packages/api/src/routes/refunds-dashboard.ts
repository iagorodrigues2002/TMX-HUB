import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { convertToBrlMinor } from '../services/exchange-rate.js';
import { saoPauloParts } from '../services/intraday-store.js';
import { saoPauloDayRange } from '../services/utmify-sync.js';

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  offer_id: z.string().min(1).optional(),
  product: z.string().min(1).max(300).optional(),
});

const REFUND_CHARGEBACK_FEE_USD_MINOR = 2_700;
const unavailable = { error: 'tracking_database_unavailable' };

/**
 * Read-only financial view. Lifecycle timestamps are deliberately used here
 * rather than `updated_at`, so replaying an old webhook can never move an old
 * refund into today's report.
 */
const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{
    Querystring: { from?: string; to?: string; offer_id?: string; product?: string };
  }>('/tracking/refunds-dashboard', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!app.db) return reply.code(503).send(unavailable);
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_refund_filter' });

    const today = saoPauloParts(new Date()).date;
    const fromDate = parsed.data.from ?? today;
    const toDate = parsed.data.to ?? today;
    if (fromDate > toDate || toDate > today) return reply.code(400).send({ error: 'invalid_range' });
    const from = new Date(saoPauloDayRange(fromDate).from);
    const to = new Date(saoPauloDayRange(toDate).to);
    const accessible = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    const selectedOffers = parsed.data.offer_id
      ? accessible.filter((offer) => offer.id === parsed.data.offer_id)
      : accessible;
    if (parsed.data.offer_id && selectedOffers.length === 0) {
      return reply.code(404).send({ error: 'offer_not_found' });
    }
    const offerIds = selectedOffers.map((offer) => offer.id);
    const offerName = new Map(selectedOffers.map((offer) => [offer.id, offer.name]));
    if (!offerIds.length) return { from: fromDate, to: toDate, offers: [], products: [], vendepays: [], daily: [], items: [], totals: emptyTotals() };

    const productFilter = parsed.data.product ?? null;
    const rows = await app.db<Array<{
      id: string; offer_id: string; external_id: string; status: 'refunded' | 'chargeback';
      amount_minor: number | null; currency: string | null; amount_brl_minor: string | null;
      product_name: string; order_kind: string; lifecycle_at: string; buyer: { name?: string; email?: string };
      connection_name: string | null;
    }>>`
      SELECT o.id, p.offer_id, o.external_id, o.status, o.amount_minor, o.currency,
             o.amount_brl_minor::text, COALESCE(NULLIF(o.product->>'name',''), 'Produto não identificado') AS product_name,
             o.order_kind, COALESCE(o.refunded_at, o.chargeback_at) AS lifecycle_at, o.buyer,
             vc.name AS connection_name
      FROM tracking_orders o
      JOIN tracking_projects p ON p.id=o.project_id
      LEFT JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id
      WHERE p.offer_id = ANY(${offerIds})
        AND o.status IN ('refunded','chargeback')
        AND COALESCE(o.refunded_at,o.chargeback_at) >= ${from}
        AND COALESCE(o.refunded_at,o.chargeback_at) < ${to}
        AND (${productFilter}::text IS NULL OR COALESCE(NULLIF(o.product->>'name',''), 'Produto não identificado')=${productFilter})
      ORDER BY COALESCE(o.refunded_at,o.chargeback_at) DESC, o.id DESC
    `;

    const asBrl = (row: (typeof rows)[number]) => {
      if (row.amount_brl_minor != null) return Number(row.amount_brl_minor);
      return row.currency === 'BRL' ? Number(row.amount_minor ?? 0) : 0;
    };
    const totals = emptyTotals();
    const byOffer = new Map<string, ReturnType<typeof emptyBreakdown>>();
    const byProduct = new Map<string, ReturnType<typeof emptyBreakdown>>();
    const byDay = new Map<string, ReturnType<typeof emptyBreakdown>>();
    const byVendepay = new Map<string, ReturnType<typeof emptyBreakdown>>();
    for (const row of rows) {
      const amount = asBrl(row);
      apply(totals, row.status, amount);
      const offer = byOffer.get(row.offer_id) ?? emptyBreakdown();
      apply(offer, row.status, amount); byOffer.set(row.offer_id, offer);
      const product = byProduct.get(row.product_name) ?? emptyBreakdown();
      apply(product, row.status, amount); byProduct.set(row.product_name, product);
      const vendepay = vendepayLabel(row.connection_name);
      const account = byVendepay.get(vendepay) ?? emptyBreakdown();
      apply(account, row.status, amount); byVendepay.set(vendepay, account);
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(row.lifecycle_at));
      const daily = byDay.get(day) ?? emptyBreakdown();
      apply(daily, row.status, amount); byDay.set(day, daily);
    }
    totals.fee_usd_minor = totals.count * REFUND_CHARGEBACK_FEE_USD_MINOR;
    const feeConversion = await convertToBrlMinor(totals.fee_usd_minor, 'USD', app.db);
    totals.fee_brl_minor = feeConversion?.brlMinor ?? 0;
    totals.fee_exchange_rate = feeConversion?.rate ?? null;
    return {
      from: fromDate, to: toDate, time_zone: 'America/Sao_Paulo',
      offers: selectedOffers.map((offer) => ({ offer_id: offer.id, offer_name: offer.name, ...(byOffer.get(offer.id) ?? emptyBreakdown()) })),
      products: [...byProduct.entries()].map(([product_name, value]) => ({ product_name, ...value })).sort((a,b) => b.brl_minor - a.brl_minor),
      vendepays: ['VendePay Iago', 'VendePay Lucas'].map((connection_name) => ({ connection_name, ...(byVendepay.get(connection_name) ?? emptyBreakdown()) }))
        .concat([...byVendepay.entries()].filter(([name]) => name !== 'VendePay Iago' && name !== 'VendePay Lucas').map(([connection_name, value]) => ({ connection_name, ...value })))
        .sort((a,b) => b.brl_minor - a.brl_minor),
      daily: [...byDay.entries()].map(([date, value]) => ({ date, ...value })).sort((a,b) => a.date.localeCompare(b.date)),
      items: rows.map((row) => ({ ...row, connection_name: vendepayLabel(row.connection_name), offer_name: offerName.get(row.offer_id) ?? row.offer_id, brl_minor: asBrl(row) })),
      totals,
    };
  });
};

function emptyBreakdown() { return { refunded_orders: 0, chargeback_orders: 0, refunded_brl_minor: 0, chargeback_brl_minor: 0, count: 0, brl_minor: 0 }; }
function emptyTotals() { return { ...emptyBreakdown(), fee_usd_minor: 0, fee_brl_minor: 0, fee_exchange_rate: null as number | null }; }
function apply(target: ReturnType<typeof emptyBreakdown> | ReturnType<typeof emptyTotals>, status: 'refunded' | 'chargeback', amount: number) {
  target.count += 1; target.brl_minor += amount;
  if (status === 'refunded') { target.refunded_orders += 1; target.refunded_brl_minor += amount; }
  else { target.chargeback_orders += 1; target.chargeback_brl_minor += amount; }
}

/** Uses the same connection names shown in Upsell Intelligence. */
function vendepayLabel(connectionName: string | null) {
  const normalized = (connectionName ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('iago')) return 'VendePay Iago';
  if (normalized.includes('lucas')) return 'VendePay Lucas';
  return connectionName?.trim() || 'VendePay não identificada';
}

export default plugin;
