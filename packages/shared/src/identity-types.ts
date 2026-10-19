// ---- Auth & Activity ----

/**
 * Tools/áreas que podem aparecer em `allowedTools` de User/Invite.
 * Quando `allowedTools` é vazio/ausente, acesso é total (legado/admin).
 * Quando é não-vazio, usuário só vê e usa as ferramentas listadas.
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

export const ALL_TOOL_KEYS: ToolKey[] = [
  'cloner',
  'cloaker-urls',
  'video-shield',
  'creative-studio',
  'page-diff',
  'funnel-clone',
  'upsell-analyzer',
  'webhook-tester',
  'vsl',
  'digi-approval',
  'ofertas',
  'ofertas-ia',
  'logs',
];

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  /**
   * Lista de ferramentas/áreas permitidas. `undefined` = acesso completo.
   * Admin sempre bypassa (ignora esse campo).
   */
  allowedTools?: ToolKey[];
  createdAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: string;
}

export type ActivityKind = 'clone' | 'vsl' | 'funnel' | 'inspect' | 'webhook' | 'page-diff';

export interface ActivityEntry {
  kind: ActivityKind;
  id: string;
  /** Best display label (URL or label depending on kind). */
  label: string;
  /** kind-specific status string. */
  status: string;
  createdAt: string;
}
