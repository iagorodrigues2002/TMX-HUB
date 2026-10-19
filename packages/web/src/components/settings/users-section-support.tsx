'use client';

import type { AuthUser, ToolKey } from '@/lib/api-client';

export type AccessScope = 'full' | 'video-shield' | 'custom';

export const CUSTOM_TOOL_OPTIONS: { key: ToolKey; label: string }[] = [
  { key: 'video-shield', label: 'Video Studio' },
  { key: 'cloner', label: 'Page Cloner' },
  { key: 'funnel-clone', label: 'Funnel Full Clone' },
  { key: 'upsell-analyzer', label: 'Upsell Analyzer' },
  { key: 'webhook-tester', label: 'Webhook Tester' },
  { key: 'vsl', label: 'VSL Downloader' },
  { key: 'ofertas', label: 'Ofertas e tracking' },
  { key: 'ofertas-ia', label: 'IA de Ofertas' },
  { key: 'logs', label: 'Logs' },
];

export const SCOPE_LABEL: Record<AccessScope, string> = {
  full: 'Completo (todas as ferramentas)',
  'video-shield': 'Apenas Video Studio',
  custom: 'Personalizado…',
};

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function detectScope(user: AuthUser): AccessScope {
  if (user.role === 'admin') return 'full';
  if (!user.allowedTools || user.allowedTools.length === 0) return 'full';
  if (
    user.allowedTools.length === 1 &&
    (user.allowedTools[0] === 'video-shield' || user.allowedTools[0] === 'creative-studio')
  )
    return 'video-shield';
  return 'custom';
}

export function scopeToAllowedTools(scope: AccessScope, custom: ToolKey[]): ToolKey[] | null {
  if (scope === 'full') return null;
  if (scope === 'video-shield') return ['video-shield'];
  return custom.length > 0 ? custom : null;
}
