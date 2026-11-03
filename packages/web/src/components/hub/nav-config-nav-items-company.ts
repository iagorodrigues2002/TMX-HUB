import { Activity, Building2, ListTodo, RotateCcw, Users, Wallet } from 'lucide-react';
import type { NavItem } from './nav-config-nav-item';

// Company permissions are validated by the API; other destinations retain their existing gates.
export const nav_items_company: NavItem = {
  id: 'company',
  label: 'Empresa',
  href: '/tarefas',
  icon: Building2,
  group: 'Empresa',
  children: [
    {
      id: 'company-members',
      label: 'Membros e permissões',
      href: '/empresa/membros',
      icon: Users,
      group: 'Empresa',
      keywords: ['pessoas', 'empresas', 'equipe', 'permissões'],
    },
    {
      id: 'task-management',
      label: 'Tarefas e calls',
      href: '/tarefas',
      icon: ListTodo,
      group: 'Empresa',
      requiresTaskManagement: true,
      keywords: ['gestão de tarefas', 'demandas', 'reuniões', 'discord'],
    },
    {
      id: 'company-finance',
      label: 'Financeiro',
      href: '/empresa/financeiro',
      icon: Wallet,
      group: 'Empresa',
      requiresTool: 'ofertas',
      keywords: ['reserva', 'liberação', 'financeiro'],
    },
    {
      id: 'refunds',
      label: 'Reembolsos e Chargeback',
      href: '/reembolsos',
      icon: RotateCcw,
      group: 'Empresa',
      requiresTool: 'ofertas',
      keywords: ['financeiro', 'devoluções', 'reembolsos', 'chargebacks', 'multas'],
    },
    {
      id: 'operator-activity',
      label: 'Resultados e atividade',
      href: '/logs',
      icon: Activity,
      group: 'Empresa',
      roles: ['admin'],
      requiresTool: 'logs',
      keywords: ['logs', 'upsells', 'operadores', 'histórico'],
    },
  ],
};
