'use client';
import type { TrackingGatewayProvider } from '@page-cloner/shared';
export type GatewayPlatform = 'vendepay' | TrackingGatewayProvider;

export const GATEWAY_PLATFORM_LABELS: Record<GatewayPlatform, string> = {
  vendepay: 'VendePay',
  paysight: 'Paysight',
  explodely: 'Explodely',
};

export const vendepaySample = JSON.stringify(
  {
    event_id: 'evt-homologacao-1',
    transaction_id: 'tx-homologacao-1',
    status: 'approved',
    amount: '99.90',
    currency: 'BRL',
    src: 'visitor-id-do-tmx',
    payment_method: 'pix',
    product: { id: 'produto-1', name: 'Produto principal' },
    offer: { id: 'plano-1', name: 'Plano principal' },
    customer: { name: 'Cliente Teste', email: 'cliente@example.com' },
    metadata: {
      utm_source: 'facebook',
      utm_campaign: 'campanha-teste',
      utm_content: 'criativo-a',
    },
  },
  null,
  2,
);

export const META_URL_PARAMETERS =
  'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}';
