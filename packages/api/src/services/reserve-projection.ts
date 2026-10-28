import type { Sql } from 'postgres';

export interface ReserveBucket {
  purchase_date: string | null;
  release_date: string | null;
  sales: number;
  reserve_brl_minor: string;
  reversed_reserve_brl_minor: string;
  missing_values: number;
}

export function reserveProjection(rows: ReserveBucket[], today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== today)
    throw new Error('invalid_projection_date');
  const days = Array.from({ length: 91 }, (_, offset) => ({
    date: new Date(+date + offset * 86400000).toISOString().slice(0, 10),
    sales: 0,
    reserve_brl_minor: 0,
    reversed_reserve_brl_minor: 0,
    missing_values: 0,
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  let missing_dates = 0;
  for (const row of rows) {
    if (!row.release_date) {
      missing_dates += Number(row.sales);
      continue;
    }
    const day = byDate.get(row.release_date);
    if (!day) continue;
    const reserve = Number(row.reserve_brl_minor);
    const reversed = Number(row.reversed_reserve_brl_minor);
    if (
      ![reserve, reversed].every((value) => Number.isSafeInteger(value) && value >= 0) ||
      reversed > reserve
    )
      throw new Error('invalid_projection_amount');
    day.sales += Number(row.sales);
    day.reserve_brl_minor += reserve;
    day.reversed_reserve_brl_minor += reversed;
    day.missing_values += Number(row.missing_values);
  }
  const sum = (selected: typeof days) =>
    selected.reduce((total, day) => total + day.reserve_brl_minor, 0);
  const total = sum(days);
  if (!Number.isSafeInteger(total)) throw new Error('projection_amount_out_of_range');
  return {
    as_of: today,
    currency: 'BRL',
    time_zone: 'America/Sao_Paulo',
    provider: 'vendepay',
    basis: 'paid_date_plus_configured_reserve_days',
    today: days[0]!,
    next_7_brl_minor: sum(days.slice(1, 8)),
    next_30_brl_minor: sum(days.slice(1, 31)),
    pending_after_today_brl_minor: sum(days.slice(1)),
    original_reserve_maturing_brl_minor: total,
    missing_dates,
    first_recorded_purchase:
      rows
        .map((row) => row.purchase_date)
        .filter((value): value is string => !!value)
        .sort()[0] ?? null,
    days,
  };
}

export async function loadReserveProjection(db: Sql, offerIds: string[], today: string) {
  if (!offerIds.length) return reserveProjection([], today);
  const rows = await db<ReserveBucket[]>`
    WITH scoped AS (
      SELECT (o.paid_at AT TIME ZONE 'America/Sao_Paulo')::date purchase_date,
        COALESCE(f.reserve_days,90)::int reserve_days, COALESCE(f.reserve_pct,6.9) reserve_pct,
        COALESCE(o.amount_brl_minor,CASE WHEN o.currency='BRL' THEN o.amount_minor
          WHEN rc.rate>0 THEN ROUND(o.amount_minor*rc.rate)::bigint END) amount,
        o.status IN ('refunded','chargeback') OR o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL reversed
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
      LEFT JOIN tracking_fee_settings f ON f.project_id=p.id
      LEFT JOIN exchange_rate_cache rc ON rc.base_currency=o.currency AND rc.target_currency='BRL'
      WHERE p.offer_id=ANY(${offerIds}) AND lower(trim(o.provider))='vendepay'
        AND (o.paid_at IS NOT NULL OR o.status='paid')
    ) SELECT purchase_date::text,(purchase_date+reserve_days)::text release_date,
      count(*)::int sales,
      COALESCE(sum(ROUND(amount*reserve_pct/100)) FILTER(WHERE amount>=0 AND reserve_pct BETWEEN 0 AND 100),0)::text reserve_brl_minor,
      COALESCE(sum(ROUND(amount*reserve_pct/100)) FILTER(WHERE reversed AND amount>=0 AND reserve_pct BETWEEN 0 AND 100),0)::text reversed_reserve_brl_minor,
      count(*) FILTER(WHERE amount IS NULL OR amount<0 OR reserve_pct NOT BETWEEN 0 AND 100)::int missing_values
    FROM scoped GROUP BY purchase_date,reserve_days
  `;
  return reserveProjection(rows, today);
}
