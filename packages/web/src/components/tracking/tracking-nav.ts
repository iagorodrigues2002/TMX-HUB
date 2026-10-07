import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  BellRing,
  Braces,
  Bug,
  Cable,
  CircleGauge,
  CodeXml,
  CreditCard,
  Facebook,
  FlaskConical,
  Globe2,
  HeartPulse,
  HelpCircle,
  Link2,
  Megaphone,
  Percent,
  RadioTower,
  Route,
  Send,
  Video,
  Webhook,
} from 'lucide-react';

export type TrackingView =
  | 'overview'
  | 'journey'
  | 'upsell-intelligence'
  | 'capture'
  | 'destinations'
  | 'finance';

export interface TrackingNavSection {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface TrackingNavArea {
  id: TrackingView;
  label: string;
  description: string;
  icon: LucideIcon;
  sections: TrackingNavSection[];
}

export const TRACKING_NAV: TrackingNavArea[] = [
  {
    id: 'overview',
    label: 'Visão geral',
    description: 'Resumo da operação e prontidão da oferta.',
    icon: CircleGauge,
    sections: [
      {
        id: 'summary',
        label: 'Resumo da operação',
        description: 'Sinais, pedidos e estado das integrações.',
        icon: BarChart3,
      },
      {
        id: 'alerts',
        label: 'Saúde e alertas',
        description: 'Incidentes que precisam de atenção.',
        icon: HeartPulse,
      },
    ],
  },
  {
    id: 'journey',
    label: 'Jornada',
    description: 'Do clique no anúncio à compra atribuída.',
    icon: Route,
    sections: [
      {
        id: 'live',
        label: 'Eventos ao vivo',
        description: 'Sinais recebidos em tempo quase real.',
        icon: RadioTower,
      },
      {
        id: 'funnel',
        label: 'Jornada do funil',
        description: 'Passagem entre página, checkout e compra.',
        icon: Route,
      },
      {
        id: 'attribution',
        label: 'Atribuição de campanhas',
        description: 'Campanhas e anúncios que geraram resultado.',
        icon: Megaphone,
      },
      {
        id: 'entry-links',
        label: 'Links de entrada',
        description: 'Links TMX usados como destino dos anúncios.',
        icon: Link2,
      },
      {
        id: 'ab-tests',
        label: 'Testes A/B',
        description: 'Experimentos e métricas por variante.',
        icon: FlaskConical,
      },
    ],
  },
  {
    id: 'upsell-intelligence',
    label: 'Upsell Intelligence',
    description: 'Etapas, identidades e redirecionamentos de upsell.',
    icon: CreditCard,
    sections: [
      {
        id: 'upsell-intelligence',
        label: 'Upsell Intelligence',
        description: 'Desempenho e identidade dos compradores.',
        icon: CreditCard,
      },
    ],
  },
  {
    id: 'capture',
    label: 'Captura',
    description: 'Instalação e origens first-party.',
    icon: CodeXml,
    sections: [
      {
        id: 'code-pixels',
        label: 'Código de instalação',
        description: 'Script first-party e parâmetros para anúncios.',
        icon: Braces,
      },
      {
        id: 'domains',
        label: 'Domínios',
        description: 'Origens autorizadas e subdomínio TMX.',
        icon: Globe2,
      },
    ],
  },
  {
    id: 'destinations',
    label: 'Destinos',
    description: 'Plataformas que recebem eventos e alertas.',
    icon: Send,
    sections: [
      {
        id: 'meta',
        label: 'Meta',
        description: 'Pixels, regras, entregas CAPI e reconciliação.',
        icon: Facebook,
      },
      {
        id: 'tiktok-ads',
        label: 'TikTok',
        description: 'Pixel, Events API e testes.',
        icon: Activity,
      },
      {
        id: 'utmify',
        label: 'UTMify',
        description: 'Pixel web, vendas e classificação de produtos.',
        icon: Cable,
      },
      {
        id: 'google-ads',
        label: 'Google Ads',
        description: 'Conta e ações de conversão.',
        icon: Globe2,
      },
      {
        id: 'vturb',
        label: 'vTurb',
        description: 'Player, retenção e conversões da VSL.',
        icon: Video,
      },
      {
        id: 'pushcut',
        label: 'Pushcut',
        description: 'Notificações por oferta e dispositivo.',
        icon: BellRing,
      },
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro e diagnóstico',
    description: 'Receita líquida, webhooks e investigação.',
    icon: Percent,
    sections: [
      {
        id: 'payments',
        label: 'Gateways e webhooks',
        description: 'VendePay, Paysight e Explodely sem duplicação.',
        icon: Webhook,
      },
      {
        id: 'fees',
        label: 'Taxas do gateway',
        description: 'Custos, reserva e prazo de recebimento.',
        icon: Percent,
      },
      {
        id: 'health',
        label: 'Saúde',
        description: 'Integridade da captura e dos destinos.',
        icon: HeartPulse,
      },
      {
        id: 'console',
        label: 'Live Console',
        description: 'Inspeção contextual dos eventos recebidos.',
        icon: Bug,
      },
      {
        id: 'help',
        label: 'Ajuda e testes',
        description: 'Validação guiada da instalação atual.',
        icon: HelpCircle,
      },
    ],
  },
];

export const DEFAULT_TRACKING_SECTION: Record<TrackingView, string> = {
  overview: 'summary',
  journey: 'live',
  'upsell-intelligence': 'upsell-intelligence',
  capture: 'code-pixels',
  destinations: 'meta',
  finance: 'payments',
};

interface BuildTrackingHrefOptions {
  view: TrackingView;
  section?: string | null;
  offerId: string;
  pathname?: string;
  searchParams?: string;
}

export function buildTrackingHref({
  view,
  section,
  offerId,
  pathname = '/tracking',
  searchParams = '',
}: BuildTrackingHrefOptions) {
  const current = new URLSearchParams(searchParams);
  const next = new URLSearchParams();

  next.set('offer', offerId);
  next.set('view', view);
  if (section) next.set('section', section);

  current.forEach((value, key) => {
    if (!next.has(key) && key !== 'section') next.append(key, value);
  });

  return `${pathname}?${next.toString()}`;
}

export function isTrackingView(value: string | null): value is TrackingView {
  return TRACKING_NAV.some((area) => area.id === value);
}

export function resolveTrackingSection(view: TrackingView, value: string | null) {
  const area = TRACKING_NAV.find((item) => item.id === view)!;
  return area.sections.some((item) => item.id === value)
    ? (value as string)
    : DEFAULT_TRACKING_SECTION[view];
}

/**
 * Compatibility aliases keep previously published deep-links working while
 * every current navigation surface uses the canonical view and section IDs.
 */
export function resolveTrackingLocation(viewValue: string | null, sectionValue: string | null) {
  if (viewValue === 'journey' && sectionValue === 'upsells') {
    return { view: 'upsell-intelligence' as const, section: 'upsell-intelligence' };
  }
  if (viewValue === 'diagnostics') {
    const diagnosticsSection = ['health', 'console', 'help'].includes(sectionValue ?? '')
      ? sectionValue!
      : 'health';
    return { view: 'finance' as const, section: diagnosticsSection };
  }
  if (viewValue === 'destinations' && sectionValue === 'payments') {
    return { view: 'finance' as const, section: 'payments' };
  }
  const view: TrackingView = isTrackingView(viewValue) ? viewValue : 'overview';
  return { view, section: resolveTrackingSection(view, sectionValue) };
}
