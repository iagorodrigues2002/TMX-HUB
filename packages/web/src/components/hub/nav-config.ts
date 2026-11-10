import { Radar } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';
import { nav_items_admin } from './nav-config-nav-items-admin';
import { nav_items_company } from './nav-config-nav-items-company';
import { nav_items_integrations } from './nav-config-nav-items-integrations';
import { nav_items_offers } from './nav-config-nav-items-offers';
import { nav_items_overview } from './nav-config-nav-items-overview';
import { nav_items_tools } from './nav-config-nav-items-tools';
import { nav_items_tracking } from './nav-config-nav-items-tracking';
import { nav_items_traffic } from './nav-config-nav-items-traffic';

export const NAV_ITEMS: NavItem[] = [
  nav_items_overview,
  nav_items_offers,
  nav_items_traffic,
  {
    id: 'spy-preview',
    label: 'Spy',
    href: '/spy',
    icon: Radar,
    group: 'Spy',
    requiresTool: 'ofertas',
    keywords: ['pesquisa', 'biblioteca', 'clonagem'],
    children: [
      {
        id: 'spy-offers',
        label: 'Ofertas',
        href: '/spy',
        icon: Radar,
        group: 'Spy',
        requiresTool: 'ofertas',
      },
      {
        id: 'spy-monitor',
        requiresTool: 'ofertas',
        label: 'Acompanhamento',
        href: '/spy?view=monitor',
        icon: Radar,
        group: 'Spy',
      },
      {
        id: 'spy-cloning',
        requiresTool: 'ofertas',
        label: 'Clonagem',
        href: '/spy?view=cloning',
        icon: Radar,
        group: 'Spy',
      },
      {
        id: 'spy-settings',
        requiresTool: 'ofertas',
        label: 'Configurações',
        href: '/spy?view=settings',
        icon: Radar,
        group: 'Spy',
      },
    ],
  },
  nav_items_tracking,
  nav_items_company,
  nav_items_tools,
  nav_items_integrations,
  nav_items_admin,
];
export { flattenNavItems } from './nav-config-flatten-nav-items';
export type { NavGroup } from './nav-config-nav-group';
export type { NavItem } from './nav-config-nav-item';
export type { NavRole } from './nav-config-nav-role';
