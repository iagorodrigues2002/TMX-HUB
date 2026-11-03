import { NAVIGATION_KEYS, type NavigationKey } from './navigation-access.js';
// ---- Auth & Activity ----

/**
 * Tools/áreas que podem aparecer em `allowedTools` de User/Invite.
 * Ausente preserva o legado; vazio nega acesso. Admin global ignora a lista.
 */
export type ToolKey =
  | NavigationKey
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
  ...NAVIGATION_KEYS,
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
