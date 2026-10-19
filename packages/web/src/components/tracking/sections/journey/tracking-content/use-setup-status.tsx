'use client';
import { copyText } from '@/lib/clipboard';
import { useEffect } from 'react';
import { META_URL_PARAMETERS } from './tracking-gateway-config';
import { trackingAreas } from './tracking-navigation';
import type { TrackingSectionId } from './tracking-navigation';
import type { useDestinationQueries } from './use-destination-queries';
import type { useDomainActions } from './use-domain-actions';
import type { useFormState } from './use-form-state';
import type { useProductActions } from './use-product-actions';
import type { usePushcutActions } from './use-pushcut-actions';
import type { useUpsellQueries } from './use-upsell-queries';
export function useSetupStatus({
  vendepayWebhook,
  advanced,
  offerId,
  config,
  section,
  metaPixels,
  tiktokDestinations,
  utmify,
  metaDeliveries,
  selectedVendepayConnectionId,
  setSelectedVendepayConnectionName,
  utmifyPixel,
  utmifyWebEvents,
  utmifyDeliveries,
  productKinds,
  pushcutDestinations,
  pushcutDeliveries,
}: {
  vendepayWebhook: ReturnType<typeof useFormState>['vendepayWebhook'];
  advanced: ReturnType<typeof useUpsellQueries>['advanced'];
  offerId: string;
  config: ReturnType<typeof useDestinationQueries>['config'];
  section: TrackingSectionId;
  metaPixels: ReturnType<typeof useDestinationQueries>['metaPixels'];
  tiktokDestinations: ReturnType<typeof useDestinationQueries>['tiktokDestinations'];
  utmify: ReturnType<typeof useDestinationQueries>['utmify'];
  metaDeliveries: ReturnType<typeof useDomainActions>['metaDeliveries'];
  selectedVendepayConnectionId: ReturnType<typeof useFormState>['selectedVendepayConnectionId'];
  setSelectedVendepayConnectionName: ReturnType<
    typeof useFormState
  >['setSelectedVendepayConnectionName'];
  utmifyPixel: ReturnType<typeof useDestinationQueries>['utmifyPixel'];
  utmifyWebEvents: ReturnType<typeof useDestinationQueries>['utmifyWebEvents'];
  utmifyDeliveries: ReturnType<typeof useDestinationQueries>['utmifyDeliveries'];
  productKinds: ReturnType<typeof useProductActions>['productKinds'];
  pushcutDestinations: ReturnType<typeof usePushcutActions>['pushcutDestinations'];
  pushcutDeliveries: ReturnType<typeof usePushcutActions>['pushcutDeliveries'];
}) {
  const copyVendepayWebhook = async () => {
    await copyText(vendepayWebhook, 'Webhook real copiado.');
  };

  const copyDnsValue = async (value: string, label: string) => {
    await copyText(value, `${label} copiado.`);
  };

  const copyInstallKit = async () => {
    const entryLinks = (advanced.data?.entry_links ?? [])
      .map((link) => `- ${link.name}: ${link.tracking_url}`)
      .join('\n');
    const kit = [
      'TMX · KIT DE INSTALAÇÃO',
      `Oferta: ${offerId}`,
      '',
      '1. SCRIPT (instale antes de </head> em todas as páginas)',
      config.data?.project?.install_code ?? 'Ative o tracking para gerar o script.',
      '',
      '2. WEBHOOK VENDEPAY',
      vendepayWebhook || 'Abra Integrações → Vendepay e gere a URL secreta.',
      '',
      '3. PARÂMETROS DA URL · META ADS',
      META_URL_PARAMETERS,
      '',
      '4. LINKS TMX',
      entryLinks || 'Nenhum link de entrada criado.',
    ].join('\n');
    await copyText(kit, 'Kit de instalação copiado.');
  };

  const activeArea =
    trackingAreas.find((area) => area.sections.includes(section)) ?? trackingAreas[0]!;

  const hasActiveMetaDestination = Boolean(metaPixels.data?.pixels?.some((pixel) => pixel.enabled));

  const hasActiveTikTokDestination = Boolean(
    tiktokDestinations.data?.destinations?.some((destination) => destination.enabled),
  );

  const hasConfiguredUtmifyDestination = Boolean(utmify.data?.configured);

  // Every connected platform is a valid destination on its own. UTMify is an
  // optional parallel delivery, not a prerequisite for Meta or TikTok.
  const hasConversionDestination =
    hasActiveMetaDestination || hasActiveTikTokDestination || hasConfiguredUtmifyDestination;

  const hasTikTokDelivery = Boolean(
    tiktokDestinations.data?.destinations?.some(
      (destination) => Number(destination.delivered_7d ?? 0) > 0,
    ),
  );

  const setupSteps = [
    {
      label: 'Ativar oferta',
      detail: 'Identificador e infraestrutura',
      ready: Boolean(config.data?.configured),
      target: 'code' as TrackingSectionId,
    },
    {
      label: 'Instalar captura',
      detail: 'Script, domínio ou link TMX',
      ready: Boolean(config.data?.project?.install_code),
      target: 'code' as TrackingSectionId,
    },
    {
      label: 'Conectar Vendepay',
      detail: 'Webhook exclusivo da oferta',
      ready: Boolean(config.data?.vendepay?.configured),
      target: 'gateways' as TrackingSectionId,
    },
    {
      label: 'Conectar destinos',
      detail: 'Meta, TikTok ou UTMify',
      ready: hasConversionDestination,
      target:
        hasActiveTikTokDestination && !hasActiveMetaDestination
          ? ('tiktok-ads' as TrackingSectionId)
          : hasActiveMetaDestination
            ? ('pixels' as TrackingSectionId)
            : ('utmify' as TrackingSectionId),
    },
    {
      label: 'Validar jornada',
      detail: 'PageView, IC e Purchase',
      ready:
        Boolean(metaDeliveries.data?.deliveries?.some((item) => item.state === 'delivered')) ||
        hasTikTokDelivery,
      target: 'help' as TrackingSectionId,
    },
  ];

  const setupReady = setupSteps.filter((step) => step.ready).length;

  const vendepayConnections = config.data?.vendepay?.connections ?? [];

  const selectedVendepayConnection = vendepayConnections.find(
    (connection) => connection.id === selectedVendepayConnectionId,
  );

  useEffect(() => {
    setSelectedVendepayConnectionName(selectedVendepayConnection?.name ?? '');
  }, [selectedVendepayConnection?.name, setSelectedVendepayConnectionName]);

  const destinationLoadingTitle =
    section === 'meta' && (config.isPending || advanced.isPending || metaDeliveries.isPending)
      ? 'Carregando destino Meta…'
      : section === 'tiktok-ads' && config.isPending
        ? 'Carregando destino TikTok Ads…'
        : section === 'utmify' &&
            (config.isPending ||
              utmify.isPending ||
              utmifyPixel.isPending ||
              utmifyWebEvents.isPending ||
              utmifyDeliveries.isPending ||
              productKinds.isPending)
          ? 'Carregando destino UTMify…'
          : section === 'pushcut' && (pushcutDestinations.isPending || pushcutDeliveries.isPending)
            ? 'Carregando destinos Pushcut…'
            : section === 'vturb' && advanced.isPending
              ? 'Carregando destino VTurb…'
              : null;
  return {
    copyVendepayWebhook,
    copyDnsValue,
    copyInstallKit,
    activeArea,
    hasActiveMetaDestination,
    hasActiveTikTokDestination,
    hasConfiguredUtmifyDestination,
    hasConversionDestination,
    hasTikTokDelivery,
    setupSteps,
    setupReady,
    vendepayConnections,
    selectedVendepayConnection,
    destinationLoadingTitle,
  };
}
