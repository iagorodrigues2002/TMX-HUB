import type { ManagedTask } from './task-management.js';
export type CenterNotification =
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
      unread: true;
      createdAt: string;
      title: string;
      call: {
        callId: string;
        message: string;
        startsAt: string;
        meetingUrl: string;
        minutes: number;
      };
    };
