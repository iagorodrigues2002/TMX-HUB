export interface GatewayOverviewRow {
  offer_id: string;
  provider: string;
  transactions: number;
  fronts: number;
  upsells: number;
  gross_brl_minor: string;
  missing_amounts: number;
}
import type { CalculatedGatewayFee } from './gateway-fees.js';
export function mergeGatewayFees(
  rows: ReturnType<typeof gatewayOverviewForOffers>,
  fees: CalculatedGatewayFee[],
) {
  const result = new Map(
    rows.map((row) => [
      row.provider,
      {
        ...row,
        fees_brl_minor: 0,
        reserve_brl_minor: 0,
        penalty_brl_minor: 0,
        fees_missing_operations: 0,
      },
    ]),
  );
  for (const fee of fees) {
    const row = result.get(fee.provider) ?? {
      provider: fee.provider,
      transactions: 0,
      fronts: 0,
      upsells: 0,
      gross_brl_minor: '0',
      missing_amounts: 0,
      fees_brl_minor: 0,
      reserve_brl_minor: 0,
      penalty_brl_minor: 0,
      fees_missing_operations: 0,
    };
    row.fees_brl_minor += fee.fees_brl_minor;
    row.reserve_brl_minor += fee.reserve_brl_minor;
    row.penalty_brl_minor += fee.penalty_brl_minor;
    row.fees_missing_operations += fee.missing_operations;
    result.set(fee.provider, row);
  }
  return [...result.values()];
}

/** Explicit owner+offer scope: never aggregate by a gateway display name. */
export function gatewayOverviewForOffers(rows: GatewayOverviewRow[], offerIds: string[]) {
  const allowed = new Set(offerIds);
  const groups = new Map<string, Omit<GatewayOverviewRow, 'offer_id'>>();
  for (const row of rows) {
    if (!allowed.has(row.offer_id)) continue;
    const previous = groups.get(row.provider) ?? {
      provider: row.provider,
      transactions: 0,
      fronts: 0,
      upsells: 0,
      gross_brl_minor: '0',
      missing_amounts: 0,
    };
    previous.transactions += Number(row.transactions);
    previous.fronts += Number(row.fronts);
    previous.upsells += Number(row.upsells);
    previous.gross_brl_minor = String(
      Number(previous.gross_brl_minor) + Number(row.gross_brl_minor),
    );
    previous.missing_amounts += Number(row.missing_amounts);
    groups.set(row.provider, previous);
  }
  return [...groups.values()].sort((a, b) => Number(b.gross_brl_minor) - Number(a.gross_brl_minor));
}
