import type { ManagedTask } from './task-management.js';
export type CenterNotification =
  | {
      id: string;
      kind: 'traffic';
      unread: true;
      createdAt: string;
      title: string;
      traffic: {
        type: 'ad_rejected' | 'account_disabled';
        ownerId: string;
        companyId?: string;
        accountId: string;
        accountName: string;
        campaignId?: string;
        campaignName?: string;
        adId?: string;
        adName?: string;
      };
    }
  | {
      id: string;
      kind: 'finance';
      unread: true;
      createdAt: string;
      title: string;
      finance: {
        companyId: string;
        companyName: string;
        provider: string;
        direction: 'incoming' | 'outgoing';
        amount: string;
        currency: string;
        category: string;
        occurredAt: string;
      };
    }
  | {
      id: string;
      kind: 'task';
      unread: boolean;
      createdAt: string;
      title: string;
      task: ManagedTask;
    }
  | {
      id: string;
      kind: 'sale';
      unread: true;
      createdAt: string;
      title: string;
      sale: {
        id: string;
        offerId: string;
        offerName: string;
        provider: string;
        amountMinor: string | null;
        currency: string | null;
        orderKind: string | null;
        lastClick: { operatorId: string; operatorName: string | null } | null;
      };
    }
  | {
      id: string;
      kind: 'call';
      unread: boolean;
      createdAt: string;
      title: string;
      call: {
        callId: string;
        message: string;
        startsAt: string;
        meetingUrl: string;
        minutes: number | null;
      };
    };
