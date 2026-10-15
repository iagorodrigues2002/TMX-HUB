import type { Offer } from '@page-cloner/shared';
import { describe, expect, it } from 'vitest';
import {
  canAccessOffer,
  canConfigureTrackingOffer,
  canManageOffer,
} from '../src/services/offer-store.js';

const offer: Offer = {
  id: 'offer-1',
  userId: 'owner-1',
  memberIds: ['member-1'],
  name: 'PJ01',
  status: 'testando',
  createdAt: '2026-07-22T12:00:00.000Z',
};

describe('offer member access', () => {
  it('allows only the owner and global admins to view', () => {
    expect(canAccessOffer(offer, 'owner-1')).toBe(true);
    expect(canAccessOffer(offer, 'member-1')).toBe(false);
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

  it('does not allow legacy tracking manager membership to bypass ownership', () => {
    expect(canConfigureTrackingOffer(offer, 'owner-1')).toBe(true);
    expect(canConfigureTrackingOffer(offer, 'member-1')).toBe(false);
    expect(canConfigureTrackingOffer(offer, 'member-1', false, 'tracking_manager')).toBe(false);
    expect(canConfigureTrackingOffer(offer, 'admin-1', true)).toBe(true);
  });
});
