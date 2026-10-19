import { NAV_ITEMS } from './nav-config';
import type { NavItem } from './nav-config-nav-item';

export function flattenNavItems(items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.flatMap((item) => [item, ...flattenNavItems(item.children ?? [])]);
}
