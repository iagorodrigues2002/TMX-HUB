import type { AuthUser } from './auth-types.js';
import type { ToolKey } from './auth-types.js';
import { request } from './request.js';
export const endpoints = {
  async getAdminOverview(): Promise<{
    totals: { users: number; admins: number; restricted: number; active30d: number };
    users: Array<AuthUser & { activityCount: number; lastActivityAt?: string }>;
    recentActivity: Array<{
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
      userId: string;
      userName: string;
    }>;
  }> {
    type ActivityWire = {
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
      user_id: string;
      user_name: string;
    };
    type UserWire = {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
      allowed_tools?: ToolKey[];
      created_at: string;
      activity_count: number;
      last_activity_at?: string;
    };
    const wire = await request<{
      totals: { users: number; admins: number; restricted: number; active_30d: number };
      users: UserWire[];
      recent_activity: ActivityWire[];
    }>('/v1/admin/overview');
    return {
      totals: {
        users: wire.totals.users,
        admins: wire.totals.admins,
        restricted: wire.totals.restricted,
        active30d: wire.totals.active_30d,
      },
      users: wire.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        allowedTools: user.allowed_tools,
        createdAt: user.created_at,
        activityCount: user.activity_count,
        lastActivityAt: user.last_activity_at,
      })),
      recentActivity: wire.recent_activity.map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        label: entry.label,
        status: entry.status,
        createdAt: entry.createdAt,
        userId: entry.user_id,
        userName: entry.user_name,
      })),
    };
  },

  async listActivity(): Promise<
    Array<{
      kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
      id: string;
      label: string;
      status: string;
      createdAt: string;
    }>
  > {
    const wire = await request<{
      entries: Array<{
        kind: 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';
        id: string;
        label: string;
        status: string;
        createdAt: string;
      }>;
    }>('/v1/activity');
    return wire.entries;
  },
};
