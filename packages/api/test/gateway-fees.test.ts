import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/services/exchange-rate.js', () => ({
  convertToBrlMinor: vi.fn(async (minor: number, currency: string) => ({
    brlMinor: currency === 'USD' ? minor * 5 : minor,
  })),
}));
import {
  calculateGatewayFee,
  totalGatewayFees,
  loadGatewayFees,
  type FeeBucket,
} from '../src/services/gateway-fees.js';
const legacy = {
  fee_pct: 9.9,
  fixed_fee_minor: 149,
  fee_currency: 'USD',
  reserve_pct: 6.9,
  chargeback_fee_minor: 2700,
  refund_fee_minor: 2700,
};
const bucket = (provider: string, settings: unknown, gross = '10000'): FeeBucket => ({
  offer_id: 'offer-a',
  provider,
  settings,
  gross_brl_minor: gross,
  sales: 2,
  refunds: 1,
  chargebacks: 1,
});
describe('individual gateway fee arithmetic', () => {
  it('preserves the existing VendePay model only for its transactions', () => {
    expect(
      calculateGatewayFee(bucket('vendepay', legacy), {
        fixed: 745,
        refund: 13500,
        chargeback: 13500,
      }),
    ).toMatchObject({
      fees_brl_minor: 2480,
      reserve_brl_minor: 690,
      penalty_brl_minor: 27000,
      missing_operations: 0,
    });
  });
  it('sums different models without using VendePay fees on another gateway', () => {
    const v = calculateGatewayFee(bucket('vendepay', legacy), {
      fixed: 745,
      refund: 13500,
      chargeback: 13500,
    });
    const p = calculateGatewayFee(
      bucket('paysight', { ...legacy, fee_pct: 2, reserve_pct: 0 }, '20000'),
      { fixed: 0, refund: 100, chargeback: 500 },
    );
    expect(totalGatewayFees([v, p])).toEqual({
      fees: 2880,
      reserve: 690,
      penalties: 27600,
      penaltyCount: 4,
      missing: 0,
    });
  });
  it('flags unconfigured fees rather than inheriting another gateway model', () => {
    const result = calculateGatewayFee(bucket('paysight', {}), {
      fixed: 745,
      refund: 13500,
      chargeback: 13500,
    });
    expect(result).toMatchObject({
      fees_brl_minor: 0,
      reserve_brl_minor: 0,
      penalty_brl_minor: 0,
      missing_operations: 4,
    });
  });
  it('distinguishes explicit zero fees from missing settings or rates', () => {
    const zero = {
      ...legacy,
      fee_pct: 0,
      fixed_fee_minor: 0,
      reserve_pct: 0,
      chargeback_fee_minor: 0,
      refund_fee_minor: 0,
    };
    expect(
      calculateGatewayFee(bucket('paysight', zero), { fixed: 0, refund: 0, chargeback: 0 })
        .missing_operations,
    ).toBe(0);
    expect(calculateGatewayFee(bucket('paysight', legacy), null).missing_operations).toBe(4);
  });
  it('loads only scoped offers and converts VendePay penalties in USD even if its fixed tariff is BRL', async () => {
    const statements: string[] = [];
    const valuesSeen: unknown[][] = [];
    const db = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(strings.join('?'));
      valuesSeen.push(values);
      return [bucket('vendepay', { ...legacy, fee_currency: 'BRL', penalty_currency: 'USD' })];
    };
    const result = await loadGatewayFees(
      db as never,
      ['offer-a'],
      new Date('2026-09-01'),
      new Date('2026-10-01'),
    );
    expect(totalGatewayFees(result.get('offer-a')!)).toMatchObject({
      fees: 1288,
      penalties: 27000,
    });
    expect(valuesSeen[0]).toContainEqual(['offer-a']);
    expect(statements[0]).toContain('gc.project_id=p.id');
    expect(statements[0]).toContain('gc.provider=lower(trim(o.provider))');
  });
});
