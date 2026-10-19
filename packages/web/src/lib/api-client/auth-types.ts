// ---- Auth ----

/**
 * Tools/áreas que podem aparecer em `allowedTools`. Quando ausente/vazio,
 * acesso é total. Admin sempre bypassa.
 */
export type ToolKey =
  | 'cloner'
  | 'cloaker-urls'
  | 'video-shield'
  | 'creative-studio'
  | 'page-diff'
  | 'funnel-clone'
  | 'upsell-analyzer'
  | 'webhook-tester'
  | 'vsl'
  | 'digi-approval'
  | 'ofertas'
  | 'ofertas-ia'
  | 'logs';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  role: 'admin' | 'user';
  allowedTools?: ToolKey[];
  createdAt: string;
}

/** Helper central de checagem de acesso a uma tool. */
export function canAccessTool(user: AuthUser | null, tool: ToolKey): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const list = user.allowedTools;
  if (!list || list.length === 0) return true;
  if (tool === 'video-shield' || tool === 'creative-studio') {
    return list.includes('video-shield') || list.includes('creative-studio');
  }
  return list.includes(tool);
}

export function canAccessOfferAi(user: AuthUser | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.allowedTools?.includes('ofertas-ia') ?? false;
}

export interface AuthSessionWire {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    allowedTools?: ToolKey[];
    createdAt: string;
  };
  token: string;
  expires_at: string;
}

// ---- Invites ----

export interface InviteView {
  token: string;
  email?: string;
  name?: string;
  createdAt: string;
  expiresAt: string;
  invitedBy?: string;
  allowedTools?: ToolKey[];
}

export interface InviteWire {
  token: string;
  email?: string;
  name?: string;
  created_at: string;
  expires_at: string;
  invited_by?: string;
  allowed_tools?: ToolKey[];
}

export function fromInviteWire(w: InviteWire): InviteView {
  return {
    token: w.token,
    email: w.email,
    name: w.name,
    createdAt: w.created_at,
    expiresAt: w.expires_at,
    invitedBy: w.invited_by,
    allowedTools: w.allowed_tools,
  };
}
