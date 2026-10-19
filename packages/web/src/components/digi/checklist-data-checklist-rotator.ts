import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_rotator: ChecklistSection = {
  id: 'rotator',
  emoji: '🔁',
  title: 'Rotador de links de afiliado',
  context: 'Cap rígido 50k USD por conta. Anti-vínculo.',
  items: [
    {
      id: 'rotator-endpoint',
      label: 'Endpoint go.dominio.com criado e respondendo',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'rotator-db',
      label: 'JSON/DB com [conta, cap, fat_atual] por afiliado',
      critical: true,
    },
    {
      id: 'rotator-redirect',
      label: 'Lógica: <50k → 302 pro link Digi; ≥50k → pula',
      critical: true,
    },
    {
      id: 'rotator-log',
      label: 'Loga clique + conta destino',
    },
    {
      id: 'rotator-ipn-update',
      label: 'fat_atual atualizado via IPN on_payment da matriz',
      critical: true,
    },
    {
      id: 'cap-50k',
      label: 'Cap rígido de 50k USD por conta afiliado',
      critical: true,
    },
    {
      id: 'no-simul-pixel',
      label: 'Nunca rodar 2 contas simultâneas com mesmo pixel/cartão de mídia',
      critical: true,
    },
    {
      id: 'isolated-ip',
      label: 'IP de operação diferente por conta (VPS dedicada ou 4G)',
      critical: true,
    },
    {
      id: 'isolated-browser',
      label: 'Browser profile separado por conta (Adspower, GoLogin, Multilogin)',
      critical: true,
    },
    {
      id: 'isolated-ad-card',
      label: 'Cartão de mídia diferente por conta',
      critical: true,
    },
  ],
};
