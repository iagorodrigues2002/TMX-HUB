import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_delivery: ChecklistSection = {
  id: 'delivery',
  emoji: '🎁',
  title: 'Entrega do produto',
  context: 'Membership real reduz CB drasticamente.',
  items: [
    {
      id: 'membership-platform',
      label: 'Plataforma membership white (Kajabi, Teachable, Memberkit, Hotmart Members)',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'real-content',
      label: 'Conteúdo real entregue (mesmo que básico)',
      critical: true,
    },
    {
      id: 'welcome-email',
      label: 'Email de boas-vindas automático com login',
    },
    {
      id: 'post-purchase-sequence',
      label: 'Sequência email pós-compra (3-7 emails)',
    },
    {
      id: 'support-checked',
      label: 'Caixa support@ checada 2x/dia, refund <24h',
      critical: true,
    },
  ],
};
