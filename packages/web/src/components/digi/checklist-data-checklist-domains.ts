import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_domains: ChecklistSection = {
  id: 'domains',
  emoji: '🌐',
  title: 'Estrutura de domínios',
  context: '1 funil = 1 domínio raiz. Não reutilizar.',
  items: [
    {
      id: 'main-domain-cf',
      label: 'Domínio principal apontando pro Cloudflare',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'dns-origin',
      label: 'DNS A/CNAME → servidor de origem (white + black)',
    },
    {
      id: 'ssl-strict',
      label: 'SSL Cloudflare configurado em Full (Strict)',
      critical: true,
    },
    {
      id: 'go-subdomain',
      label: 'Subdomínio go. ou pay. → redirect 302 pro checkout Digi com aff_id',
      hasUrl: true,
    },
    {
      id: 'one-funnel-one-domain',
      label: 'Confirma: este domínio NÃO é usado em outro funil',
      critical: true,
    },
  ],
};
