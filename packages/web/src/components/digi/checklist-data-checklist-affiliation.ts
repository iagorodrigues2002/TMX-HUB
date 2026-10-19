import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_affiliation: ChecklistSection = {
  id: 'affiliation',
  emoji: '💰',
  title: 'Configuração de afiliação',
  context: 'Product → Affiliate Settings na matriz.',
  items: [
    {
      id: 'commission-95',
      label: 'Commission: 95% (matriz fica com 5% pra cobrir fee Digi $1+7,9%)',
      critical: true,
    },
    {
      id: 'manual-approval',
      label: 'Approval mode: Manual approval (controle total)',
      critical: true,
    },
    {
      id: 'cookie-180d',
      label: 'Cookie duration: 180 dias (máximo)',
    },
    {
      id: 'affiliate-support-page',
      label: 'Affiliate support page com banners, swipes, regras',
    },
    {
      id: 'jv-off',
      label: 'JV split DESLIGADO (deixa rastro contábil entre contas)',
      critical: true,
    },
    {
      id: 'affiliates-approved',
      label: 'Cada conta afiliado aprovada manualmente, links coletados',
    },
    {
      id: 'cpa-vs-revshare',
      label: 'Decisão CPA vs RevShare 95% documentada (default: RevShare)',
    },
  ],
};
