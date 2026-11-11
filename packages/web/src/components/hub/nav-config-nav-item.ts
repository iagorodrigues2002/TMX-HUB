import type { ToolKey } from '@/lib/api-client';
import type { LucideIcon } from 'lucide-react';
import type { NavGroup } from './nav-config-nav-group';
import type { NavRole } from './nav-config-nav-role';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  roles?: NavRole[];
  requiresTool?: ToolKey;
  requiresTaskManagement?: boolean;
  keywords?: string[];
  activeHrefs?: string[];
  hidden?: boolean;
  requiresCreativeWorkspace?: boolean;
  children?: NavItem[];
}
