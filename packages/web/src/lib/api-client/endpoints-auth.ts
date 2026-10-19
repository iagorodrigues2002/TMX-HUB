import type { ApiError } from '../query-client.js';
import type { AuthUser } from './auth-types.js';
import type { AuthSessionWire } from './auth-types.js';
import type { ToolKey } from './auth-types.js';
import { request } from './request.js';
export const endpoints = {
  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const wire = await request<AuthSessionWire>('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    return { user: wire.user, token: wire.token };
  },

  async register(
    email: string,
    name: string,
    password: string,
    inviteToken?: string,
  ): Promise<{ user: AuthUser; token: string }> {
    const wire = await request<AuthSessionWire>('/v1/auth/register', {
      method: 'POST',
      body: {
        email,
        name,
        password,
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      },
    });
    return { user: wire.user, token: wire.token };
  },

  async me(): Promise<AuthUser> {
    const wire = await request<{ user: AuthUser }>('/v1/auth/me');
    return wire.user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await request('/v1/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
  },

  async adminResetOwnPassword(newPassword: string): Promise<void> {
    await request('/v1/auth/admin-reset-own-password', {
      method: 'POST',
      body: { new_password: newPassword },
    });
  },

  // ---- Invites (admin only) ----
  async checkInvite(token: string): Promise<{
    valid: boolean;
    email?: string;
    name?: string;
    expiresAt?: string;
    invitedBy?: string;
    allowedTools?: ToolKey[];
    detail?: string;
  }> {
    try {
      const wire = await request<{
        valid: boolean;
        email?: string;
        name?: string;
        expires_at?: string;
        invited_by?: string;
        allowed_tools?: ToolKey[];
      }>(`/v1/auth/invites/${encodeURIComponent(token)}`);
      return {
        valid: wire.valid,
        email: wire.email,
        name: wire.name,
        expiresAt: wire.expires_at,
        invitedBy: wire.invited_by,
        allowedTools: wire.allowed_tools,
      };
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 404) return { valid: false, detail: 'Convite inválido ou expirado.' };
      throw err;
    }
  },
};
