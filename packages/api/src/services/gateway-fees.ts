import { gatewayFeesSchema } from '../lib/gateway-fee-model.js';
export { gatewayFeesSchema } from '../lib/gateway-fee-model.js';
import type { Sql } from 'postgres';
import { convertToBrlMinor } from './exchange-rate.js';

export interface FeeBucket {
  offer_id: string;
  provider: string;
  gross_brl_minor: string;
  sales: number;
  refunds: number;
  chargebacks: number;
  settings: unknown;
}
export interface CalculatedGatewayFee {
  provider: string;
  fees_brl_minor: number;
  percentage_brl_minor: number;
  fixed_brl_minor: number;
  reserve_brl_minor: number;
  penalty_brl_minor: number;
  penalty_count: number;
  missing_operations: number;
}
export function calculateGatewayFee(
  bucket: FeeBucket,
  tariffs: { fixed: number; refund: number; chargeback: number } | null,
): CalculatedGatewayFee {
  const config = gatewayFeesSchema.safeParse(bucket.settings);
  const count = Number(bucket.sales) + Number(bucket.refunds) + Number(bucket.chargebacks);
  if (!config.success || !tariffs)
    return {
      provider: bucket.provider,
      fees_brl_minor: 0,
      percentage_brl_minor: 0,
      fixed_brl_minor: 0,
      reserve_brl_minor: 0,
      penalty_brl_minor: 0,
      penalty_count: 0,
      missing_operations: count,
    };
  const model = config.data;
  const gross = Number(bucket.gross_brl_minor);
  return {
    provider: bucket.provider,
    fees_brl_minor:
      Math.round((gross * model.fee_pct) / 100) + tariffs.fixed * Number(bucket.sales),
    percentage_brl_minor: Math.round((gross * model.fee_pct) / 100),
    fixed_brl_minor: tariffs.fixed * Number(bucket.sales),
    reserve_brl_minor: Math.round((gross * model.reserve_pct) / 100),
    penalty_brl_minor:
      tariffs.refund * Number(bucket.refunds) + tariffs.chargeback * Number(bucket.chargebacks),
    penalty_count: Number(bucket.refunds) + Number(bucket.chargebacks),
    missing_operations: 0,
  };
}
export function totalGatewayFees(rows: CalculatedGatewayFee[]) {
  return rows.reduce(
    (total, row) => ({
      fees: total.fees + row.fees_brl_minor,
      reserve: total.reserve + row.reserve_brl_minor,
      penalties: total.penalties + row.penalty_brl_minor,
      penaltyCount: total.penaltyCount + row.penalty_count,
      missing: total.missing + row.missing_operations,
    }),
    { fees: 0, reserve: 0, penalties: 0, penaltyCount: 0, missing: 0 },
  );
}
export async function loadGatewayFees(db: Sql, offerIds: string[], from: Date, to: Date) {
  const buckets = await db<FeeBucket[]>`
    WITH scoped AS (
      SELECT p.offer_id,lower(trim(o.provider)) provider,
        CASE WHEN lower(trim(o.provider))='vendepay' THEN 'vendepay' ELSE COALESCE(o.gateway_connection_id,'unassigned') END connection_key,
        o.paid_at,o.refunded_at,o.chargeback_at,
        COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor WHEN rc.rate IS NOT NULL THEN (o.amount_minor*rc.rate)::bigint END,0) amount,
        CASE WHEN lower(trim(o.provider))='vendepay' THEN jsonb_build_object(
          'fee_pct',COALESCE(f.vendepay_fee_pct,9.9),'fixed_fee_minor',COALESCE(f.extra_fee_minor,149),
          'fee_currency',COALESCE(f.extra_fee_currency,'USD'),'reserve_pct',COALESCE(f.reserve_pct,6.9),
          'chargeback_fee_minor',2700,'refund_fee_minor',2700,'penalty_currency','USD')
          ELSE COALESCE(gc.fee_settings,'{}'::jsonb) END settings
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
      LEFT JOIN tracking_fee_settings f ON f.project_id=p.id
      LEFT JOIN tracking_gateway_connections gc ON gc.id=o.gateway_connection_id AND gc.project_id=p.id AND gc.provider=lower(trim(o.provider))
      LEFT JOIN exchange_rate_cache rc ON rc.base_currency=o.currency AND rc.target_currency='BRL'
      WHERE p.offer_id=ANY(${offerIds}) AND (
        (o.paid_at>=${from} AND o.paid_at<${to}) OR (o.refunded_at>=${from} AND o.refunded_at<${to}) OR (o.chargeback_at>=${from} AND o.chargeback_at<${to}))
    ) SELECT offer_id,provider,settings,
      COALESCE(sum(amount) FILTER(WHERE paid_at>=${from} AND paid_at<${to}),0)::text gross_brl_minor,
      count(*) FILTER(WHERE paid_at>=${from} AND paid_at<${to})::int sales,
      count(*) FILTER(WHERE refunded_at>=${from} AND refunded_at<${to})::int refunds,
      count(*) FILTER(WHERE chargeback_at>=${from} AND chargeback_at<${to})::int chargebacks
    FROM scoped GROUP BY offer_id,provider,connection_key,settings`;
  const conversionCache = new Map<string, Promise<number | null>>();
  const convert = (minor: number, currency: string) => {
    if (minor === 0) return Promise.resolve(0);
    const key = `${currency}:${minor}`;
    if (!conversionCache.has(key))
      conversionCache.set(
        key,
        convertToBrlMinor(minor, currency, db).then((r) => r?.brlMinor ?? null),
      );
    return conversionCache.get(key)!;
  };
  const result = new Map<string, CalculatedGatewayFee[]>();
  await Promise.all(
    buckets.map(async (bucket) => {
      const parsed = gatewayFeesSchema.safeParse(bucket.settings);
      let tariffs: { fixed: number; refund: number; chargeback: number } | null = null;
      if (parsed.success) {
        const fee = parsed.data;
        const [fixed, refund, chargeback] = await Promise.all([
          convert(fee.fixed_fee_minor, fee.fee_currency),
          convert(fee.refund_fee_minor, fee.penalty_currency ?? fee.fee_currency),
          convert(fee.chargeback_fee_minor, fee.penalty_currency ?? fee.fee_currency),
        ]);
        if (fixed !== null && refund !== null && chargeback !== null)
          tariffs = { fixed, refund, chargeback };
      }
      const group = result.get(bucket.offer_id) ?? [];
      group.push(calculateGatewayFee(bucket, tariffs));
      result.set(bucket.offer_id, group);
    }),
  );
  return result;
}
