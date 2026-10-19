import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_pre: ChecklistSection = {
  id: 'pre',
  emoji: '🏗',
  title: 'Pré-requisitos',
  context: 'Tudo que precisa estar pronto ANTES de tocar a Digistore.',
  items: [
    {
      id: 'matriz-account',
      label: 'Conta matriz Digistore24 ativa (CNPJ/LLC, banco offshore, docs únicas)',
      critical: true,
    },
    {
      id: 'affiliate-accounts',
      label: '2-3 contas afiliado prontas com docs 100% diferentes da matriz',
      critical: true,
    },
    {
      id: 'affiliate-isolation',
      label:
        'Cada conta afiliado: nome, CPF/CNPJ, email, telefone, IP, device fingerprint distintos',
      critical: true,
    },
    {
      id: 'bank-accounts',
      label: 'Conta bancária própria por afiliado (não reutilizar)',
      critical: true,
    },
    {
      id: 'cloakup',
      label: 'Conta CloakUp ativa (plano PRO/Business pra aguentar volume)',
      critical: true,
    },
    {
      id: 'cloakup-tokens',
      label: 'Tokens API CloakUp guardados',
    },
    {
      id: 'domain-registered',
      label: 'Domínio próprio registrado por funil (Namecheap/Porkbun) com WHOIS protegido',
      critical: true,
    },
    {
      id: 'cloudflare',
      label: 'Cloudflare configurado (proxy laranja ON) ofuscando origem',
      critical: true,
    },
    {
      id: 'hosting',
      label: 'VPS/page builder pra landing/VSL (Hostinger, Vultr, ClickFunnels, Atomicat)',
    },
    {
      id: 'no-digi-subdomain-black',
      label: 'NÃO usar subdomínio digistore24.com pra página black (só pro checkout)',
      critical: true,
    },
    {
      id: 'pixel-fb',
      label: 'Pixel FB próprio por conta de mídia',
    },
    {
      id: 'pixel-google',
      label: 'Pixel Google Ads próprio por conta de mídia',
    },
    {
      id: 'utm-template',
      label: 'UTM template padronizado',
    },
    {
      id: 's2s-postback',
      label: 'S2S postback configurado: Digi IPN → tracker (RedTrack/Voluum/próprio)',
    },
  ],
};
