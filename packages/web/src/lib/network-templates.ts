export type NetworkTrackingTemplateId = 'google' | 'tiktok' | 'meta';

export interface NetworkTrackingField {
  name: string;
  description: string;
}

export interface NetworkTrackingTemplate {
  id: NetworkTrackingTemplateId;
  networkName: string;
  urlPattern: string;
  urlTemplate: string;
  fields: readonly NetworkTrackingField[];
}

export const NETWORK_TRACKING_TEMPLATES = {
  google: {
    id: 'google',
    networkName: 'Google Ads',
    urlPattern: '?gclid=...',
    urlTemplate:
      '?utm_source=google&utm_medium=cpc&utm_campaign={campaign.id}&utm_content={adgroup.id}&utm_term={keyword}&gclid={gclid}',
    fields: [
      { name: 'gclid', description: 'Google Click ID do clique padrão' },
      { name: 'wbraid', description: 'Identificador de conversões iOS Web-to-App' },
      { name: 'gbraid', description: 'Identificador iOS Web-to-App alternativo' },
    ],
  },
  tiktok: {
    id: 'tiktok',
    networkName: 'TikTok Ads',
    urlPattern: '?ttclid=...',
    urlTemplate:
      '?utm_source=tiktok&utm_medium=paid-social&utm_campaign=__CAMPAIGN_ID__&utm_content=__AID__&utm_term=__CID__',
    fields: [
      { name: 'ttclid', description: 'TikTok Click ID recebido na URL' },
      { name: 'ttp', description: 'Cookie first-party _ttp do pixel' },
    ],
  },
  meta: {
    id: 'meta',
    networkName: 'Meta Ads',
    urlPattern: '?fbclid=...',
    urlTemplate:
      '?utm_source=facebook&utm_medium=paid-social&utm_campaign={{campaign.id}}&utm_content={{adset.id}}&utm_term={{ad.id}}&fbclid={{fbclid}}',
    fields: [
      { name: 'fbclid', description: 'Meta Click ID recebido na URL' },
      { name: 'fbc', description: 'Identificador derivado do fbclid' },
      { name: 'fbp', description: 'Cookie first-party _fbp do navegador' },
    ],
  },
} as const satisfies Record<NetworkTrackingTemplateId, NetworkTrackingTemplate>;
