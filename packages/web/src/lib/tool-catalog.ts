import { NAV_ITEMS, type NavItem, flattenNavItems } from '@/components/hub/nav-config';
import { type AuthUser, type ToolKey, canAccessTool } from '@/lib/api-client';
import { FileAudio, type LucideIcon } from 'lucide-react';

export interface ToolCatalogEntry {
  id: string;
  tool?: ToolKey;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  disabled?: boolean;
  showOnHome?: boolean;
}

const navigationById = new Map(flattenNavItems(NAV_ITEMS).map((item) => [item.id, item]));

function catalogTool(
  navId: string,
  description: string,
  options: Pick<ToolCatalogEntry, 'badge' | 'showOnHome'> = {},
): ToolCatalogEntry {
  const item = navigationById.get(navId) as NavItem | undefined;
  if (!item?.requiresTool) throw new Error(`Ferramenta sem contrato de navegação: ${navId}`);
  return {
    id: navId,
    tool: item.requiresTool,
    title: item.label,
    description,
    href: item.href,
    icon: item.icon,
    ...options,
  };
}

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  catalogTool(
    'tool-page-cloner',
    'Clone páginas, remova scripts, substitua o checkout e empacote como HTML ou ZIP.',
    { showOnHome: true },
  ),
  catalogTool('tool-vsl', 'Detecte VSLs nos principais players e baixe o vídeo como MP4.', {
    badge: 'Beta',
    showOnHome: true,
  }),
  catalogTool(
    'tool-upsell',
    'Analise taxas de aceite, rejeição e visualização nos funis de upsell.',
    { showOnHome: true },
  ),
  catalogTool(
    'tool-webhook',
    'Edite e simule webhooks de plataformas de pagamento sem realizar uma venda.',
    { badge: 'Novo', showOnHome: true },
  ),
  catalogTool(
    'tool-funnel-clone',
    'Descubra as etapas de um funil e empacote páginas, upsells e downsells em um ZIP.',
    { badge: 'Novo', showOnHome: true },
  ),
  catalogTool(
    'tool-video-studio',
    'Proteja, comprima, normalize, redimensione e estenda criativos em uma central.',
    { badge: 'Novo', showOnHome: true },
  ),
  {
    id: 'tool-vsl-transcriber',
    title: 'VSL Transcriber',
    description: 'Transcreva a VSL com timestamps e identifique as seções da oferta.',
    href: '#',
    icon: FileAudio,
    badge: 'Em breve',
    disabled: true,
  },
];

export function visibleToolCatalog(
  user: AuthUser | null,
  options: { homeOnly?: boolean } = {},
): ToolCatalogEntry[] {
  if (!user) return [];
  const restricted = user.role !== 'admin' && (user.allowedTools?.length ?? 0) > 0;
  return TOOL_CATALOG.filter((entry) => {
    if (options.homeOnly && !entry.showOnHome) return false;
    if (!entry.tool) return !restricted;
    return canAccessTool(user, entry.tool);
  });
}
