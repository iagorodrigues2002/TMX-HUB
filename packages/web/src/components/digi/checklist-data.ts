/**
 * Static checklist for Digistore24 product approval.
 * IDs are STABLE — never rename. Per-audit state is keyed by `${sectionId}:${itemId}`.
 *
 * Source: digistore24-checklist-cadastro-produto.md (Blackzada + CloakUp ops).
 */

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
  /** Highlight as critical — these block approval if pending. */
  critical?: boolean;
  /** Show a URL field next to the checkbox. */
  hasUrl?: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  emoji: string;
  /** Short context shown when section is open. */
  context?: string;
  items: ChecklistItem[];
}

export const CHECKLIST: ChecklistSection[] = [
  {
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
        label: 'Cada conta afiliado: nome, CPF/CNPJ, email, telefone, IP, device fingerprint distintos',
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
  },
  {
    id: 'domains',
    emoji: '🌐',
    title: 'Estrutura de domínios',
    context: '1 funil = 1 domínio raiz. Não reutilizar.',
    items: [
      {
        id: 'main-domain-cf',
        label: 'Domínio principal apontando pro Cloudflare',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'dns-origin',
        label: 'DNS A/CNAME → servidor de origem (white + black)',
      },
      {
        id: 'ssl-strict',
        label: 'SSL Cloudflare configurado em Full (Strict)',
        critical: true,
      },
      {
        id: 'go-subdomain',
        label: 'Subdomínio go. ou pay. → redirect 302 pro checkout Digi com aff_id',
        hasUrl: true,
      },
      {
        id: 'one-funnel-one-domain',
        label: 'Confirma: este domínio NÃO é usado em outro funil',
        critical: true,
      },
    ],
  },
  {
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
        label: 'Filtro UA: bloquear Googlebot, FBexternalhit, Ahrefs, Stripe, Digistore, Twilio, Zendesk, AWS scrapers',
        critical: true,
      },
      {
        id: 'filter-asn',
        label: 'Filtro ASN: AWS, GCP, Azure, OVH, Hetzner → WHITE',
        critical: true,
      },
      {
        id: 'filter-referrer',
        label: 'Filtro Referrer: vindo do FB/Google Ads (fbclid/gclid) → BLACK; direto/sem ref → WHITE',
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
  },
  {
    id: 'product',
    emoji: '📦',
    title: 'Cadastro do produto na matriz',
    context: 'Account → Products → New Product. Tudo white-friendly aqui.',
    items: [
      {
        id: 'product-name-white',
        label: 'Nome white-friendly ("Manifestation Mastery System") — SEM claims monetárias',
        critical: true,
      },
      {
        id: 'product-type-digital',
        label: 'Product type: Digital product (download/online course)',
      },
      {
        id: 'description-white',
        label: 'Description pública: 200-400 palavras white, sem promessa de retorno',
        critical: true,
      },
      {
        id: 'price-range',
        label: 'Preço entre $27-$97 (sweet spot prosperidade EUA)',
      },
      {
        id: 'currency-usd',
        label: 'Moeda: USD',
      },
      {
        id: 'language-en',
        label: 'Idioma: English',
      },
      {
        id: 'sales-page-url',
        label: 'Sales Page URL cadastrada (cloakeada — Digi vê white)',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'thank-you-url',
        label: 'Thank-you Page URL cadastrada (cloakeada)',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'support-email',
        label: 'Support email (caixa real, monitorada — refund <6h)',
        critical: true,
      },
      {
        id: 'privacy-url',
        label: 'Privacy Policy URL — WHITE PURO, NUNCA cloakar',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'terms-url',
        label: 'Terms URL — WHITE puro',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'refund-url',
        label: 'Refund Policy URL — WHITE puro, política 30/60d',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'imprint-url',
        label: 'Imprint/Contact — WHITE puro, dados condizentes com cadastro Digi',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'order-form-digi',
        label: 'Order form: Digi-hosted standard (mais seguro no início)',
      },
      {
        id: 'custom-thankyou',
        label: 'Custom Thank-you ativado, redireciona pra /ty',
      },
      {
        id: 'order-bump',
        label: 'Order Bump configurado ($7-$17)',
      },
      {
        id: 'upsell-1',
        label: 'Upsell 1 configurado ($97-$197)',
      },
      {
        id: 'upsell-2',
        label: 'Upsell 2 (Multi-Upsell) configurado ($297)',
      },
      {
        id: 'downsell',
        label: 'Downsell configurado ($47-$67)',
      },
      {
        id: 'no-trigger-words',
        label: 'Order form sem palavras-trigger (guaranteed, make $X, get rich)',
        critical: true,
      },
      {
        id: 'category-spirituality',
        label: 'Categoria: Spirituality / Personal Development (NÃO Money/Business)',
        critical: true,
      },
      {
        id: 'marketplace-off',
        label: 'Marketplace listing OFF inicialmente',
        critical: true,
      },
      {
        id: 'tags-neutral',
        label: 'Tags neutras (mindset, manifestation, personal-growth)',
      },
      {
        id: 'refund-policy-30',
        label: 'Refund: 30-day money-back guarantee (NÃO 60d no início)',
        critical: true,
      },
    ],
  },
  {
    id: 'affiliation',
    emoji: '💰',
    title: 'Configuração de afiliação',
    context: 'Product → Affiliate Settings na matriz.',
    items: [
      {
        id: 'commission-95',
        label: 'Commission: 95% (matriz fica com 5% pra cobrir fee Digi $1+7,9%)',
        critical: true,
      },
      {
        id: 'manual-approval',
        label: 'Approval mode: Manual approval (controle total)',
        critical: true,
      },
      {
        id: 'cookie-180d',
        label: 'Cookie duration: 180 dias (máximo)',
      },
      {
        id: 'affiliate-support-page',
        label: 'Affiliate support page com banners, swipes, regras',
      },
      {
        id: 'jv-off',
        label: 'JV split DESLIGADO (deixa rastro contábil entre contas)',
        critical: true,
      },
      {
        id: 'affiliates-approved',
        label: 'Cada conta afiliado aprovada manualmente, links coletados',
      },
      {
        id: 'cpa-vs-revshare',
        label: 'Decisão CPA vs RevShare 95% documentada (default: RevShare)',
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
    id: 'delivery',
    emoji: '🎁',
    title: 'Entrega do produto',
    context: 'Membership real reduz CB drasticamente.',
    items: [
      {
        id: 'membership-platform',
        label: 'Plataforma membership white (Kajabi, Teachable, Memberkit, Hotmart Members)',
        hasUrl: true,
        critical: true,
      },
      {
        id: 'real-content',
        label: 'Conteúdo real entregue (mesmo que básico)',
        critical: true,
      },
      {
        id: 'welcome-email',
        label: 'Email de boas-vindas automático com login',
      },
      {
        id: 'post-purchase-sequence',
        label: 'Sequência email pós-compra (3-7 emails)',
      },
      {
        id: 'support-checked',
        label: 'Caixa support@ checada 2x/dia, refund <24h',
        critical: true,
      },
    ],
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

/** Red flags shown as a permanent reference sidebar — these are NOT checklist items, they're alerts. */
export const RED_FLAGS: Array<{ id: string; label: string }> = [
  { id: 'rf-compliance-email', label: 'Email da Digi com "compliance", "review", "manual review", "verification"' },
  { id: 'rf-cb-1pct', label: 'CB rate >1% em 7 dias rolling' },
  { id: 'rf-refund-12pct', label: 'Refund rate >12%' },
  { id: 'rf-screenshare', label: 'Account Manager pede screenshare ou auditoria' },
  { id: 'rf-dispute-keyword', label: 'Cliente abre dispute mencionando palavra-chave do funil black' },
  { id: 'rf-cloakup-leak', label: 'CloakUp loga IP da Digistore caindo em BLACK' },
  { id: 'rf-stripe-question', label: 'Stripe/banco do Digi pede informações sobre o produto' },
];

/** Action when any red flag fires. */
export const RED_FLAG_ACTION =
  'Pausar tráfego em todas as contas. Trocar páginas pra 100% white por 7-14 dias. ' +
  'Responder support de forma profissional. Processar refunds pendentes em massa pra zerar fila de CB.';

// Helpers
export function totalItems(): number {
  return CHECKLIST.reduce((acc, s) => acc + s.items.length, 0);
}

export function totalCriticalItems(): number {
  return CHECKLIST.reduce((acc, s) => acc + s.items.filter((i) => i.critical).length, 0);
}

export function itemKey(sectionId: string, itemId: string): string {
  return `${sectionId}:${itemId}`;
}
