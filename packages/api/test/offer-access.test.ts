import type { Offer } from '@page-cloner/shared';
import { describe, expect, it } from 'vitest';
import { canAccessOffer, canManageOffer } from '../src/services/offer-store.js';

const offer: Offer = {
  id: 'offer-1',
  userId: 'owner-1',
  memberIds: ['member-1'],
  name: 'PJ01',
  status: 'testando',
  createdAt: '2026-07-22T12:00:00.000Z',
};

describe('offer member access', () => {
  it('allows the owner, assigned members and admins to view', () => {
    expect(canAccessOffer(offer, 'owner-1')).toBe(true);
    expect(canAccessOffer(offer, 'member-1')).toBe(true);
    expect(canAccessOffer(offer, 'admin-1', true)).toBe(true);
  });

  it('hides the offer from unassigned members', () => {
    expect(canAccessOffer(offer, 'member-2')).toBe(false);
  });

  it('keeps management restricted to the owner or an admin', () => {
    expect(canManageOffer(offer, 'owner-1')).toBe(true);
    expect(canManageOffer(offer, 'member-1')).toBe(false);
    expect(canManageOffer(offer, 'admin-1', true)).toBe(true);
  });
});
