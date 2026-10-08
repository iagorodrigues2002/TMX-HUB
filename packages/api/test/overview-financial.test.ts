import { describe, expect, it } from 'vitest';
import { overviewFinancials } from '../../web/src/lib/overview-financial.js';

const row = (id: string) => ({ offer_id: id, fees_brl_minor: '100', reserve_brl_minor: '50',
  net_revenue_brl_minor: '900', net_available_brl_minor: '850', refunded_revenue_brl_minor: '20',
  chargeback_revenue_brl_minor: '30', refund_chargeback_fee_brl_minor: '10' });
describe('overview financial isolation', () => {
  it('does not combine another account or unselected offer', () => {
    expect(overviewFinancials(['mine'], [row('mine'), row('other')])).toEqual({
      fees: 1, reserve: .5, net: 9, available: 8.5, refunds: .5, penalties: .1,
    });
  });
  it('does not show missing financial data as zero', () => {
    expect(overviewFinancials(['mine'], undefined)).toBeNull();
    expect(overviewFinancials(['mine', 'missing'], [row('mine')])).toBeNull();
  });
  it('consolidates all selected offers once', () => {
    expect(overviewFinancials(['a', 'b'], [row('a'), row('b')])?.fees).toBe(2);
  });
});
