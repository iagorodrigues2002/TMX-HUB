import type { InviteView } from './auth-types.js';
import type { InviteWire } from './auth-types.js';
import { fromInviteWire } from './auth-types.js';
import type { ToolKey } from './auth-types.js';
import type { AuthUser } from './auth-types.js';
import { request } from './request.js';
export const endpoints = {
  async listInvites(): Promise<InviteView[]> {
    const wire = await request<{ invites: InviteWire[] }>('/v1/auth/invites');
    return (wire.invites ?? []).map(fromInviteWire);
  },

  async createInvite(input: {
    email?: string;
    name?: string;
    expiresInDays?: number;
    allowedTools?: ToolKey[];
  }): Promise<InviteView> {
    const wire = await request<InviteWire>('/v1/auth/invites', {
      method: 'POST',
      body: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.expiresInDays ? { expires_in_days: input.expiresInDays } : {}),
        ...(input.allowedTools && input.allowedTools.length > 0
          ? { allowed_tools: input.allowedTools }
          : {}),
      },
    });
    return fromInviteWire(wire);
  },

  async revokeInvite(token: string): Promise<void> {
    await request<void>(`/v1/auth/invites/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    });
  },

  // ---- Users (admin only) ----
  async listUsers(): Promise<AuthUser[]> {
    const wire = await request<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'user';
        allowed_tools?: ToolKey[];
        created_at: string;
      }>;
    }>('/v1/users');
    return (wire.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      allowedTools: u.allowed_tools,
      createdAt: u.created_at,
    }));
  },

  async updateUser(
    id: string,
    patch: {
      name?: string;
      role?: 'admin' | 'user';
      /** undefined = não muda. null = limpa (acesso total). array = sobrescreve. */
      allowedTools?: ToolKey[] | null;
    },
  ): Promise<AuthUser> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.role !== undefined) body.role = patch.role;
    if (patch.allowedTools !== undefined) body.allowed_tools = patch.allowedTools;
    const wire = await request<{
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
      allowed_tools?: ToolKey[];
      created_at: string;
    }>(`/v1/users/${id}`, { method: 'PATCH', body });
    return {
      id: wire.id,
      email: wire.email,
      name: wire.name,
      role: wire.role,
      allowedTools: wire.allowed_tools,
      createdAt: wire.created_at,
    };
  },

  async deleteUser(id: string): Promise<void> {
    await request<void>(`/v1/users/${id}`, { method: 'DELETE' });
  },
};
