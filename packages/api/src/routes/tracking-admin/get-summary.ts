import type { FastifyInstance } from 'fastify';
import { getBrlRate } from '../../services/exchange-rate.js';
import { loadGatewayFees, totalGatewayFees } from '../../services/gateway-fees.js';
import { loadTrackingSummary } from './load-tracking-summary.js';
import {
  DEFAULT_FEE_SETTINGS,
  type TrackingPeriodQuery,
  databaseUnavailable,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerGetSummaryRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/summary',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from_date: fromDate, to_date: toDate, from, to } = parseTrackingDate(req.query);
      return app.analyticsCache.getOrSet(
        {
          endpoint: 'tracking-summary',
          offerId: req.params.id,
          from: fromDate,
          to: toDate,
          ttlSeconds: 30,
        },
        async () => {
          const summary = await loadTrackingSummary(app, req, from, to);
          const [feeRow] = await app.db!<
            Array<{
              vendepay_fee_pct: string;
              extra_fee_minor: string;
              extra_fee_currency: string;
              reserve_pct: string;
              reserve_days: number;
              payout_days: number;
            }>
          >`
        SELECT vendepay_fee_pct, extra_fee_minor, extra_fee_currency, reserve_pct,
               reserve_days, payout_days
        FROM tracking_fee_settings
        WHERE project_id = (SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id})
      `;
          const fee = feeRow ?? DEFAULT_FEE_SETTINGS;
          const gatewayFees =
            (await loadGatewayFees(app.db!, [req.params.id], new Date(from), new Date(to))).get(
              req.params.id,
            ) ?? [];
          const feeTotal = totalGatewayFees(gatewayFees);
          const grossBrlMinor = Number(summary?.paid_revenue_brl_minor ?? 0);
          const feeVendepayBrlMinor = gatewayFees
            .filter((f) => f.provider === 'vendepay')
            .reduce((total, f) => total + f.percentage_brl_minor, 0);
          const feeExtraBrlMinor = gatewayFees
            .filter((f) => f.provider === 'vendepay')
            .reduce((total, f) => total + f.fixed_brl_minor, 0);
          const reserveBrlMinor = feeTotal.reserve;
          const refundedBrlMinor = Number(summary?.refunded_revenue_brl_minor ?? 0);
          const chargebackBrlMinor = Number(summary?.chargeback_revenue_brl_minor ?? 0);
          const refundChargebackFeeCount = feeTotal.penaltyCount;
          const refundChargebackFeeBrlMinor = feeTotal.penalties;
          // "Total" includes the reserve as if it were already released; "available"
          // subtracts it too, since Vendepay is still holding it back. The reserve
          // never gets added to either figure twice — total = available + reserve.
          const netRevenueBrlMinor =
            grossBrlMinor -
            refundedBrlMinor -
            chargebackBrlMinor -
            feeTotal.fees -
            refundChargebackFeeBrlMinor;
          const netAvailableBrlMinor = netRevenueBrlMinor - reserveBrlMinor;
          const usdRate = await getBrlRate('USD', app.db!);
          const toUsdMinor = (brlMinor: number) => (usdRate ? Math.round(brlMinor / usdRate) : 0);
          return {
            date,
            time_zone: 'America/Sao_Paulo',
            ...(summary ?? {
              events: 0,
              visitors: 0,
              page_views: 0,
              ad_clicks: 0,
              connected_clicks: 0,
              checkouts: 0,
              checkout_events: 0,
              orders: 0,
              paid_orders: 0,
              failed_orders: 0,
              paid_buyers: 0,
              upsell_orders: 0,
              upsell_2_orders: 0,
              upsell_3_orders: 0,
              unmapped_paid_orders: 0,
              orphan_orders: 0,
              paid_revenue_minor: '0',
              paid_revenue_brl_minor: '0',
              paid_revenue_usd_minor: '0',
              unconverted_paid_orders: 0,
              refunded_orders: 0,
              refunded_revenue_brl_minor: '0',
              chargeback_orders: 0,
              chargeback_revenue_brl_minor: '0',
              webhooks_received: 0,
              webhooks_quarantined: 0,
              utmify_deliveries_attempted: 0,
              utmify_deliveries_lost: 0,
            }),
            fee_settings: {
              vendepay_fee_pct: Number(fee.vendepay_fee_pct),
              extra_fee_minor: Number(fee.extra_fee_minor),
              extra_fee_currency: fee.extra_fee_currency,
              reserve_pct: Number(fee.reserve_pct),
              reserve_days: fee.reserve_days,
              payout_days: fee.payout_days,
              configured: Boolean(feeRow),
            },
            gateway_fees: gatewayFees,
            fees_missing_operations: feeTotal.missing,
            fees_total_brl_minor: String(feeTotal.fees),
            refunded_revenue_usd_minor: String(toUsdMinor(refundedBrlMinor)),
            chargeback_revenue_usd_minor: String(toUsdMinor(chargebackBrlMinor)),
            fee_vendepay_brl_minor: String(feeVendepayBrlMinor),
            fee_vendepay_usd_minor: String(toUsdMinor(feeVendepayBrlMinor)),
            fee_extra_brl_minor: String(feeExtraBrlMinor),
            fee_extra_usd_minor: String(toUsdMinor(feeExtraBrlMinor)),
            refund_chargeback_fee_count: refundChargebackFeeCount,
            refund_chargeback_fee_brl_minor: String(refundChargebackFeeBrlMinor),
            refund_chargeback_fee_usd_minor: String(toUsdMinor(refundChargebackFeeBrlMinor)),
            reserve_brl_minor: String(reserveBrlMinor),
            reserve_usd_minor: String(toUsdMinor(reserveBrlMinor)),
            net_revenue_brl_minor: String(netRevenueBrlMinor),
            net_revenue_usd_minor: String(toUsdMinor(netRevenueBrlMinor)),
            net_available_brl_minor: String(netAvailableBrlMinor),
            net_available_usd_minor: String(toUsdMinor(netAvailableBrlMinor)),
          };
        },
      );
    },
  );
}
