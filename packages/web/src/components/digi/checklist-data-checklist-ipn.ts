import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_ipn: ChecklistSection = {
  id: 'ipn',
  emoji: '🔌',
  title: 'Integração IPN',
  context: 'Settings → Integrations (IPN) → Add Connection.',
  items: [
    {
      id: 'ipn-webhook',
      label: 'Webhook URL próprio configurado (api.dominio.com/ipn)',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'ipn-passphrase',
      label: 'IPN Passphrase forte gerada e guardada em env',
      critical: true,
    },
    {
      id: 'event-payment',
      label: 'Evento on_payment ativo → entrega + dispara CAPI',
      critical: true,
    },
    {
      id: 'event-refund',
      label: 'Evento on_refund ativo → revoga acesso + atualiza tracker',
      critical: true,
    },
    {
      id: 'event-chargeback',
      label: 'Evento on_chargeback ativo → revoga + alerta interno',
      critical: true,
    },
    {
      id: 'event-payment-missed',
      label: 'Evento on_payment_missed ativo (recurring)',
    },
    {
      id: 'event-rebill-cancelled',
      label: 'Evento on_rebill_cancelled ativo',
    },
    {
      id: 'sha512-validation',
      label: 'Validação de assinatura SHA512 implementada no endpoint',
      critical: true,
    },
    {
      id: 'event-log',
      label: 'Log de todos os eventos por 90 dias',
    },
  ],
};
