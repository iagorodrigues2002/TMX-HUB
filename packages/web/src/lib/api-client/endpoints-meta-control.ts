import { env } from '../env.js';
import type { MetaControlConnection } from './advertising-types.js';
import type { MetaControlDashboard } from './advertising-types.js';
import type { MetaPaymentPushcutConfig } from './advertising-types.js';
import { request } from './request.js';
export const endpoints = {
  baseUrl: env.NEXT_PUBLIC_API_URL,

  async getMetaControlConnection(): Promise<MetaControlConnection | null> {
    const response = await request<{ connection: MetaControlConnection | null }>(
      '/v1/meta-control/connection',
    );
    return response.connection;
  },

  async getMetaControlConnections(): Promise<MetaControlConnection[]> {
    const response = await request<{ connections: MetaControlConnection[] }>(
      '/v1/meta-control/connections',
    );
    return response.connections;
  },

  async saveMetaControlConnection(input: {
    name: string;
    app_id: string;
    app_secret: string;
    access_token: string;
  }): Promise<{ connection: MetaControlConnection; warning?: string; syncing?: boolean }> {
    return request('/v1/meta-control/connection', { method: 'POST', body: input });
  },

  async syncMetaControl(connectionId: string): Promise<{ accounts: number; campaigns: number }> {
    return request('/v1/meta-control/sync', {
      method: 'POST',
      body: { connection_id: connectionId },
    });
  },

  async getMetaControlDashboard(connectionId: string): Promise<MetaControlDashboard> {
    const params = new URLSearchParams({ connection_id: connectionId });
    return request(`/v1/meta-control/dashboard?${params.toString()}`);
  },

  async getMetaPaymentPushcut(connectionId: string): Promise<MetaPaymentPushcutConfig> {
    const response = await request<{ config: MetaPaymentPushcutConfig }>(
      `/v1/meta-control/connections/${connectionId}/pushcut`,
    );
    return response.config;
  },

  async saveMetaPaymentPushcut(
    connectionId: string,
    input: {
      secret?: string;
      notification_name: string;
      devices: string[];
      enabled: boolean;
    },
  ): Promise<MetaPaymentPushcutConfig> {
    const response = await request<{ config: MetaPaymentPushcutConfig }>(
      `/v1/meta-control/connections/${connectionId}/pushcut`,
      { method: 'PATCH', body: input },
    );
    return response.config;
  },

  async testMetaPaymentPushcut(connectionId: string): Promise<void> {
    await request(`/v1/meta-control/connections/${connectionId}/pushcut/test`, { method: 'POST' });
  },
};
