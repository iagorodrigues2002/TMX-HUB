import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_monitor: ChecklistSection = {
  id: 'monitor',
  emoji: '📊',
  title: 'Pós-lançamento (monitoramento)',
  context: 'Rotinas diárias, semanais, mensais.',
  items: [
    {
      id: 'daily-revenue',
      label: 'DIÁRIO: faturamento por conta afiliado (alerta 80% do cap)',
    },
    {
      id: 'daily-refund',
      label: 'DIÁRIO: refund rate por conta (<8%)',
      critical: true,
    },
    {
      id: 'daily-cb',
      label: 'DIÁRIO: chargeback rate (<0.7%)',
      critical: true,
    },
    {
      id: 'daily-cloak-logs',
      label: 'DIÁRIO: revisar logs CloakUp por IP suspeito',
    },
    {
      id: 'daily-support',
      label: 'DIÁRIO: responder suporte em <6h',
      critical: true,
    },
    {
      id: 'weekly-matriz-withdraw',
      label: 'SEMANAL: saque manual da matriz (saldo baixo = exposição baixa)',
    },
    {
      id: 'weekly-affiliate-withdraw',
      label: 'SEMANAL: saque das contas afiliado que bateram cap',
    },
    {
      id: 'weekly-reactivate',
      label: 'SEMANAL: reativar contas com saldo zerado',
    },
    {
      id: 'weekly-legal-audit',
      label: 'SEMANAL: auditoria das páginas legais (não devem ter mudado)',
    },
    {
      id: 'monthly-rotate-ip',
      label: 'MENSAL: trocar IP/server da origem',
    },
    {
      id: 'monthly-ssl-renew',
      label: 'MENSAL: revisar SSL/CDN configs',
    },
    {
      id: 'monthly-backup',
      label: 'MENSAL: backup membership + lista de buyers',
      critical: true,
    },
  ],
};
