import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_launch: ChecklistSection = {
  id: 'launch',
  emoji: '🚀',
  title: 'Pré-lançamento (smoke tests)',
  context: '11 testes finais antes de ativar tráfego.',
  items: [
    {
      id: 'test-residential-black',
      label: 'IP residencial US → vê BLACK ✓',
      critical: true,
    },
    {
      id: 'test-aws-white',
      label: 'VPS AWS US-East-1 → vê WHITE ✓',
      critical: true,
    },
    {
      id: 'test-digi-bot-white',
      label: 'User-Agent Digistore24-Bot → vê WHITE ✓',
      critical: true,
    },
    {
      id: 'test-legal-white',
      label: 'Páginas legais todas WHITE, sem cloak ✓',
      critical: true,
    },
    {
      id: 'test-buy',
      label: 'Test buy real: checkout funciona, recebe email, acessa membership ✓',
      critical: true,
    },
    {
      id: 'test-ipn-fires',
      label: 'IPN dispara → endpoint recebe → produto liberado ✓',
      critical: true,
    },
    {
      id: 'test-refund-revokes',
      label: 'Refund de teste → IPN dispara → acesso revogado ✓',
      critical: true,
    },
    {
      id: 'test-cloakup-no-leak',
      label: 'CloakUp logs: 0 vazamento de BLACK pra Digi/AWS ✓',
      critical: true,
    },
    {
      id: 'test-legal-match',
      label: 'Privacy/Terms/Refund batem 100% com cadastro Digi ✓',
      critical: true,
    },
    {
      id: 'test-pixel-dedup',
      label: 'Pixel FB CAPI deduplicação OK (browser + server) ✓',
    },
    {
      id: 'test-rotator',
      label: 'Rotador de afiliado responde corretamente ✓',
      critical: true,
    },
  ],
};
