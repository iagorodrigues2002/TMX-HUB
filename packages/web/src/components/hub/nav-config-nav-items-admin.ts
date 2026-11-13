import { Activity, Bot, CircleGauge, ListChecks, ShieldCheck, Users } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';

export const nav_items_admin: NavItem = {
  id: 'admin',
  label: 'Administração global',
  href: '/admin',
  icon: ShieldCheck,
  group: 'Administração global',
  roles: ['admin'],
  keywords: ['administração'],
  children: [
    {
      id: 'admin-ai',
      label: 'IA da empresa',
      href: '/admin/ia',
      icon: Bot,
      group: 'Administração global',
      roles: ['admin'],
    },
    {
      id: 'admin-overview',
      label: 'Resumo da plataforma',
      href: '/admin',
      icon: CircleGauge,
      group: 'Administração global',
      roles: ['admin'],
    },
    {
      id: 'admin-people',
      label: 'Pessoas e acessos',
      href: '/admin?view=people',
      icon: Users,
      group: 'Administração global',
      roles: ['admin'],
      keywords: ['usuários', 'permissões'],
    },
    {
      id: 'admin-invites',
      label: 'Convites',
      href: '/admin?view=invites',
      icon: ListChecks,
      group: 'Administração global',
      roles: ['admin'],
    },
    {
      id: 'admin-activity',
      label: 'Atividade administrativa',
      href: '/admin?view=activity',
      icon: Activity,
      group: 'Administração global',
      roles: ['admin'],
      keywords: ['logs', 'histórico'],
    },
  ],
};
