import { ChartNoAxesCombined, Clock3, Megaphone, Settings2, ShieldCheck } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';

export const nav_items_traffic: NavItem = {
  id: 'traffic-preview',
  label: 'Tráfego',
  href: '/trafego',
  icon: Megaphone,
  group: 'Tráfego',
  requiresTool: 'ofertas',
  children: [
    {
      id: 'traffic-overview',
      requiresTool: 'ofertas',
      label: 'Visão geral do tráfego',
      href: '/trafego',
      icon: ChartNoAxesCombined,
      group: 'Tráfego',
    },
    {
      id: 'traffic-campaigns',
      requiresTool: 'ofertas',
      label: 'Campanhas',
      href: '/trafego?view=campaigns',
      icon: Megaphone,
      group: 'Tráfego',
    },
    {
      id: 'traffic-windows',
      requiresTool: 'ofertas',
      label: 'Janelas e comparações',
      href: '/trafego?view=windows',
      icon: Clock3,
      group: 'Tráfego',
    },
    {
      id: 'traffic-contingency',
      requiresTool: 'ofertas',
      label: 'Contingência',
      href: '/trafego?view=contingency',
      icon: ShieldCheck,
      group: 'Tráfego',
    },
    {
      id: 'traffic-settings',
      requiresTool: 'ofertas',
      label: 'Configurações',
      href: '/trafego?view=settings',
      icon: Settings2,
      group: 'Tráfego',
    },
  ],
};
