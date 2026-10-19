import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_pages: ChecklistSection = {
  id: 'pages',
  emoji: '📄',
  title: 'Páginas do funil',
  context: 'Sales/VSL/TY cloakeadas. Páginas legais SEMPRE white.',
  items: [
    {
      id: 'vsl-black-structure',
      label: 'VSL black: hook → story → mecanismo → prova → oferta → urgência → CTA',
      critical: true,
    },
    {
      id: 'vsl-player',
      label: 'VSL hospedada em player próprio (BunnyCDN/Vimeo/Cloudflare Stream — NÃO YouTube)',
      critical: true,
    },
    {
      id: 'vsl-cta',
      label: 'CTA da VSL aponta pra go.dominio/?src=vsl',
    },
    {
      id: 'sales-white-mirror',
      label: 'Sales white: mesma URL, mesmo title, layout esquelético similar',
      critical: true,
    },
    {
      id: 'sales-white-button',
      label: 'Sales white tem botão de compra funcional (mesmo destino)',
      critical: true,
    },
    {
      id: 'ty-black',
      label: 'Thank-you black: instruções de acesso + upsell flow + bonus',
    },
    {
      id: 'ty-white',
      label: 'Thank-you white: mensagem genérica de obrigado',
    },
    {
      id: 'capi-pixel',
      label: 'Pixel de conversão dispara na TY (FB CAPI server-side preferencialmente)',
      critical: true,
    },
    {
      id: 'privacy-policy-page',
      label: 'Privacy Policy gerada (termly.io ou termsfeed.com) com dados da empresa Digi',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'tos-page',
      label: 'Terms of Service publicada',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'refund-policy-page',
      label: 'Refund Policy publicada (espelha cadastro Digi: 30 dias)',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'contact-page',
      label: 'Contact/About com endereço da LLC, email, telefone funcional',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'disclaimer-footer',
      label: 'Disclaimer "Results not guaranteed" no rodapé de TODA página',
      critical: true,
    },
    {
      id: 'dmca',
      label: 'DMCA / Copyright notice publicado',
    },
    {
      id: 'cookie-banner',
      label: 'Cookie banner GDPR/CCPA',
    },
  ],
};
