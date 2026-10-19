'use client';
import type { LucideIcon } from 'lucide-react';
import { RadioTower } from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import { Megaphone } from 'lucide-react';
import { Undo2 } from 'lucide-react';
import { FlaskConical } from 'lucide-react';
import { Video } from 'lucide-react';
import { Facebook } from 'lucide-react';
import { Globe2 } from 'lucide-react';
import { Braces } from 'lucide-react';
import { Cable } from 'lucide-react';
import { Send } from 'lucide-react';
import { BellRing } from 'lucide-react';
import { Percent } from 'lucide-react';
import { HelpCircle } from 'lucide-react';
import { Layers3 } from 'lucide-react';
export type TrackingSectionId =
  | 'tracker'
  | 'funnel'
  | 'upsells'
  | 'attribution'
  | 'refunds'
  | 'links'
  | 'ab'
  | 'vturb'
  | 'pixels'
  | 'domains'
  | 'code'
  | 'gateways'
  | 'meta'
  | 'utmify'
  | 'google-ads'
  | 'tiktok-ads'
  | 'pushcut'
  | 'fees'
  | 'help';

export const ADVANCED_QUERY_SECTIONS = new Set<TrackingSectionId>([
  'domains',
  'gateways',
  'meta',
  'links',
  'ab',
  'vturb',
]);

export const CONFIG_QUERY_SECTIONS = new Set<TrackingSectionId>([
  'fees',
  'gateways',
  'meta',
  'tiktok-ads',
  'utmify',
]);

export const sections: Array<{
  id: TrackingSectionId;
  label: string;
  icon: LucideIcon;
  group: string;
}> = [
  { id: 'tracker', label: 'Tracker', icon: RadioTower, group: 'Operação' },
  { id: 'funnel', label: 'Funil', icon: BarChart3, group: 'Operação' },
  { id: 'upsells', label: 'Upsell Intelligence', icon: RadioTower, group: 'Operação' },
  { id: 'attribution', label: 'Campanhas e anúncios', icon: Megaphone, group: 'Operação' },
  { id: 'refunds', label: 'Reembolsos e chargeback', icon: Undo2, group: 'Operação' },
  { id: 'ab', label: 'Testes A/B', icon: FlaskConical, group: 'Operação' },
  { id: 'vturb', label: 'Conversões vTurb', icon: Video, group: 'Operação' },
  { id: 'pixels', label: 'Pixels', icon: Facebook, group: 'Configuração' },
  { id: 'domains', label: 'Domínios', icon: Globe2, group: 'Configuração' },
  { id: 'code', label: 'Código', icon: Braces, group: 'Configuração' },
  { id: 'gateways', label: 'Gateways', icon: Cable, group: 'Configuração' },
  { id: 'meta', label: 'Envio ao Meta', icon: Send, group: 'Configuração' },
  { id: 'utmify', label: 'Envio à UTMify', icon: Cable, group: 'Configuração' },
  { id: 'google-ads', label: 'Google Ads', icon: Globe2, group: 'Configuração' },
  { id: 'tiktok-ads', label: 'TikTok Ads', icon: RadioTower, group: 'Configuração' },
  { id: 'pushcut', label: 'Notificações Pushcut', icon: BellRing, group: 'Configuração' },
  { id: 'fees', label: 'Taxas e líquido', icon: Percent, group: 'Configuração' },
  { id: 'help', label: 'Ajuda e testes', icon: HelpCircle, group: 'Configuração' },
];

export type TrackingArea =
  | 'results'
  | 'capture'
  | 'meta'
  | 'integrations'
  | 'finance'
  | 'automations'
  | 'diagnostic';

export const trackingAreas: Array<{
  id: TrackingArea;
  label: string;
  icon: LucideIcon;
  sections: TrackingSectionId[];
}> = [
  {
    id: 'results',
    label: 'Resultados',
    icon: BarChart3,
    sections: ['tracker', 'funnel', 'upsells', 'attribution'],
  },
  { id: 'capture', label: 'Captura e links', icon: Layers3, sections: ['code', 'domains', 'ab'] },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Cable,
    sections: ['gateways', 'pixels', 'meta', 'utmify', 'vturb', 'google-ads', 'tiktok-ads'],
  },
  { id: 'finance', label: 'Financeiro', icon: Percent, sections: ['refunds', 'fees'] },
  { id: 'automations', label: 'Automações', icon: BellRing, sections: ['pushcut'] },
  { id: 'diagnostic', label: 'Diagnóstico', icon: HelpCircle, sections: ['help'] },
];
