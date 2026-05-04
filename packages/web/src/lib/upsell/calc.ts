import { type CheckoutPreset, isApprovedStatus } from './checkout-presets';
import type { ParsedSheet } from './parse-spreadsheet';

export interface FunnelStepConfig {
  /** Display name (auto-numbered: Up01, Up02, …). */
  name: string;
  /** Product name in the spreadsheet. Empty string means "any product". */
  product: string;
  /** Offer codes/names that count for this step. */
  offers: string[];
}

export interface FrontConfig extends FunnelStepConfig {
  /** Optional HH:MM filter — only consider Front rows at/after this time. */
  startTime?: string;
}

export interface ColumnMap {
  customerId: string;
  product: string;
  offer: string;
  /** Only required for Upsell sheet — Front doesn't need status. */
  status?: string;
  /** Only required for Front when startTime filter is active. */
  dateTime?: string;
}

export interface CalcInput {
  preset: CheckoutPreset;
  front: { sheet: ParsedSheet; columns: ColumnMap; config: FrontConfig };
  upsell: { sheet: ParsedSheet; columns: ColumnMap };
  steps: FunnelStepConfig[];
}

export interface StepResult {
  name: string;
  product: string;
  offers: string[];
  /** Total Front-eligible customers considered. Same for every step. */
  eligible: number;
  /** Customer is in upsell sheet for this step AND has at least one approved status. */
  accepted: number;
  /** Customer is in upsell sheet for this step but no record was approved. */
  rejected: number;
  /** Customer was eligible but didn't appear in the upsell sheet for this step. */
  notSeen: number;
  /** Rates always sum to 100 (rounded such that they match exactly). */
  rates: { accepted: number; rejected: number; notSeen: number };
}

export interface CalcOutput {
  eligibleCount: number;
  steps: StepResult[];
}

function csvList(values: string[]): string[] {
  return values
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function matches(rowValue: string | undefined, candidate: string): boolean {
  if (!rowValue) return false;
  return rowValue.trim().toLowerCase() === candidate.toLowerCase();
}

function matchesAnyOffer(rowValue: string | undefined, offers: string[]): boolean {
  if (offers.length === 0) return true; // empty offer list = match any
  if (!rowValue) return false;
  const v = rowValue.trim().toLowerCase();
  return offers.includes(v);
}

/**
 * Parse "HH:MM" → minutes since midnight. Returns null on bad input.
 */
function timeToMinutes(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number.parseInt(m[1] ?? '0', 10);
  const mm = Number.parseInt(m[2] ?? '0', 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Extract HH:MM from a date/time cell in any common format.
 * Examples that work: "2025-04-01 14:35:00", "01/04/2025 14:35", "14:35".
 */
function extractMinutes(value: string | undefined): number | null {
  if (!value) return null;
  // Try ISO/space-separated formats first.
  const m = /(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number.parseInt(m[1] ?? '0', 10);
  const mm = Number.parseInt(m[2] ?? '0', 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Distribute rounded percentages so they sum to exactly 100.
 * (Largest-remainder method, Hare-Niemeyer.)
 */
function roundedPercents(parts: number[]): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total === 0) return parts.map(() => 0);
  const scaled = parts.map((p) => (p / total) * 100);
  const floored = scaled.map((s) => Math.floor(s));
  let rem = 100 - floored.reduce((a, b) => a + b, 0);
  // Distribute the remainder to the indices with the largest fractional parts.
  const order = scaled
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (const { i } of order) {
    if (rem <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    rem -= 1;
  }
  return out;
}

export function runCalculation(input: CalcInput): CalcOutput {
  const { preset, front, upsell, steps } = input;

  // 1) Build the eligible-customer set from Front.
  const frontProduct = front.config.product.trim().toLowerCase();
  const frontOffers = csvList(front.config.offers);
  const minThreshold = timeToMinutes(front.config.startTime ?? undefined);

  const eligible = new Set<string>();
  for (const row of front.sheet.rows) {
    const product = row[front.columns.product] ?? '';
    if (frontProduct.length > 0 && !matches(product, frontProduct)) continue;
    const offer = row[front.columns.offer] ?? '';
    if (!matchesAnyOffer(offer, frontOffers)) continue;
    if (minThreshold !== null && front.columns.dateTime) {
      const rowMin = extractMinutes(row[front.columns.dateTime]);
      if (rowMin === null || rowMin < minThreshold) continue;
    }
    const id = (row[front.columns.customerId] ?? '').toLowerCase();
    if (id.length > 0) eligible.add(id);
  }

  // 2) Index upsell rows by customerId.
  const upsellByCustomer = new Map<string, Array<Record<string, string>>>();
  for (const row of upsell.sheet.rows) {
    const id = (row[upsell.columns.customerId] ?? '').toLowerCase();
    if (id.length === 0) continue;
    const arr = upsellByCustomer.get(id);
    if (arr) arr.push(row);
    else upsellByCustomer.set(id, [row]);
  }

  // 3) For each step, walk the eligible set and bucket into accepted / rejected / notSeen.
  const stepResults: StepResult[] = steps.map((step) => {
    const stepProduct = step.product.trim().toLowerCase();
    const stepOffers = csvList(step.offers);

    let accepted = 0;
    let rejected = 0;
    let notSeen = 0;

    for (const id of eligible) {
      const records = upsellByCustomer.get(id) ?? [];
      const matching = records.filter((r) => {
        const product = r[upsell.columns.product] ?? '';
        if (stepProduct.length > 0 && !matches(product, stepProduct)) return false;
        const offer = r[upsell.columns.offer] ?? '';
        return matchesAnyOffer(offer, stepOffers);
      });
      if (matching.length === 0) {
        notSeen += 1;
        continue;
      }
      const anyApproved = matching.some((r) =>
        upsell.columns.status
          ? isApprovedStatus(r[upsell.columns.status], preset)
          : false,
      );
      if (anyApproved) accepted += 1;
      else rejected += 1;
    }

    const [aPct, rPct, nPct] = roundedPercents([accepted, rejected, notSeen]);
    return {
      name: step.name,
      product: step.product,
      offers: step.offers,
      eligible: eligible.size,
      accepted,
      rejected,
      notSeen,
      rates: { accepted: aPct ?? 0, rejected: rPct ?? 0, notSeen: nPct ?? 0 },
    };
  });

  return { eligibleCount: eligible.size, steps: stepResults };
}
