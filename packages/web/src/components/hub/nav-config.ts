import type { NavItem } from './nav-config-nav-item';
import { nav_items_admin } from './nav-config-nav-items-admin';
import { nav_items_integrations } from './nav-config-nav-items-integrations';
import { nav_items_offers } from './nav-config-nav-items-offers';
import { nav_items_overview } from './nav-config-nav-items-overview';
import { nav_items_tools } from './nav-config-nav-items-tools';
import { nav_items_tracking } from './nav-config-nav-items-tracking';

export const NAV_ITEMS: NavItem[] = [
  nav_items_overview,
  nav_items_offers,
  nav_items_tracking,
  nav_items_tools,
  nav_items_integrations,
  nav_items_admin,
];
export { flattenNavItems } from './nav-config-flatten-nav-items';
export type { NavGroup } from './nav-config-nav-group';
export type { NavItem } from './nav-config-nav-item';
export type { NavRole } from './nav-config-nav-role';
