import { Bug, ChartNoAxesCombined, CodeXml, CreditCard, RadioTower, Route } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';
import { trackingTool } from './nav-config-tracking-tool';

export const nav_items_tracking: NavItem = {
  id: 'tracking',
  label: 'Rastreamento',
  href: '/tracking',
  icon: RadioTower,
  group: 'Rastreamento',
  ...trackingTool,
  keywords: ['tracking', 'eventos', 'conversões'],
  children: [
    {
      id: 'tracking-overview',
      label: 'Visão geral',
      href: '/tracking?view=overview',
      icon: ChartNoAxesCombined,
      group: 'Rastreamento',
      ...trackingTool,
    },
    {
      id: 'tracking-journey',
      label: 'Jornada',
      href: '/tracking?view=journey',
      icon: Route,
      group: 'Rastreamento',
      ...trackingTool,
      keywords: ['funil', 'eventos ao vivo', 'campanhas', 'retenção'],
    },
    {
      id: 'tracking-upsell-intelligence',
      label: 'Upsell Intelligence',
      href: '/tracking?view=upsell-intelligence',
      icon: CreditCard,
      group: 'Rastreamento',
      ...trackingTool,
      keywords: ['upsells', 'etapas', 'identidades', 'redirecionamentos', 'pós-compra'],
    },
    {
      id: 'tracking-capture',
      label: 'Captura',
      href: '/tracking?view=capture&section=code-pixels',
      icon: CodeXml,
      group: 'Rastreamento',
      ...trackingTool,
      keywords: ['instalação', 'script', 'código', 'domínios'],
    },
    {
      id: 'tracking-diagnostics',
      label: 'Diagnóstico',
      href: '/tracking?view=finance&section=health',
      icon: Bug,
      group: 'Rastreamento',
      ...trackingTool,
      keywords: ['saúde', 'testes', 'alertas'],
    },
  ],
};
