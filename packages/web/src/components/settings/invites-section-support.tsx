'use client';

import type { ToolKey } from '@/lib/api-client';
import { toast } from 'sonner';

export function inviteUrl(token: string): string {
  if (typeof window === 'undefined') return `/register?invite=${token}`;
  return `${window.location.origin}/register?invite=${token}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function copyText(text: string, label: string): void {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

export type AccessScope = 'full' | 'video-shield' | 'custom';

export const SCOPE_LABEL: Record<AccessScope, string> = {
  full: 'Completo (todas as ferramentas)',
  'video-shield': 'Apenas Video Studio',
  custom: 'Personalizado…',
};

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

export function scopeToAllowedTools(scope: AccessScope, custom: ToolKey[]): ToolKey[] | undefined {
  if (scope === 'full') return undefined;
  if (scope === 'video-shield') return ['video-shield'];
  return custom.length > 0 ? custom : ['video-shield'];
}
