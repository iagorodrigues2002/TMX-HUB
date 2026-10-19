import type { ChecklistSection } from './checklist-data-checklist-section';

export const checklist_cloaker: ChecklistSection = {
  id: 'cloaker',
  emoji: '🛡',
  title: 'Setup CloakUp',
  context: 'Uma campanha por funil. Black/White separados, filtros server-side.',
  items: [
    {
      id: 'black-page',
      label: 'Página BLACK hospedada na rota /vsl ou /',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'black-content',
      label: 'Conteúdo BLACK: VSL agressiva no padrão de top players Digi',
    },
    {
      id: 'black-cta',
      label: 'CTA da BLACK aponta pro link cloakeado de afiliado (go.dominio/?aff=ID)',
      critical: true,
    },
    {
      id: 'white-page',
      label: 'Página WHITE com conteúdo genérico de coaching/mindset',
      hasUrl: true,
      critical: true,
    },
    {
      id: 'white-no-promises',
      label: 'WHITE sem promessas, sem garantias absurdas, sem urgência fake',
      critical: true,
    },
    {
      id: 'white-images',
      label: 'WHITE com imagens neutras (não usar fotos da BLACK)',
    },
    {
      id: 'white-purchase-button',
      label: 'WHITE tem botão de compra que leva pro mesmo redirect (fluxo coerente)',
      critical: true,
    },
    {
      id: 'cloakup-mode',
      label: 'CloakUp em modo Proxy/Server-side (não JS-only)',
      critical: true,
    },
    {
      id: 'filter-geo',
      label: 'Filtro Geo: BLACK só pra país-alvo, resto → WHITE',
      critical: true,
    },
    {
      id: 'filter-device',
      label: 'Filtro Device: mobile/desktop reais → BLACK; datacenter → WHITE',
      critical: true,
    },
    {
      id: 'filter-ua',
      label:
        'Filtro UA: bloquear Googlebot, FBexternalhit, Ahrefs, Stripe, Digistore, Twilio, Zendesk, AWS scrapers',
      critical: true,
    },
    {
      id: 'filter-asn',
      label: 'Filtro ASN: AWS, GCP, Azure, OVH, Hetzner → WHITE',
      critical: true,
    },
    {
      id: 'filter-referrer',
      label:
        'Filtro Referrer: vindo do FB/Google Ads (fbclid/gclid) → BLACK; direto/sem ref → WHITE',
      critical: true,
    },
    {
      id: 'filter-headless',
      label: 'Filtro Fingerprint: detectar Puppeteer/Selenium → WHITE',
    },
    {
      id: 'filter-lang',
      label: 'Filtro Idioma navegador: en-US → BLACK; outros → WHITE',
    },
    {
      id: 'filter-ja3',
      label: 'Filtro TLS Fingerprint (JA3) → bloquear scrapers',
    },
    {
      id: 'whitelist-payment',
      label: 'Whitelist explícita de IPs Digi/Stripe/PayPal → sempre WHITE',
      critical: true,
    },
    {
      id: 'rate-limit',
      label: 'Rate limit por IP (anti-scrape)',
    },
    {
      id: 'cloak-logs',
      label: 'Logs de cloaking ATIVADOS (auditoria contínua)',
      critical: true,
    },
  ],
};
