import type { TrackingHealthView } from './offer-types.js';
import type { RecoveryView } from './recovery-types.js';
import { request } from './request.js';
export const endpoints = {
  async getTrackingHealth(id: string): Promise<TrackingHealthView> {
    return request(`/v1/offers/${id}/tracking/health`, { signal: AbortSignal.timeout(20_000) });
  },

  async updateTrackingHealthAlert(
    id: string,
    alertId: string,
    action: 'acknowledge' | 'resolve',
  ): Promise<{ ok: true; state: string }> {
    return request(`/v1/offers/${id}/tracking/health/alerts/${alertId}`, {
      method: 'POST',
      body: { action },
    });
  },

  async getRecovery(id: string): Promise<RecoveryView> {
    return request(`/v1/offers/${id}/recovery`);
  },
  async sendRecoveryTestEmail(
    id: string,
    body: { to: string; subject: string; message: string },
  ): Promise<{ accepted: true; provider_message_id: string | null; test_id: string }> {
    return request(`/v1/offers/${id}/recovery/test-email`, { method: 'POST', body });
  },
  async updateRecoverySettings(
    id: string,
    body: {
      checkout_url?: string;
      sender_name: string;
      quiet_start: number;
      quiet_end: number;
      enabled: boolean;
    },
  ): Promise<{ ok: true }> {
    return request(`/v1/offers/${id}/recovery/settings`, { method: 'PUT', body });
  },
  async updateRecoveryChannel(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{
    ok: true;
    kind: string;
    webhook_configured?: boolean;
    webhook_error?: string | null;
  }> {
    return request(`/v1/offers/${id}/recovery/channels`, { method: 'PUT', body });
  },
  async setupRecoveryEmailWebhook(id: string): Promise<{ ok: true; webhook_id: string | null }> {
    return request(`/v1/offers/${id}/recovery/email-webhook`, { method: 'POST' });
  },
  async syncRecovery(
    id: string,
  ): Promise<{ accepted: true; candidates: number; created: number; skipped: number }> {
    return request(`/v1/offers/${id}/recovery/sync`, { method: 'POST' });
  },
  async sendRecovery(
    id: string,
    opportunityId: string,
    channel: 'whatsapp' | 'sms' | 'email',
  ): Promise<{ accepted: true; message_id: string }> {
    return request(`/v1/offers/${id}/recovery/opportunities/${opportunityId}/send`, {
      method: 'POST',
      body: { channel },
    });
  },
  async bulkSendRecovery(
    id: string,
    channel: 'whatsapp' | 'sms' | 'email',
    limit = 100,
  ): Promise<{ accepted: true; selected: number; sent: number; failed: number }> {
    return request(`/v1/offers/${id}/recovery/bulk-send`, {
      method: 'POST',
      body: { channel, limit },
    });
  },
};
