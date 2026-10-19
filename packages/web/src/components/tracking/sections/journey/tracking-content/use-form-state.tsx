'use client';
import type { UpsellStageKey } from '@/lib/api-client';
import type { TrackingProductKind } from '@/lib/api-client';
import type { ExplodelyGatewaySettings } from '@page-cloner/shared';
import { useId } from 'react';
import { useState } from 'react';
import type { GatewayPlatform } from './tracking-gateway-config';
import { vendepaySample } from './tracking-gateway-config';
import { saoPauloDate } from './tracking-helpers';
import type { TrackingSectionId } from './tracking-navigation';
export function useFormState() {
  const formId = useId();

  const setSection = (_nextSection: TrackingSectionId) => undefined;

  const [trackingFrom, setTrackingFrom] = useState(() => saoPauloDate());

  const [trackingTo, setTrackingTo] = useState(() => saoPauloDate());

  const [isRefreshingTracking, setIsRefreshingTracking] = useState(false);

  const [domain, setDomain] = useState('');

  const [domainKind, setDomainKind] = useState<'source' | 'tracking'>('source');

  const [minimum, setMinimum] = useState('0');

  const [attributedOnly, setAttributedOnly] = useState(true);

  const [testName, setTestName] = useState('');

  const [kind, setKind] = useState<'checkout' | 'presell'>('checkout');

  const [armA, setArmA] = useState('A');

  const [armB, setArmB] = useState('B');

  const [trafficA, setTrafficA] = useState('50');

  const [destinationA, setDestinationA] = useState('');

  const [destinationB, setDestinationB] = useState('');

  const [entryLinkName, setEntryLinkName] = useState('');

  const [entryDestination, setEntryDestination] = useState('');

  const [entryTrafficSource, setEntryTrafficSource] = useState<
    'meta' | 'google' | 'tiktok' | 'native' | 'organic' | 'email' | 'other'
  >('meta');

  const [editingEntryLinkId, setEditingEntryLinkId] = useState('');

  const [editingEntryLinkName, setEditingEntryLinkName] = useState('');

  const [editingEntryDestination, setEditingEntryDestination] = useState('');

  const [editingEntryTrafficSource, setEditingEntryTrafficSource] = useState<
    'meta' | 'google' | 'tiktok' | 'native' | 'organic' | 'email' | 'other' | 'unknown'
  >('unknown');

  const [convertingEntryLinkId, setConvertingEntryLinkId] = useState('');

  const [entryAbName, setEntryAbName] = useState('');

  const [entryAbDestinationA, setEntryAbDestinationA] = useState('');

  const [entryAbDestinationB, setEntryAbDestinationB] = useState('');

  const [entryAbTrafficA, setEntryAbTrafficA] = useState('50');

  const [vendepayWebhook, setVendepayWebhook] = useState('');

  const [vendepayConnectionName, setVendepayConnectionName] = useState('');

  const [selectedVendepayConnectionId, setSelectedVendepayConnectionId] = useState('');

  const [selectedVendepayConnectionName, setSelectedVendepayConnectionName] = useState('');

  const [vendepaySigningSecret, setVendepaySigningSecret] = useState('');

  const [paysightName, setPaysightName] = useState('Paysight · Produção');

  const [paysightApiKey, setPaysightApiKey] = useState('');

  const [paysightSecret, setPaysightSecret] = useState('');

  const [paysightProduct, setPaysightProduct] = useState('');

  const [paysightWebhook, setPaysightWebhook] = useState('');

  const [gatewayPlatform, setGatewayPlatform] = useState<GatewayPlatform>('vendepay');

  const [gatewayName, setGatewayName] = useState('');

  const [gatewayCreatedWebhook, setGatewayCreatedWebhook] = useState('');

  const [gatewayFormError, setGatewayFormError] = useState('');

  const [explodelyVendorId, setExplodelyVendorId] = useState('');

  const [explodelySellerId, setExplodelySellerId] = useState('');

  const [explodelyCurrency, setExplodelyCurrency] =
    useState<ExplodelyGatewaySettings['currency']>('USD');

  const [explodelyAmountUnit, setExplodelyAmountUnit] =
    useState<ExplodelyGatewaySettings['amount_unit']>('cents');

  const [explodelyAmountScale, setExplodelyAmountScale] = useState('100');

  const [upsellStageKey, setUpsellStageKey] = useState<UpsellStageKey>('upsell_1');

  const [upsellStageName, setUpsellStageName] = useState('Upsell 1');

  const [upsellDestination, setUpsellDestination] = useState('');

  const [upsellConnectionDestinations, setUpsellConnectionDestinations] = useState<
    Record<string, string>
  >({});

  const [editingUpsellStageId, setEditingUpsellStageId] = useState('');

  const [upsellBuyerFilter, setUpsellBuyerFilter] = useState<'all' | 'front_only' | 'with_upsell'>(
    'front_only',
  );

  const [upsellTestFilter, setUpsellTestFilter] = useState<
    'all' | 'worked' | 'failed' | 'unclassified'
  >('all');

  const [upsellIdentityOffset, setUpsellIdentityOffset] = useState(0);

  const [vendepayPayload, setVendepayPayload] = useState(vendepaySample);

  const [utmifyToken, setUtmifyToken] = useState('');

  const [utmifyPixelId, setUtmifyPixelId] = useState('');

  const [utmifyEndpoint, setUtmifyEndpoint] = useState(
    'https://api.utmify.com.br/api-credentials/orders',
  );

  const [productKindSelection, setProductKindSelection] = useState<
    Record<string, TrackingProductKind>
  >({});

  const [pushcutName, setPushcutName] = useState('');

  const [pushcutSecret, setPushcutSecret] = useState('');

  const [pushcutFrontNotification, setPushcutFrontNotification] = useState('');

  const [pushcutUpsellNotification, setPushcutUpsellNotification] = useState('');

  const [pushcutDevices, setPushcutDevices] = useState('');

  const [feeVendepayPct, setFeeVendepayPct] = useState('');

  const [feeExtraAmount, setFeeExtraAmount] = useState('');

  const [feeExtraCurrency, setFeeExtraCurrency] = useState('');

  const [feeReservePct, setFeeReservePct] = useState('');

  const [feeReserveDays, setFeeReserveDays] = useState('');

  const [feePayoutDays, setFeePayoutDays] = useState('');
  return {
    formId,
    setSection,
    trackingFrom,
    setTrackingFrom,
    trackingTo,
    setTrackingTo,
    isRefreshingTracking,
    setIsRefreshingTracking,
    domain,
    setDomain,
    domainKind,
    setDomainKind,
    minimum,
    setMinimum,
    attributedOnly,
    setAttributedOnly,
    testName,
    setTestName,
    kind,
    setKind,
    armA,
    setArmA,
    armB,
    setArmB,
    trafficA,
    setTrafficA,
    destinationA,
    setDestinationA,
    destinationB,
    setDestinationB,
    entryLinkName,
    setEntryLinkName,
    entryDestination,
    setEntryDestination,
    entryTrafficSource,
    setEntryTrafficSource,
    editingEntryLinkId,
    setEditingEntryLinkId,
    editingEntryLinkName,
    setEditingEntryLinkName,
    editingEntryDestination,
    setEditingEntryDestination,
    editingEntryTrafficSource,
    setEditingEntryTrafficSource,
    convertingEntryLinkId,
    setConvertingEntryLinkId,
    entryAbName,
    setEntryAbName,
    entryAbDestinationA,
    setEntryAbDestinationA,
    entryAbDestinationB,
    setEntryAbDestinationB,
    entryAbTrafficA,
    setEntryAbTrafficA,
    vendepayWebhook,
    setVendepayWebhook,
    vendepayConnectionName,
    setVendepayConnectionName,
    selectedVendepayConnectionId,
    setSelectedVendepayConnectionId,
    selectedVendepayConnectionName,
    setSelectedVendepayConnectionName,
    vendepaySigningSecret,
    setVendepaySigningSecret,
    paysightName,
    setPaysightName,
    paysightApiKey,
    setPaysightApiKey,
    paysightSecret,
    setPaysightSecret,
    paysightProduct,
    setPaysightProduct,
    paysightWebhook,
    setPaysightWebhook,
    gatewayPlatform,
    setGatewayPlatform,
    gatewayName,
    setGatewayName,
    gatewayCreatedWebhook,
    setGatewayCreatedWebhook,
    gatewayFormError,
    setGatewayFormError,
    explodelyVendorId,
    setExplodelyVendorId,
    explodelySellerId,
    setExplodelySellerId,
    explodelyCurrency,
    setExplodelyCurrency,
    explodelyAmountUnit,
    setExplodelyAmountUnit,
    explodelyAmountScale,
    setExplodelyAmountScale,
    upsellStageKey,
    setUpsellStageKey,
    upsellStageName,
    setUpsellStageName,
    upsellDestination,
    setUpsellDestination,
    upsellConnectionDestinations,
    setUpsellConnectionDestinations,
    editingUpsellStageId,
    setEditingUpsellStageId,
    upsellBuyerFilter,
    setUpsellBuyerFilter,
    upsellTestFilter,
    setUpsellTestFilter,
    upsellIdentityOffset,
    setUpsellIdentityOffset,
    vendepayPayload,
    setVendepayPayload,
    utmifyToken,
    setUtmifyToken,
    utmifyPixelId,
    setUtmifyPixelId,
    utmifyEndpoint,
    setUtmifyEndpoint,
    productKindSelection,
    setProductKindSelection,
    pushcutName,
    setPushcutName,
    pushcutSecret,
    setPushcutSecret,
    pushcutFrontNotification,
    setPushcutFrontNotification,
    pushcutUpsellNotification,
    setPushcutUpsellNotification,
    pushcutDevices,
    setPushcutDevices,
    feeVendepayPct,
    setFeeVendepayPct,
    feeExtraAmount,
    setFeeExtraAmount,
    feeExtraCurrency,
    setFeeExtraCurrency,
    feeReservePct,
    setFeeReservePct,
    feeReserveDays,
    setFeeReserveDays,
    feePayoutDays,
    setFeePayoutDays,
  };
}
