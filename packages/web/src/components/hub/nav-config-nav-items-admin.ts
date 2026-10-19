import { Activity, CircleGauge, KeyRound, ListChecks, ShieldCheck, Users } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';

export const nav_items_admin: NavItem = {
  id: 'admin',
  label: 'Admin',
  href: '/admin',
  icon: ShieldCheck,
  group: 'Admin',
  roles: ['admin'],
  keywords: ['administração'],
  children: [
    {
      id: 'admin-overview',
      label: 'Visão geral',
      href: '/admin',
      icon: CircleGauge,
      group: 'Admin',
      roles: ['admin'],
    },
    {
      id: 'admin-people',
      label: 'Pessoas e acessos',
      href: '/admin?view=people',
      icon: Users,
      group: 'Admin',
      roles: ['admin'],
      keywords: ['usuários', 'permissões'],
    },
    {
      id: 'admin-invites',
      label: 'Convites',
      href: '/admin?view=invites',
      icon: ListChecks,
      group: 'Admin',
      roles: ['admin'],
    },
    {
      id: 'admin-activity',
      label: 'Atividade',
      href: '/logs',
      icon: Activity,
      group: 'Admin',
      roles: ['admin'],
      requiresTool: 'logs',
      keywords: ['logs', 'histórico'],
    },
    {
      id: 'account-security',
      label: 'Conta e segurança',
      href: '/settings',
      icon: KeyRound,
      group: 'Admin',
      roles: ['admin'],
      keywords: ['perfil', 'senha'],
    },
  ],
};
