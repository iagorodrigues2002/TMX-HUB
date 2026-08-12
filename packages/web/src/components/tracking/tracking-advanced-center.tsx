'use client';

import { TrackingHelp } from '@/components/tracking/tracking-help';
import { TrackingLiveConsole } from '@/components/tracking/tracking-live-console';
import { TrackingPanel } from '@/components/tracking/tracking-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/currency-preference';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BellRing,
  Braces,
  Cable,
  Copy,
  Facebook,
  FlaskConical,
  Globe2,
  HelpCircle,
  Layers3,
  Megaphone,
  Percent,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const vendepaySample = JSON.stringify(
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

const META_URL_PARAMETERS =
  'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}';

const trackingDomainPreview = (value: string) => {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.replace(/:\d+$/, '');
  if (!hostname) return null;
  const parts = hostname.split('.');
  const compoundSuffix = /\.(com|net|org|gov|edu)\.[a-z]{2}$/.test(hostname);
  const rootSize = compoundSuffix ? 3 : 2;
  if (parts.length < rootSize) return null;
  return `tmx.${parts.slice(-rootSize).join('.')}`;
};

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function ValidatedUpsellLink({ link }: { link: { stage_id: string; name: string; url: string } }) {
  const validation = useQuery({
    queryKey: ['upsell-compatibility', link.stage_id, link.url],
    queryFn: () => apiClient.checkTrackingUpsellCompatibility(link.url),
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    retry: 1,
  });
  if (validation.isLoading) {
    return <span className="rounded-md border border-white/10 px-2.5 py-1.5 text-white/40">{link.name} · verificando</span>;
  }
  if (!validation.data?.compatible) {
    const accountMissing = validation.data?.reason === 'account_not_configured';
    return <span title={accountMissing ? 'Cadastre a URL desta etapa para a conta VendePay do comprador' : 'A Vendepay não habilitou esta oferta para este vendaId'} className="rounded-md border border-rose-300/20 bg-rose-300/[0.06] px-2.5 py-1.5 text-rose-200/70">{link.name} · {accountMissing ? 'conta sem URL' : 'indisponível'}</span>;
  }
  return <a title="Elegibilidade confirmada; o TMX validará novamente ao abrir" href={link.url} target="_blank" rel="noreferrer" className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.08] px-2.5 py-1.5 text-emerald-100 transition hover:bg-emerald-300/[0.16]">{link.name} · elegível</a>;
}

function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function saoPauloDateOffset(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return saoPauloDate(date);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="mono-num mt-1 text-base font-semibold text-white/85">{value}</p>
    </div>
  );
}

type Section =
  | 'tracker'
  | 'funnel'
  | 'upsells'
  | 'attribution'
  | 'refunds'
  | 'ab'
  | 'vturb'
  | 'pixels'
  | 'domains'
  | 'code'
  | 'gateways'
  | 'meta'
  | 'utmify'
  | 'pushcut'
  | 'fees'
  | 'help';

const sections: Array<{ id: Section; label: string; icon: LucideIcon; group: string }> = [
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
  { id: 'pushcut', label: 'Notificações Pushcut', icon: BellRing, group: 'Configuração' },
  { id: 'fees', label: 'Taxas e líquido', icon: Percent, group: 'Configuração' },
  { id: 'help', label: 'Ajuda e testes', icon: HelpCircle, group: 'Configuração' },
];

type TrackingArea =
  | 'results'
  | 'capture'
  | 'meta'
  | 'integrations'
  | 'finance'
  | 'automations'
  | 'diagnostic';

const trackingAreas: Array<{
  id: TrackingArea;
  label: string;
  icon: LucideIcon;
  sections: Section[];
}> = [
  {
    id: 'results',
    label: 'Resultados',
    icon: BarChart3,
    sections: ['tracker', 'funnel', 'upsells', 'attribution'],
  },
  { id: 'capture', label: 'Captura e links', icon: Layers3, sections: ['code', 'domains', 'ab'] },
  { id: 'meta', label: 'Meta', icon: Facebook, sections: ['pixels', 'meta'] },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Cable,
    sections: ['gateways', 'utmify', 'vturb'],
  },
  { id: 'finance', label: 'Financeiro', icon: Percent, sections: ['refunds', 'fees'] },
  { id: 'automations', label: 'Automações', icon: BellRing, sections: ['pushcut'] },
  { id: 'diagnostic', label: 'Diagnóstico', icon: HelpCircle, sections: ['help'] },
];

export function TrackingAdvancedCenter({
  offerId,
  canManage,
}: { offerId: string; canManage: boolean }) {
  const [section, setSection] = useState<Section>('tracker');
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
  const [editingEntryLinkId, setEditingEntryLinkId] = useState('');
  const [editingEntryLinkName, setEditingEntryLinkName] = useState('');
  const [editingEntryDestination, setEditingEntryDestination] = useState('');
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
  const [upsellStageKey, setUpsellStageKey] = useState<'upsell_1' | 'upsell_2' | 'upsell_3'>(
    'upsell_1',
  );
  const [upsellStageName, setUpsellStageName] = useState('Upsell 1');
  const [upsellDestination, setUpsellDestination] = useState('');
  const [upsellConnectionDestinations, setUpsellConnectionDestinations] = useState<
    Record<string, string>
  >({});
  const [editingUpsellStageId, setEditingUpsellStageId] = useState('');
  const [upsellBuyerFilter, setUpsellBuyerFilter] = useState<
    'all' | 'front_only' | 'with_upsell'
  >('front_only');
  const [vendepayPayload, setVendepayPayload] = useState(vendepaySample);
  const [utmifyToken, setUtmifyToken] = useState('');
  const [utmifyPixelId, setUtmifyPixelId] = useState('');
  const [utmifyEndpoint, setUtmifyEndpoint] = useState(
    'https://api.utmify.com.br/api-credentials/orders',
  );
  const [productKindSelection, setProductKindSelection] = useState<
    Record<string, 'front' | 'upsell' | 'upsell_2' | 'upsell_3'>
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
  const datePresets = [
    { label: 'Hoje', from: saoPauloDateOffset(0), to: saoPauloDateOffset(0) },
    { label: 'Ontem', from: saoPauloDateOffset(1), to: saoPauloDateOffset(1) },
    { label: 'Anteontem', from: saoPauloDateOffset(2), to: saoPauloDateOffset(2) },
    { label: '7 dias', from: saoPauloDateOffset(6), to: saoPauloDateOffset(0) },
    { label: '30 dias', from: saoPauloDateOffset(29), to: saoPauloDateOffset(0) },
  ];
  const trackingPeriod = { from: trackingFrom, to: trackingTo };
  const qc = useQueryClient();
  const refreshTracking = async () => {
    setIsRefreshingTracking(true);
    try {
      await Promise.all(
        [
          'tracking-summary',
          'tracking-events',
          'tracking-orders',
          'tracking-page-funnel',
          'tracking-journeys',
          'tracking-attribution',
          'tracking-countries',
        ].map((key) => qc.invalidateQueries({ queryKey: [key, offerId] })),
      );
      toast.success('Dados do período atualizados.');
    } finally {
      setIsRefreshingTracking(false);
    }
  };
  const advanced = useQuery({
    queryKey: ['tracking-advanced', offerId],
    queryFn: () => apiClient.getAdvancedTracking(offerId),
    retry: false,
  });
  const upsellIntelligence = useQuery({
    queryKey: ['tracking-upsells', offerId, trackingFrom, trackingTo],
    queryFn: () =>
      apiClient.getTrackingUpsells(offerId, { from: trackingFrom, to: trackingTo }),
    retry: false,
  });
  const upsellIdentities = useQuery({
    queryKey: ['tracking-upsell-identities', offerId, trackingFrom, trackingTo],
    queryFn: () =>
      apiClient.getTrackingUpsellIdentities(offerId, { from: trackingFrom, to: trackingTo }),
    enabled: section === 'upsells',
    retry: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
  const filteredUpsellIdentities = (upsellIdentities.data?.items ?? []).filter((identity) => {
    if (upsellBuyerFilter === 'front_only') return !identity.has_upsell;
    if (upsellBuyerFilter === 'with_upsell') return identity.has_upsell;
    return true;
  });
  const configuredUpsellStages = new Set(
    (upsellIntelligence.data?.stages ?? []).map((stage) => stage.stage_key),
  );
  useEffect(() => {
    if (editingUpsellStageId || !upsellIntelligence.data || !configuredUpsellStages.has(upsellStageKey)) return;
    const next = (['upsell_1', 'upsell_2', 'upsell_3'] as const).find(
      (stage) => !configuredUpsellStages.has(stage),
    );
    if (!next) return;
    setUpsellStageKey(next);
    setUpsellStageName(next === 'upsell_1' ? 'Upsell 1' : next === 'upsell_2' ? 'Upsell 2' : 'Upsell 3');
  }, [editingUpsellStageId, upsellIntelligence.data, upsellStageKey]);
  const saveUpsellStage = useMutation({
    mutationFn: () => {
      const accountDestination = Object.values(upsellConnectionDestinations).find((url) =>
        url.startsWith('http'),
      );
      const destinationUrl = accountDestination ?? upsellDestination;
      return editingUpsellStageId
        ? apiClient.updateTrackingUpsell(offerId, editingUpsellStageId, {
            name: upsellStageName,
            destination_url: destinationUrl,
            connection_destinations: upsellConnectionDestinations,
          })
        : apiClient.saveTrackingUpsell(offerId, {
            stage_key: upsellStageKey,
            name: upsellStageName,
            destination_url: destinationUrl,
            connection_destinations: upsellConnectionDestinations,
          });
    },
    onSuccess: () => {
      setUpsellDestination('');
      setUpsellConnectionDestinations({});
      setEditingUpsellStageId('');
      void qc.invalidateQueries({ queryKey: ['tracking-upsells', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      void qc.invalidateQueries({ queryKey: ['upsell-compatibility'] });
      toast.success(editingUpsellStageId ? 'Etapa atualizada.' : 'Nova etapa salva separadamente.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const deleteUpsellStage = useMutation({
    mutationFn: (stageId: string) => apiClient.deleteTrackingUpsell(offerId, stageId),
    onSuccess: (_result, stageId) => {
      if (editingUpsellStageId === stageId) {
        setEditingUpsellStageId('');
        setUpsellDestination('');
        setUpsellConnectionDestinations({});
      }
      void qc.invalidateQueries({ queryKey: ['tracking-upsells', offerId] });
      toast.success('Etapa de upsell apagada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const reconcileUpsellIdentities = useMutation({
    mutationFn: () => apiClient.reconcileTrackingUpsellIdentities(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-upsell-identities', offerId] });
      toast.success(
        `${result.vendid_found} vendaId aprovados encontrados · ${result.identities_stored} recuperados · ${result.non_paid_removed} não aprovados removidos.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const metaDeliveries = useQuery({
    queryKey: ['tracking-meta-deliveries', offerId],
    queryFn: () => apiClient.listMetaDeliveries(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
  const reconcileInitiateCheckouts = useMutation({
    mutationFn: () => apiClient.reconcileInitiateCheckouts(offerId, trackingPeriod),
    onSuccess: (result) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-utmify-web-events', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-attribution', offerId] }),
      ]);
      toast.success(
        `${result.events_found} ICs conferidos · ${result.attribution_recovered} enriquecidos com os PageViews · ${result.meta_queued} Meta reenfileirados · ${result.utmify_queued} UTMify.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const reconcileMetaPurchases = useMutation({
    mutationFn: () => apiClient.reconcileMetaPurchases(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] });
      toast.success(
        `${result.orders_found} compras conferidas · ${result.purchases_queued} Purchase reenfileirados para a Meta.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const addDomain = useMutation({
    mutationFn: () => apiClient.addTrackingDomain(offerId, domain, domainKind),
    onSuccess: () => {
      setDomain('');
      void refresh();
      toast.success('Domínio adicionado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const verifyDomain = useMutation({
    mutationFn: (domainId: string) => apiClient.verifyTrackingDomain(offerId, domainId),
    onSuccess: (result) => {
      void refresh();
      if (result.status === 'live') toast.success('Domínio confirmado e recebendo eventos.');
      else toast.info(result.detail);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const removeDomain = useMutation({
    mutationFn: (domainId: string) => apiClient.removeTrackingDomain(offerId, domainId),
    onSuccess: () => {
      void refresh();
      toast.success('Domínio removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveRules = useMutation({
    mutationFn: () =>
      apiClient.saveTrackingMetaRules(offerId, {
        attributed_only: attributedOnly,
        minimum_amount_minor: Math.round(Number(minimum || 0) * 100),
      }),
    onSuccess: () => {
      void refresh();
      toast.success('Regras de envio salvas.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const createTest = useMutation({
    mutationFn: async () => {
      const current = await apiClient.getTrackingConfig(offerId);
      const setup = current.configured ? null : await apiClient.setupTracking(offerId);
      await apiClient.createTrackingAbTest(offerId, {
        name: testName,
        kind,
        traffic_a: Number(trafficA),
        variants: [
          {
            label: armA,
            gateway: kind === 'checkout' ? 'vendepay' : undefined,
            destination_url: destinationA,
          },
          {
            label: armB,
            gateway: kind === 'checkout' ? 'vendepay' : undefined,
            destination_url: destinationB,
          },
        ],
      });
      return setup;
    },
    onSuccess: (setup) => {
      if (setup?.vendepay_webhook_url) setVendepayWebhook(setup.vendepay_webhook_url);
      setTestName('');
      setDestinationA('');
      setDestinationB('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Teste A/B criado e tracking ativado. O webhook está disponível em Gateways.'
          : 'Teste A/B ativado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const createEntryLink = useMutation({
    mutationFn: async () => {
      const current = await apiClient.getTrackingConfig(offerId);
      const setup = current.configured ? null : await apiClient.setupTracking(offerId);
      await apiClient.createTrackingEntryLink(offerId, {
        name: entryLinkName,
        destination_url: entryDestination,
      });
      return setup;
    },
    onSuccess: (setup) => {
      if (setup?.vendepay_webhook_url) setVendepayWebhook(setup.vendepay_webhook_url);
      setEntryLinkName('');
      setEntryDestination('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Link criado e tracking ativado. O webhook está disponível em Gateways.'
          : 'Link de entrada criado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const removeEntryLink = useMutation({
    mutationFn: (linkId: string) => apiClient.deleteTrackingEntryLink(offerId, linkId),
    onSuccess: () => {
      void refresh();
      toast.success('Link de entrada removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const updateEntryLink = useMutation({
    mutationFn: () =>
      apiClient.updateTrackingEntryLink(offerId, editingEntryLinkId, {
        name: editingEntryLinkName,
        destination_url: editingEntryDestination,
      }),
    onSuccess: () => {
      setEditingEntryLinkId('');
      void refresh();
      toast.success('Destino atualizado. A URL pública do anúncio não mudou.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const convertEntryLinkToAb = useMutation({
    mutationFn: () =>
      apiClient.convertTrackingEntryLinkToAbTest(offerId, convertingEntryLinkId, {
        name: entryAbName,
        traffic_a: Number(entryAbTrafficA),
        variants: [
          { label: 'A', destination_url: entryAbDestinationA },
          { label: 'B', destination_url: entryAbDestinationB },
        ],
      }),
    onSuccess: () => {
      setConvertingEntryLinkId('');
      setEntryAbName('');
      setEntryAbDestinationA('');
      setEntryAbDestinationB('');
      void refresh();
      toast.success('Teste A/B ativado na mesma URL já usada no anúncio.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
  });
  const setupTracking = useMutation({
    mutationFn: () => apiClient.setupTracking(offerId),
    onSuccess: (result) => {
      if (result.vendepay_webhook_url) setVendepayWebhook(result.vendepay_webhook_url);
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      setSection('gateways');
      toast.success(
        result.vendepay_webhook_url
          ? 'Tracking ativado. Copie agora o webhook da Vendepay.'
          : 'Tracking desta oferta já está ativo.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const utmify = useQuery({
    queryKey: ['tracking-utmify-destination', offerId],
    queryFn: () => apiClient.getTrackingUtmifyDestination(offerId),
    retry: false,
  });
  const utmifyPixel = useQuery({
    queryKey: ['tracking-utmify-pixel', offerId],
    queryFn: () => apiClient.getTrackingUtmifyPixel(offerId),
    retry: false,
  });
  const metaPixels = useQuery({
    queryKey: ['tracking-meta-pixels', offerId],
    queryFn: () => apiClient.listMetaPixels(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
  });
  const utmifyWebEvents = useQuery({
    queryKey: ['tracking-utmify-web-events', offerId, trackingFrom, trackingTo],
    queryFn: () => apiClient.listTrackingUtmifyWebEvents(offerId, trackingPeriod),
    refetchInterval: 30_000,
    retry: false,
  });
  const utmifyDeliveries = useQuery({
    queryKey: ['tracking-utmify-deliveries', offerId],
    queryFn: () => apiClient.listTrackingUtmifyDeliveries(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const retryUtmifyWebEvent = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingUtmifyWebEvent(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-web-events', offerId] });
      toast.success('IC reenfileirado para a UTMify.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveUtmify = useMutation({
    mutationFn: async () => {
      const setup = config.data?.configured ? null : await apiClient.setupTracking(offerId);
      const destination = await apiClient.saveTrackingUtmifyDestination(offerId, {
        name: 'UTMify',
        api_token: utmifyToken,
        endpoint_url: utmifyEndpoint,
      });
      return { destination, setup };
    },
    onSuccess: ({ setup }) => {
      if (setup?.vendepay_webhook_url) {
        setVendepayWebhook(setup.vendepay_webhook_url);
        setSection('gateways');
      }
      setUtmifyToken('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-destination', offerId] });
      toast.success(
        setup?.vendepay_webhook_url
          ? 'Tracking e UTMify configurados. O webhook da Vendepay já foi gerado.'
          : 'Destino UTMify configurado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveUtmifyPixel = useMutation({
    mutationFn: async () => {
      const setup = config.data?.configured ? null : await apiClient.setupTracking(offerId);
      const pixel = await apiClient.saveTrackingUtmifyPixel(offerId, utmifyPixelId);
      return { pixel, setup };
    },
    onSuccess: ({ pixel: result, setup }) => {
      if (setup?.vendepay_webhook_url) {
        setVendepayWebhook(setup.vendepay_webhook_url);
        setSection('gateways');
      }
      setUtmifyPixelId('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-pixel', offerId] });
      toast.success(`Pixel UTMify ${result.pixel_id} salvo. Reconcilie os ICs do dia.`);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const retryUtmify = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingUtmifyDelivery(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      toast.success('Reenvio colocado na fila.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const testUtmifyCheckout = useMutation({
    mutationFn: () => apiClient.sendTrackingUtmifyTestCheckout(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      toast.success(`Checkout de teste enviado: ${result.transaction_id}`);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const productKinds = useQuery({
    queryKey: ['tracking-product-kinds', offerId],
    queryFn: () => apiClient.getTrackingProductKinds(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const saveProductKind = useMutation({
    mutationFn: (input: {
      product_id: string;
      kind: 'front' | 'upsell' | 'upsell_2' | 'upsell_3';
      label?: string | null;
    }) => apiClient.setTrackingProductKind(offerId, input),
    onSuccess: (result, variables) => {
      setProductKindSelection((prev) => {
        const next = { ...prev };
        delete next[variables.product_id];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      void refreshTracking();
      toast.success(
        `Produto classificado · ${result.orders_updated} pedido(s) existente(s) atualizado(s).`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const removeProductKind = useMutation({
    mutationFn: (productId: string) => apiClient.deleteTrackingProductKind(offerId, productId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      toast.success('Mapeamento removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const recomputeProductKinds = useMutation({
    mutationFn: () => apiClient.recomputeTrackingProductKinds(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-product-kinds', offerId] });
      void refreshTracking();
      toast.success(`${result.updated} pedido(s) reclassificado(s).`);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const reconcileUtmifyUpsells = useMutation({
    mutationFn: () => apiClient.reconcileTrackingUtmifyUpsells(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] });
      void refreshTracking();
      toast.success(
        `${result.upsells_repaired} upsell(s) atribuídos · ${result.utmify_queued} atualização(ões) enviadas à UTMify.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const pushcutDestinations = useQuery({
    queryKey: ['tracking-pushcut-destinations', offerId],
    queryFn: () => apiClient.getTrackingPushcutDestinations(offerId),
    retry: false,
  });
  const pushcutDeliveries = useQuery({
    queryKey: ['tracking-pushcut-deliveries', offerId],
    queryFn: () => apiClient.listTrackingPushcutDeliveries(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const createPushcutDestination = useMutation({
    mutationFn: () =>
      apiClient.createTrackingPushcutDestination(offerId, {
        name: pushcutName,
        secret: pushcutSecret,
        front_notification_name: pushcutFrontNotification,
        upsell_notification_name: pushcutUpsellNotification || null,
        devices: pushcutDevices
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setPushcutName('');
      setPushcutSecret('');
      setPushcutFrontNotification('');
      setPushcutUpsellNotification('');
      setPushcutDevices('');
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
      toast.success('Destino Pushcut adicionado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const togglePushcutDestination = useMutation({
    mutationFn: (input: { destinationId: string; enabled: boolean }) =>
      apiClient.setTrackingPushcutDestinationEnabled(offerId, input.destinationId, input.enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const removePushcutDestination = useMutation({
    mutationFn: (destinationId: string) =>
      apiClient.deleteTrackingPushcutDestination(offerId, destinationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations', offerId] });
      toast.success('Destino Pushcut removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const testPushcutDestination = useMutation({
    mutationFn: (destinationId: string) =>
      apiClient.testTrackingPushcutDestination(offerId, destinationId),
    onSuccess: (result) => {
      if (result.accepted) {
        toast.success('Notificação de teste enviada. Confira seu dispositivo.');
        return;
      }
      const pushcutMessage = result.response?.error;
      const detail = pushcutMessage
        ? `${pushcutMessage}${result.status ? ` (HTTP ${result.status})` : ''}`
        : (result.error ?? `Pushcut respondeu com erro (HTTP ${result.status}).`);
      toast.error(`Pushcut recusou o teste: ${detail}`);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const retryPushcutDelivery = useMutation({
    mutationFn: (deliveryId: string) => apiClient.retryTrackingPushcutDelivery(offerId, deliveryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-deliveries', offerId] });
      toast.success('Reenvio colocado na fila.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const resendPushcutHistory = useMutation({
    mutationFn: () => apiClient.resendTrackingPushcutHistory(offerId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-deliveries', offerId] });
      toast.success(
        `${result.notifications_queued} notificação(ões) enfileirada(s) de ${result.orders_scanned} pedido(s) pago(s).`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const refunds = useQuery({
    queryKey: ['tracking-refunds', offerId, trackingFrom, trackingTo],
    queryFn: () => apiClient.getTrackingRefunds(offerId, trackingPeriod),
    enabled: section === 'refunds',
    retry: false,
  });
  const feeSettings = useQuery({
    queryKey: ['tracking-fee-settings', offerId],
    queryFn: () => apiClient.getTrackingFeeSettings(offerId),
    retry: false,
  });
  useEffect(() => {
    if (!feeSettings.data) return;
    setFeeVendepayPct(String(feeSettings.data.vendepay_fee_pct));
    setFeeExtraAmount((feeSettings.data.extra_fee_minor / 100).toFixed(2));
    setFeeExtraCurrency(feeSettings.data.extra_fee_currency);
    setFeeReservePct(String(feeSettings.data.reserve_pct));
    setFeeReserveDays(String(feeSettings.data.reserve_days));
    setFeePayoutDays(String(feeSettings.data.payout_days));
  }, [feeSettings.data]);
  const saveFeeSettings = useMutation({
    mutationFn: () =>
      apiClient.updateTrackingFeeSettings(offerId, {
        vendepay_fee_pct: Number(feeVendepayPct.replace(',', '.')),
        extra_fee_minor: Math.round(Number(feeExtraAmount.replace(',', '.')) * 100),
        extra_fee_currency: feeExtraCurrency,
        reserve_pct: Number(feeReservePct.replace(',', '.')),
        reserve_days: Number(feeReserveDays),
        payout_days: Number(feePayoutDays),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-fee-settings', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-summary', offerId] });
      toast.success('Taxas salvas. O líquido já reflete os novos valores.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const rotateVendepay = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.rotateVendepayConnectionWebhook(offerId, selectedVendepayConnectionId);
    },
    onSuccess: (result) => {
      setVendepayWebhook(result.vendepay_webhook_url);
      toast.success('Nova URL gerada para a conta selecionada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const createVendepayConnection = useMutation({
    mutationFn: () => apiClient.createVendepayConnection(offerId, vendepayConnectionName),
    onSuccess: (result) => {
      setVendepayConnectionName('');
      setSelectedVendepayConnectionId(result.connection.id);
      setVendepayWebhook(result.vendepay_webhook_url);
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Conta Vendepay adicionada. Copie o webhook agora.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const toggleVendepayConnection = useMutation({
    mutationFn: (connection: { id: string; enabled: boolean }) =>
      apiClient.updateVendepayConnection(offerId, connection.id, {
        enabled: !connection.enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Status da conta atualizado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const renameVendepayConnection = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.updateVendepayConnection(offerId, selectedVendepayConnectionId, {
        name: selectedVendepayConnectionName.trim(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Nome da conta Vendepay salvo.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveVendepaySigningSecret = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.saveVendepayConnectionSigningSecret(
        offerId,
        selectedVendepayConnectionId,
        vendepaySigningSecret,
      );
    },
    onSuccess: () => {
      setVendepaySigningSecret('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      toast.success('Secret da Vendepay salvo com criptografia.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const vendepayReceipts = useQuery({
    queryKey: ['tracking-vendepay-receipts', offerId],
    queryFn: () => apiClient.listVendepayReceipts(offerId),
    enabled: section === 'gateways' && Boolean(config.data?.configured),
    refetchInterval: 30_000,
    retry: false,
  });
  useEffect(() => {
    const connections = config.data?.vendepay?.connections ?? [];
    if (connections.length === 0) {
      setSelectedVendepayConnectionId('');
      return;
    }
    if (!connections.some((connection) => connection.id === selectedVendepayConnectionId)) {
      setSelectedVendepayConnectionId(connections[0]?.id ?? '');
    }
  }, [config.data?.vendepay?.connections, selectedVendepayConnectionId]);
  const previewVendepay = useMutation({
    mutationFn: () => {
      let payload: unknown;
      try {
        payload = JSON.parse(vendepayPayload);
      } catch {
        throw new Error('O payload não é um JSON válido.');
      }
      return apiClient.previewVendepayWebhook(offerId, payload);
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const copyVendepayWebhook = async () => {
    await navigator.clipboard.writeText(vendepayWebhook);
    toast.success('Webhook real copiado.');
  };
  const copyDnsValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
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
    await navigator.clipboard.writeText(kit);
    toast.success('Kit de instalação copiado.');
  };

  const activeArea =
    trackingAreas.find((area) => area.sections.includes(section)) ?? trackingAreas[0]!;
  const setupSteps = [
    {
      label: 'Ativar oferta',
      detail: 'Identificador e infraestrutura',
      ready: Boolean(config.data?.configured),
      target: 'code' as Section,
    },
    {
      label: 'Instalar captura',
      detail: 'Script, domínio ou link TMX',
      ready: Boolean(config.data?.project?.install_code),
      target: 'code' as Section,
    },
    {
      label: 'Conectar Vendepay',
      detail: 'Webhook exclusivo da oferta',
      ready: Boolean(config.data?.vendepay?.configured),
      target: 'gateways' as Section,
    },
    {
      label: 'Conectar destinos',
      detail: 'Meta e UTMify',
      ready: Boolean(metaPixels.data?.pixels?.length && utmify.data?.configured),
      target: metaPixels.data?.pixels?.length ? ('utmify' as Section) : ('pixels' as Section),
    },
    {
      label: 'Validar jornada',
      detail: 'PageView, IC e Purchase',
      ready: Boolean(metaDeliveries.data?.deliveries?.some((item) => item.state === 'delivered')),
      target: 'help' as Section,
    },
  ];
  const setupReady = setupSteps.filter((step) => step.ready).length;
  const vendepayConnections = config.data?.vendepay?.connections ?? [];
  const selectedVendepayConnection = vendepayConnections.find(
    (connection) => connection.id === selectedVendepayConnectionId,
  );
  useEffect(() => {
    setSelectedVendepayConnectionName(selectedVendepayConnection?.name ?? '');
  }, [selectedVendepayConnection?.id, selectedVendepayConnection?.name]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.06] to-transparent p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hud-label">Configuração guiada</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Oferta pronta em cinco etapas</h2>
            <p className="mt-1 text-xs text-white/45">
              {setupReady} de {setupSteps.length} etapas concluídas
            </p>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-white/[0.07] sm:w-52">
              <div
                className="h-full rounded-full bg-emerald-300 transition-all"
                style={{ width: `${(setupReady / setupSteps.length) * 100}%` }}
              />
            </div>
            {config.data?.configured && (
              <Button type="button" size="sm" variant="outline" onClick={copyInstallKit}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Copiar kit
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {setupSteps.map((step, index) => (
            <button
              key={step.label}
              type="button"
              onClick={() => setSection(step.target)}
              className={cn(
                'rounded-lg border p-3 text-left transition hover:bg-white/[0.04]',
                step.ready
                  ? 'border-emerald-300/15 bg-emerald-300/[0.04]'
                  : 'border-white/[0.08] bg-black/10',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10px]',
                  step.ready ? 'text-emerald-300' : 'text-amber-200',
                )}
              >
                {step.ready ? '✓ CONCLUÍDO' : `0${index + 1} PENDENTE`}
              </span>
              <p className="mt-2 text-sm font-medium text-white/80">{step.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-white/40">{step.detail}</p>
            </button>
          ))}
        </div>
      </section>
      <div className="grid min-w-0 gap-5 2xl:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="flex h-fit min-w-0 gap-2 overflow-x-auto overscroll-x-contain rounded-lg border border-white/[0.08] bg-black/15 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden 2xl:sticky 2xl:top-20 2xl:block 2xl:overflow-visible 2xl:p-3">
          {trackingAreas.map(({ id, label, icon: Icon, sections: areaSections }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(areaSections[0]!)}
              className={cn(
                'flex min-h-11 w-auto shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white/70 2xl:mb-1 2xl:w-full 2xl:gap-3 2xl:text-sm',
                activeArea.id === id &&
                  'border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,.08)]',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </aside>
        <div className="min-w-0">
          {activeArea.sections.length > 1 && (
            <div className="mb-3 flex gap-2 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/15 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeArea.sections.map((id) => {
                const item = sections.find((entry) => entry.id === id);
                if (!item) return null;
                return (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant={section === id ? 'default' : 'ghost'}
                    className="shrink-0"
                    onClick={() => setSection(id)}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
          )}
          {!config.isLoading &&
            (!config.data?.configured || !config.data?.vendepay?.configured) && (
              <section className="mb-4 rounded-lg border border-cyan-300/25 bg-cyan-300/[0.06] p-5 shadow-[0_0_32px_rgba(34,211,238,.08)]">
                <p className="hud-label text-cyan-200">
                  {config.data?.configured
                    ? 'Conexão Vendepay incompleta · reparo necessário'
                    : 'Oferta nova · configuração necessária'}
                </p>
                <div className="mt-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {config.data?.configured
                        ? 'Gere a conexão e o webhook da Vendepay'
                        : 'Ative o tracking desta oferta'}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">
                      O TMX criará o identificador da oferta, o código de instalação e o webhook
                      exclusivo da Vendepay. Depois disso, Pixels, UTMify e testes A/B ficam
                      disponíveis.
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      type="button"
                      className="h-11 shrink-0"
                      disabled={setupTracking.isPending}
                      onClick={() => setupTracking.mutate()}
                    >
                      {setupTracking.isPending
                        ? 'Criando infraestrutura…'
                        : 'Ativar e gerar webhook'}
                    </Button>
                  )}
                </div>
              </section>
            )}
          {(['tracker', 'funnel', 'attribution', 'refunds'] as Section[]).includes(section) && (
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/15 p-3">
              <div>
                <p className="hud-label">Período do trackeamento</p>
                <p className="mt-1 text-xs text-white/40">
                  Dados históricos separados por dia · horário de São Paulo
                </p>
              </div>
              <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto">
                <div
                  className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label="Datas rápidas"
                >
                  {datePresets.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant={
                        trackingFrom === preset.from && trackingTo === preset.to
                          ? 'default'
                          : 'outline'
                      }
                      className="h-10 shrink-0"
                      onClick={() => {
                        setTrackingFrom(preset.from);
                        setTrackingTo(preset.to);
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <label
                  htmlFor="tracking-from"
                  className="min-w-[150px] flex-1 space-y-1 sm:flex-none"
                >
                  <span className="hud-label block">Data inicial</span>
                  <Input
                    id="tracking-from"
                    type="date"
                    value={trackingFrom}
                    max={trackingTo}
                    onChange={(event) => setTrackingFrom(event.target.value || trackingTo)}
                    className="h-11 w-full sm:w-[160px]"
                  />
                </label>
                <label
                  htmlFor="tracking-to"
                  className="min-w-[150px] flex-1 space-y-1 sm:flex-none"
                >
                  <span className="hud-label block">Data final</span>
                  <Input
                    id="tracking-to"
                    type="date"
                    value={trackingTo}
                    min={trackingFrom}
                    max={saoPauloDate()}
                    onChange={(event) => setTrackingTo(event.target.value || trackingFrom)}
                    className="h-11 w-full sm:w-[160px]"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 flex-1 gap-2 sm:flex-none"
                  disabled={isRefreshingTracking}
                  onClick={() => void refreshTracking()}
                >
                  <RefreshCw
                    className={cn('h-3.5 w-3.5', isRefreshingTracking && 'animate-spin')}
                  />
                  Atualizar
                </Button>
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 flex-1 gap-2 sm:flex-none"
                    disabled={reconcileInitiateCheckouts.isPending}
                    onClick={() => reconcileInitiateCheckouts.mutate()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Reconciliar ICs
                  </Button>
                )}
              </div>
            </div>
          )}
          {section === 'tracker' && (
            <TrackingLiveConsole
              offerId={offerId}
              mode="tracker"
              from={trackingFrom}
              to={trackingTo}
            />
          )}
          {section === 'funnel' && (
            <TrackingLiveConsole
              offerId={offerId}
              mode="funnel"
              from={trackingFrom}
              to={trackingTo}
            />
          )}
          {section === 'upsells' && (
            <Module
              title="Upsell Intelligence"
              description="Monitore cada página diretamente pelo script, sem trocar nenhum link configurado na Vendepay."
            >
              <div className="mb-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-4 text-sm leading-6 text-emerald-50/75">
                <p className="font-semibold text-emerald-200">Modo somente script</p>
                <p>
                  Mantenha os links atuais do funil na Vendepay. Cadastre abaixo a URL que ela já abre e
                  instale o script gerado nessa página. O TMX captura a visita, o vendid disponível e cruza
                  tudo com os webhooks automaticamente.
                </p>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.045] p-4">
                <p className="hud-label text-cyan-200">Configurar etapa</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <select
                    aria-label="Etapa do upsell"
                    disabled={Boolean(editingUpsellStageId)}
                    className="h-10 rounded-md border border-white/[0.1] bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                    value={upsellStageKey}
                    onChange={(event) => {
                      const value = event.target.value as 'upsell_1' | 'upsell_2' | 'upsell_3';
                      setUpsellStageKey(value);
                      setUpsellStageName(
                        value === 'upsell_1' ? 'Upsell 1' : value === 'upsell_2' ? 'Upsell 2' : 'Upsell 3',
                      );
                    }}
                  >
                    <option value="upsell_1" disabled={configuredUpsellStages.has('upsell_1')}>
                      Upsell 1 {configuredUpsellStages.has('upsell_1') ? '— já cadastrado' : ''}
                    </option>
                    <option value="upsell_2" disabled={configuredUpsellStages.has('upsell_2')}>
                      Upsell 2 {configuredUpsellStages.has('upsell_2') ? '— já cadastrado' : ''}
                    </option>
                    <option value="upsell_3" disabled={configuredUpsellStages.has('upsell_3')}>
                      Upsell 3 {configuredUpsellStages.has('upsell_3') ? '— já cadastrado' : ''}
                    </option>
                  </select>
                  <Input
                    aria-label="Nome da etapa de upsell"
                    value={upsellStageName}
                    onChange={(event) => setUpsellStageName(event.target.value)}
                    placeholder="Nome da etapa"
                  />
                </div>
                {vendepayConnections.length > 0 && (
                  <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/20 p-3">
                    <p className="text-xs font-semibold text-white/75">Links por conta VendePay</p>
                    <p className="mt-1 text-[11px] leading-5 text-white/40">
                      O TMX identifica a conta da compra aprovada pelo vendaId e abre automaticamente o
                      destino configurado para essa conta. Contas sem URL não serão consideradas elegíveis.
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {vendepayConnections.map((connection) => (
                        <label key={connection.id} className="block">
                          <span className="mb-1.5 block text-xs text-cyan-100/70">
                            {connection.name}
                          </span>
                          <Input
                            aria-label={`Link de upsell para ${connection.name}`}
                            value={upsellConnectionDestinations[connection.id] ?? ''}
                            onChange={(event) =>
                              setUpsellConnectionDestinations((current) => {
                                const next = { ...current };
                                const value = event.target.value.trim();
                                if (value) next[connection.id] = value;
                                else delete next[connection.id];
                                return next;
                              })
                            }
                            placeholder={`URL usada pela ${connection.name}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {canManage && (
                  <Button
                    className="mt-3"
                    disabled={
                      upsellStageName.trim().length < 2 ||
                      !Object.values(upsellConnectionDestinations).some((url) =>
                        url.startsWith('http'),
                      ) ||
                      (!editingUpsellStageId && configuredUpsellStages.has(upsellStageKey)) ||
                      saveUpsellStage.isPending
                    }
                    onClick={() => saveUpsellStage.mutate()}
                  >
                    {saveUpsellStage.isPending
                      ? 'Salvando…'
                      : editingUpsellStageId
                        ? 'Salvar alterações desta etapa'
                        : 'Salvar e gerar script'}
                  </Button>
                )}
                {editingUpsellStageId && (
                  <Button
                    className="ml-2 mt-3"
                    variant="outline"
                    onClick={() => {
                      setEditingUpsellStageId('');
                      setUpsellDestination('');
                      setUpsellConnectionDestinations({});
                    }}
                  >
                    Cancelar edição
                  </Button>
                )}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                {(upsellIntelligence.data?.stages ?? []).map((stage) => {
                  const eligibleBuyers = Number(stage.eligible_buyers ?? 0);
                  const pageViews = Number(stage.page_views ?? 0);
                  const offerViews = Number(stage.offer_views ?? 0);
                  const connectRate = eligibleBuyers ? (pageViews / eligibleBuyers) * 100 : 0;
                  const viewRate = pageViews ? (offerViews / pageViews) * 100 : 0;
                  const acceptRate = offerViews ? (Number(stage.accepts) / offerViews) * 100 : 0;
                  return (
                    <article
                      key={stage.id}
                      className="rounded-xl border border-emerald-300/15 bg-black/15 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="hud-label text-emerald-200">{stage.stage_key}</p>
                          <h3 className="mt-1 font-semibold text-white/90">{stage.name}</h3>
                        </div>
                        <span className={stage.enabled ? 'text-xs text-emerald-300' : 'text-xs text-white/35'}>
                          {stage.enabled ? 'ativo' : 'pausado'}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <Metric label="Compradores elegíveis" value={eligibleBuyers} />
                        <Metric label="Página carregada" value={pageViews} />
                        <Metric label="Connect Rate" value={`${connectRate.toFixed(1)}%`} />
                        <Metric label="Oferta visualizada" value={`${viewRate.toFixed(1)}%`} />
                        <Metric label="Cliques em aceitar" value={stage.accepts} />
                        <Metric label="Accept Rate" value={`${acceptRate.toFixed(1)}%`} />
                        <Metric label="Recusas" value={stage.declines} />
                        <Metric label="Compras" value={stage.purchases} />
                        <Metric label="vendaId identificados" value={stage.identified_buyers} />
                        <Metric label="Saídas sem decisão" value={stage.exits} />
                        <Metric label="Erros da página" value={stage.errors} />
                      </div>
                      {canManage && (
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingUpsellStageId(stage.id);
                              setUpsellStageKey(stage.stage_key);
                              setUpsellStageName(stage.name);
                              setUpsellDestination(stage.destination_url);
                              setUpsellConnectionDestinations(stage.connection_destinations ?? {});
                            }}
                          >
                            Editar links por conta
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Apagar ${stage.name}`}
                            disabled={deleteUpsellStage.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Apagar ${stage.name}? A configuração e os dados técnicos dessa etapa serão removidos. Pedidos e webhooks não serão apagados.`,
                                )
                              ) {
                                deleteUpsellStage.mutate(stage.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-300" />
                          </Button>
                        </div>
                      )}
                      <div className="mt-3 space-y-1.5 rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                          Destinos configurados
                        </p>
                        {vendepayConnections
                          .filter((connection) => stage.connection_destinations?.[connection.id])
                          .map((connection) => (
                            <div key={connection.id} className="flex min-w-0 items-center gap-2 text-[11px]">
                              <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-0.5 text-emerald-100/75">
                                {connection.name}
                              </span>
                              <span className="truncate text-cyan-100/55" title={stage.connection_destinations[connection.id]}>
                                {stage.connection_destinations[connection.id]}
                              </span>
                            </div>
                          ))}
                        {!Object.keys(stage.connection_destinations ?? {}).length && (
                          <p className="text-[11px] text-amber-100/55">
                            Nenhuma conta VendePay configurada nesta etapa.
                          </p>
                        )}
                      </div>
                      <p className="mt-4 text-[11px] text-white/40">Link TMX opcional — não é necessário trocar na Vendepay</p>
                      <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded bg-black/25 p-2 text-[11px] text-cyan-100">
                        {stage.secure_url}
                      </code>
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(stage.secure_url);
                          toast.success('Link seguro do upsell copiado.');
                        }}
                      >
                        <Copy className="mr-2 h-3.5 w-3.5" /> Copiar link opcional
                      </Button>
                      <p className="mt-4 text-[11px] text-white/40">Script desta página</p>
                      <code className="mt-1 block max-h-24 overflow-auto rounded bg-black/25 p-2 text-[10px] leading-4 text-cyan-100/75">
                        {stage.install_code}
                      </code>
                      <Button
                        className="mt-2 w-full"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(stage.install_code);
                          toast.success('Script do upsell copiado.');
                        }}
                      >
                        Copiar script
                      </Button>
                    </article>
                  );
                })}
              </div>
              {!upsellIntelligence.isLoading && !upsellIntelligence.data?.stages.length && (
                <p className="mt-4 rounded-xl border border-dashed border-white/[0.1] p-5 text-sm text-white/45">
                  Cadastre a URL que a Vendepay já abre para gerar o script de monitoramento.
                </p>
              )}
              <div className="mt-5 rounded-xl border border-white/[0.08] p-4 text-xs leading-6 text-white/50">
                <p className="font-semibold text-white/75">Marcação recomendada dos botões</p>
                <code className="mt-2 block overflow-x-auto text-cyan-100/75">
                  {'<a data-tmx-upsell-accept href="...">Sim, quero adicionar</a>'}
                </code>
                <code className="block overflow-x-auto text-cyan-100/75">
                  {'<a data-tmx-upsell-decline href="...">Não, obrigado</a>'}
                </code>
                <p className="mt-2">
                  O script detecta botões automaticamente, captura scroll, saída, erros e o vendid quando
                  ele estiver exposto na URL, página ou armazenamento do navegador. O Connect Rate é
                  calculado pela página carregada dividida pelos compradores da etapa anterior.
                </p>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.08]">
                <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-white/80">vendaId e jornadas</p>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reconcileUpsellIdentities.isPending}
                        onClick={() => reconcileUpsellIdentities.mutate()}
                      >
                        {reconcileUpsellIdentities.isPending ? 'Reconciliando…' : 'Recuperar vendaId dos webhooks'}
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/40">
                    Compradores da Vendepay Iago com front aprovado e vendaId confirmado pelo gateway.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {([
                      ['all', 'Todos'],
                      ['front_only', 'Somente front'],
                      ['with_upsell', 'Comprou upsell'],
                    ] as const).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={upsellBuyerFilter === value ? 'default' : 'outline'}
                        onClick={() => setUpsellBuyerFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-white/40">
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-3 font-medium">vendaId</th>
                        <th className="px-4 py-3 font-medium">Compra aprovada</th>
                        <th className="px-4 py-3 font-medium">Origem</th>
                        <th className="px-4 py-3 font-medium">Abrir upsell</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUpsellIdentities.map((identity) => (
                        <tr key={identity.id} className="border-b border-white/[0.05] last:border-0">
                          <td className="px-4 py-3">
                            <code className="select-all text-cyan-100">{identity.vendid}</code>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-white/55">
                            {new Date(identity.approved_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-cyan-100">
                              {identity.connection_name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {identity.links.map((link) => (
                                <ValidatedUpsellLink key={link.stage_id} link={link} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!upsellIdentities.isLoading && !filteredUpsellIdentities.length && (
                  <p className="px-4 py-5 text-sm text-white/40">
                    Nenhum comprador encontrado neste filtro.
                  </p>
                )}
              </div>
            </Module>
          )}
          {section === 'attribution' && (
            <TrackingLiveConsole
              offerId={offerId}
              mode="attribution"
              from={trackingFrom}
              to={trackingTo}
            />
          )}
          {section === 'refunds' && (
            <Module
              title="Reembolsos e chargeback"
              description="Pedidos com status reembolsado ou chargeback no período selecionado, pela data em que o status mudou — não pela data da compra original."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-4">
                  <p className="hud-label text-amber-200/80">Reembolsos</p>
                  <p className="mono-num mt-2 text-2xl text-white">
                    {formatMoney(refunds.data?.totals.refunded_revenue_brl_minor, 'BRL')}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {refunds.data?.totals.refunded_orders ?? 0} pedido(s)
                  </p>
                </div>
                <div className="rounded-lg border border-red-300/15 bg-red-300/[0.04] p-4">
                  <p className="hud-label text-red-200/80">Chargeback</p>
                  <p className="mono-num mt-2 text-2xl text-white">
                    {formatMoney(refunds.data?.totals.chargeback_revenue_brl_minor, 'BRL')}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {refunds.data?.totals.chargeback_orders ?? 0} pedido(s)
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-2">
                {(refunds.data?.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                  >
                    <div>
                      <p className="font-mono text-white/70">{item.external_id}</p>
                      <p className="mt-1 text-white/40">
                        {item.buyer?.name ?? item.buyer?.email ?? 'comprador não identificado'} ·{' '}
                        {item.order_kind} ·{' '}
                        {new Date(item.updated_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={item.status === 'chargeback' ? 'text-red-300' : 'text-amber-300'}
                      >
                        {item.status === 'chargeback' ? 'chargeback' : 'reembolsado'}
                      </span>
                      <span className="mono-num text-white/80">
                        {formatMoney(item.amount_brl_minor ?? undefined, 'BRL')}
                      </span>
                    </div>
                  </div>
                ))}
                {!refunds.data?.items?.length && (
                  <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                    Nenhum reembolso ou chargeback neste dia.
                  </p>
                )}
              </div>
            </Module>
          )}
          {(section === 'pixels' || section === 'code') && (
            <TrackingPanel offerId={offerId} canManage={canManage} />
          )}
          {section === 'help' && <TrackingHelp />}
          {section === 'domains' && (
            <Module
              title="Domínios"
              description="Cadastre os domínios que recebem o código. Subdomínios passam a ser identificados pelos eventos."
            >
              {canManage && (
                <div className="grid gap-2 md:grid-cols-[190px_minmax(0,1fr)_auto]">
                  <select
                    aria-label="Tipo de domínio"
                    value={domainKind}
                    onChange={(event) => setDomainKind(event.target.value as typeof domainKind)}
                    className="h-11 rounded-lg border border-cyan-100/[0.14] bg-[#091a24] px-3 text-sm text-white"
                  >
                    <option value="source">Domínio do funil</option>
                    <option value="tracking">Tracking first-party</option>
                  </select>
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder={
                      domainKind === 'tracking' ? 'suaempresa.com' : 'checkout.suaoferta.com'
                    }
                  />
                  <Button
                    disabled={!domain.trim() || addDomain.isPending}
                    onClick={() => addDomain.mutate()}
                  >
                    Adicionar
                  </Button>
                </div>
              )}
              {domainKind === 'tracking' && (
                <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-xs leading-5 text-white/65">
                  <div className="mb-3 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2">
                    <span className="text-white/45">Domínio que será criado: </span>
                    <code className="font-medium text-emerald-200">
                      {trackingDomainPreview(domain) ?? 'tmx.suaempresa.com'}
                    </code>
                  </div>
                  <p className="font-medium text-cyan-100">Configuração no Cloudflare</p>
                  <ol className="mt-2 space-y-1.5">
                    <li>1. Abra o domínio no Cloudflare e entre em DNS → Registros.</li>
                    <li>2. Adicione cada registro exibido abaixo usando os botões de copiar.</li>
                    <li>
                      3. No CNAME, deixe <strong className="text-white">Proxy desativado</strong>{' '}
                      (nuvem cinza / Somente DNS) e TTL em Automático.
                    </li>
                    <li>
                      4. No TXT, use exatamente o Nome e o Conteúdo mostrados, com TTL Automático.
                    </li>
                    <li>
                      5. Salve, aguarde a propagação e clique em{' '}
                      <strong className="text-white">Verificar</strong>.
                    </li>
                  </ol>
                  <p className="mt-2 text-amber-100/70">
                    O TMX sempre usará o subdomínio tmx, como tmx.suaempresa.com. Não crie A/AAAA
                    para ele e não altere o DNS da landing page ou do checkout.
                  </p>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {advanced.data?.domains?.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-white/80">{item.hostname}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {item.status === 'live'
                          ? 'O TMX recebeu eventos deste domínio.'
                          : item.last_error || 'Instale o script e abra a página para confirmar.'}
                      </p>
                      {item.kind === 'tracking' && item.dns_target && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] uppercase tracking-wider text-white/35">
                              Registros para criar
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const records = item.dns_records?.length
                                  ? item.dns_records
                                  : [{ hostlabel: item.hostname, requiredValue: item.dns_target! }];
                                void copyDnsValue(
                                  records
                                    .map((record) => {
                                      const type = record.requiredValue.includes('verify')
                                        ? 'TXT'
                                        : 'CNAME';
                                      return `${type}\t${record.hostlabel}\t${record.requiredValue}`;
                                    })
                                    .join('\n'),
                                  'Configuração completa',
                                );
                              }}
                              className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-cyan-200/65 transition hover:bg-white/[0.05] hover:text-cyan-200"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copiar tudo
                            </button>
                          </div>
                          {(item.dns_records?.length
                            ? item.dns_records
                            : [{ hostlabel: item.hostname, requiredValue: item.dns_target }]
                          ).map((record) => {
                            const type = record.requiredValue.includes('verify') ? 'TXT' : 'CNAME';
                            return (
                              <div
                                key={`${record.hostlabel}-${record.requiredValue}`}
                                className="rounded-lg border border-white/[0.07] bg-black/15 p-3"
                              >
                                <div className="grid gap-2 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1.4fr)]">
                                  {[
                                    { label: 'Tipo', value: type },
                                    { label: 'Nome', value: record.hostlabel },
                                    {
                                      label: type === 'TXT' ? 'Conteúdo' : 'Destino',
                                      value: record.requiredValue,
                                    },
                                  ].map((field) => (
                                    <div key={field.label} className="min-w-0">
                                      <p className="font-mono text-[9px] uppercase tracking-wider text-white/35">
                                        {field.label}
                                      </p>
                                      <div className="mt-1 flex items-center gap-1">
                                        <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-cyan-100/75">
                                          {field.value}
                                        </code>
                                        <button
                                          type="button"
                                          aria-label={`Copiar ${field.label}`}
                                          onClick={() => copyDnsValue(field.value, field.label)}
                                          className="rounded p-1.5 text-white/35 transition hover:bg-white/[0.06] hover:text-cyan-200"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {type === 'CNAME' && (
                                  <p className="mt-2 text-[10px] text-amber-100/60">
                                    Cloudflare: Proxy desativado (Somente DNS) · TTL Automático
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={item.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}
                      >
                        {item.status === 'live'
                          ? 'ao vivo'
                          : item.status === 'dns_verified'
                            ? 'DNS confirmado'
                            : item.kind === 'tracking'
                              ? 'aguardando DNS'
                              : 'aguardando evento'}
                      </span>
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={verifyDomain.isPending}
                            onClick={() => verifyDomain.mutate(item.id)}
                          >
                            Verificar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={removeDomain.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remover ${item.hostname} desta configuração de tracking?`,
                                )
                              )
                                removeDomain.mutate(item.id);
                            }}
                          >
                            Remover
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!advanced.data?.domains?.length && (
                  <p className="rounded-xl border border-dashed border-white/[0.1] p-4 text-sm text-white/50">
                    Nenhum domínio cadastrado. Adicione o domínio sem protocolo ou caminho, por
                    exemplo <code className="text-cyan-200">checkout.suaempresa.com</code>.
                  </p>
                )}
              </div>
            </Module>
          )}
          {section === 'gateways' && (
            <Module
              title="Gateways"
              description="A Vendepay usa o parâmetro src. Conexões podem ser pausadas e o token secreto pode ser rotacionado."
            >
              <div className="space-y-2">
                {vendepayConnections.map((connection) => (
                  <button
                    key={connection.id}
                    type="button"
                    onClick={() => {
                      setSelectedVendepayConnectionId(connection.id);
                      setVendepayWebhook('');
                      setVendepaySigningSecret('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded border p-4 text-left transition-colors',
                      selectedVendepayConnectionId === connection.id
                        ? 'border-cyan-300/35 bg-cyan-300/[0.06]'
                        : 'border-white/[0.07] hover:border-white/[0.14]',
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-white/80">{connection.name}</p>
                      <p className="mt-1 font-mono text-xs text-cyan-200/60">
                        Vendepay · atribuição: {connection.propagation_param}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xs',
                        connection.enabled ? 'text-emerald-300' : 'text-white/35',
                      )}
                    >
                      {connection.enabled ? 'ativo' : 'pausado'}
                    </span>
                  </button>
                ))}
                {canManage && config.data?.configured && (
                  <div className="flex flex-col gap-2 rounded border border-dashed border-cyan-300/20 p-3 sm:flex-row">
                    <Input
                      aria-label="Nome da nova conta Vendepay"
                      placeholder="Ex.: Vendepay Brasil · Conta 02"
                      value={vendepayConnectionName}
                      onChange={(event) => setVendepayConnectionName(event.target.value)}
                    />
                    <Button
                      className="gap-2"
                      disabled={
                        vendepayConnectionName.trim().length < 2 ||
                        createVendepayConnection.isPending
                      }
                      onClick={() => createVendepayConnection.mutate()}
                    >
                      <Plus className="h-4 w-4" />
                      {createVendepayConnection.isPending ? 'Adicionando…' : 'Adicionar conta'}
                    </Button>
                  </div>
                )}
              </div>
              {canManage && config.data?.configured && (
                <div className="mt-5 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-4">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">
                      1. Identificação da conta
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        aria-label="Nome da conta Vendepay selecionada"
                        placeholder="Ex.: Vendepay Iago"
                        value={selectedVendepayConnectionName}
                        disabled={!selectedVendepayConnection}
                        onChange={(event) => setSelectedVendepayConnectionName(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={
                          !selectedVendepayConnection ||
                          selectedVendepayConnectionName.trim().length < 2 ||
                          selectedVendepayConnectionName.trim() === selectedVendepayConnection.name ||
                          renameVendepayConnection.isPending
                        }
                        onClick={() => renameVendepayConnection.mutate()}
                      >
                        {renameVendepayConnection.isPending ? 'Salvando…' : 'Salvar nome'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-amber-100">
                        Webhook · {selectedVendepayConnection?.name ?? 'selecione uma conta'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-white/45">
                        Cada conta possui uma URL exclusiva. Rotacionar afeta somente a selecionada.
                      </p>
                    </div>
                    {selectedVendepayConnection && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggleVendepayConnection.isPending}
                        onClick={() => toggleVendepayConnection.mutate(selectedVendepayConnection)}
                      >
                        {selectedVendepayConnection.enabled ? 'Pausar conta' : 'Ativar conta'}
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Por segurança, o token só aparece ao criar ou gerar novamente a URL.
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={!selectedVendepayConnection || rotateVendepay.isPending}
                    onClick={() => rotateVendepay.mutate()}
                  >
                    {rotateVendepay.isPending ? 'Gerando…' : 'Gerar URL real do webhook'}
                  </Button>
                  {vendepayWebhook && (
                    <div className="mt-3 flex gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded bg-black/25 p-3 text-xs text-cyan-100">
                        {vendepayWebhook}
                      </code>
                      <Button onClick={copyVendepayWebhook}>Copiar</Button>
                    </div>
                  )}
                </div>
              )}
              {canManage && config.data?.configured && (
                <div className="mt-5 rounded-md border border-cyan-300/30 bg-cyan-300/[0.06] p-4 shadow-[0_0_28px_rgba(34,211,238,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">
                    2. Secret de assinatura
                  </p>
                  <p className="mt-2 text-sm font-medium text-cyan-100">
                    Cole o secret da {selectedVendepayConnection?.name ?? 'conta selecionada'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    É a chave exibida pela Vendepay ao cadastrar o webhook. O TMX a salva
                    criptografada e, depois disso, ela não volta ao navegador.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Secret de assinatura da Vendepay"
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        selectedVendepayConnection?.signing_secret_configured
                          ? '•••••••••••••••••••••••• (configurado)'
                          : 'Cole o secret exibido pela Vendepay'
                      }
                      value={vendepaySigningSecret}
                      onChange={(event) => setVendepaySigningSecret(event.target.value)}
                    />
                    <Button
                      disabled={
                        vendepaySigningSecret.trim().length < 16 ||
                        !selectedVendepayConnection ||
                        saveVendepaySigningSecret.isPending
                      }
                      onClick={() => saveVendepaySigningSecret.mutate()}
                    >
                      {saveVendepaySigningSecret.isPending
                        ? 'Salvando…'
                        : selectedVendepayConnection?.signing_secret_configured
                          ? 'Substituir secret'
                          : 'Salvar secret'}
                    </Button>
                  </div>
                  {selectedVendepayConnection?.signing_secret_configured && (
                    <p className="mt-2 text-xs text-emerald-300">
                      ✓ Secret configurado com segurança
                    </p>
                  )}
                </div>
              )}
              {canManage && config.data?.configured && (
                <div className="mt-5 rounded-md border border-white/[0.08] p-4">
                  <p className="text-sm font-medium text-white/80">Homologar payload da Vendepay</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Cole um exemplo recebido da Vendepay. O teste apenas normaliza os campos: não
                    cria pedido, não envia ao Meta e não envia à UTMify.
                  </p>
                  <textarea
                    aria-label="Payload JSON da Vendepay"
                    className="mt-3 min-h-72 w-full rounded-md border border-white/[0.1] bg-black/25 p-3 font-mono text-xs leading-5 text-cyan-50 outline-none focus:border-cyan-300/40"
                    value={vendepayPayload}
                    onChange={(event) => setVendepayPayload(event.target.value)}
                    spellCheck={false}
                  />
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={previewVendepay.isPending}
                    onClick={() => previewVendepay.mutate()}
                  >
                    {previewVendepay.isPending ? 'Validando…' : 'Validar sem criar venda'}
                  </Button>
                  {previewVendepay.data && (
                    <div
                      className={cn(
                        'mt-3 rounded border p-3 text-xs',
                        previewVendepay.data.processable
                          ? 'border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100'
                          : 'border-red-300/20 bg-red-300/[0.05] text-red-100',
                      )}
                    >
                      <p className="font-medium">
                        {previewVendepay.data.processable
                          ? 'Payload reconhecido'
                          : 'Payload precisa de ajuste'}
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-white/55">
                        {JSON.stringify(
                          previewVendepay.data.normalized ??
                            previewVendepay.data.diagnostics ?? ['Formato não reconhecido'],
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6">
                <p className="hud-label">Últimos webhooks da Vendepay</p>
                <div className="mt-3 space-y-2">
                  {(vendepayReceipts.data?.receipts ?? []).slice(0, 20).map((receipt) => (
                    <div
                      key={receipt.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                    >
                      <div>
                        <p className="font-mono text-white/70">
                          {receipt.transaction_id ?? 'Sem transação reconhecida'}
                        </p>
                        <p className="mt-1 text-cyan-200/60">{receipt.connection_name}</p>
                        <p className="mt-1 text-white/35">
                          {new Date(receipt.received_at).toLocaleString('pt-BR')}
                          {receipt.payment_method ? ` · ${receipt.payment_method}` : ''}
                        </p>
                      </div>
                      <span
                        className={
                          receipt.state === 'processed' || receipt.state === 'duplicate'
                            ? 'text-emerald-300'
                            : receipt.state === 'quarantined'
                              ? 'text-red-300'
                              : 'text-amber-300'
                        }
                      >
                        {receipt.state}
                      </span>
                    </div>
                  ))}
                  {!vendepayReceipts.data?.receipts?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      Nenhum webhook recebido ainda. Depois de configurar a URL na Vendepay, os
                      recebimentos aparecerão aqui.
                    </p>
                  )}
                </div>
              </div>
            </Module>
          )}
          {section === 'meta' && (
            <Module
              title="Envio ao Meta"
              description="Audite cada IC e venda enviados pela Conversions API, incluindo a confirmação real da Meta e os sinais usados na atribuição."
            >
              <label className="flex items-center gap-3 text-sm text-white/65">
                <input
                  type="checkbox"
                  checked={attributedOnly}
                  onChange={(e) => setAttributedOnly(e.target.checked)}
                />{' '}
                Enviar somente vendas atribuídas ao funil
              </label>
              <label htmlFor="tracking-meta-minimum" className="mt-4 block text-xs text-white/45">
                Valor mínimo da compra (R$)
              </label>
              <Input
                id="tracking-meta-minimum"
                className="mt-2 max-w-xs"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                inputMode="decimal"
              />
              {canManage && (
                <Button className="mt-4" onClick={() => saveRules.mutate()}>
                  Salvar regras
                </Button>
              )}
              <div className="mt-7 border-t border-white/[0.07] pt-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="hud-label">Confirmações da Conversions API</p>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-white/40">
                      “Confirmado” exige <span className="font-mono">events_received ≥ 1</span>.
                      Para atribuir o evento à campanha, o IC real deve carregar principalmente fbc
                      ou fbclid, além do identificador do navegador fbp.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reconcileMetaPurchases.isPending}
                        onClick={() => reconcileMetaPurchases.mutate()}
                      >
                        <Send className="mr-2 h-3.5 w-3.5" />
                        Reconciliar compras
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={metaDeliveries.isFetching}
                      onClick={() => void metaDeliveries.refetch()}
                    >
                      <RefreshCw
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          metaDeliveries.isFetching && 'animate-spin',
                        )}
                      />
                      Atualizar entregas
                    </Button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(metaDeliveries.data?.deliveries ?? []).slice(0, 30).map((delivery) => {
                    const confirmed =
                      delivery.state === 'delivered' && delivery.provider_event_count > 0;
                    return (
                      <div
                        key={delivery.id}
                        className="rounded border border-white/[0.07] bg-black/10 p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-white/70">
                              {delivery.event_name} · {delivery.event_id}
                            </p>
                            <p className="mt-1 text-white/35">
                              Pixel {delivery.pixel_id} · {delivery.attempts} tentativa(s)
                              {delivery.response_status
                                ? ` · HTTP ${delivery.response_status}`
                                : ''}
                            </p>
                          </div>
                          <span
                            className={
                              confirmed
                                ? 'text-emerald-300'
                                : delivery.state === 'failed'
                                  ? 'text-red-300'
                                  : 'text-amber-300'
                            }
                          >
                            {confirmed
                              ? `${delivery.provider_event_count} confirmado(s)`
                              : delivery.state}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            ['fbclid', delivery.has_fbclid],
                            ['fbc', delivery.has_fbc],
                            ['fbp', delivery.has_fbp],
                            ['campanha', Boolean(delivery.campaign_id)],
                            ['conjunto', Boolean(delivery.adset_id)],
                            ['anúncio', Boolean(delivery.ad_id)],
                          ].map(([label, available]) => (
                            <span
                              key={String(label)}
                              className={cn(
                                'rounded-full border px-2 py-1 font-mono text-[10px]',
                                available
                                  ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-200'
                                  : 'border-red-300/15 bg-red-300/[0.04] text-red-200/65',
                              )}
                            >
                              {available ? '✓' : '×'} {label}
                            </span>
                          ))}
                        </div>
                        {delivery.event_url && (
                          <p className="mt-2 truncate font-mono text-[10px] text-white/25">
                            {delivery.event_url}
                          </p>
                        )}
                        {delivery.last_error && (
                          <p className="mt-2 break-words text-red-200/75">{delivery.last_error}</p>
                        )}
                      </div>
                    );
                  })}
                  {!metaDeliveries.data?.deliveries?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      Nenhuma entrega Meta registrada.
                    </p>
                  )}
                </div>
              </div>
            </Module>
          )}
          {section === 'utmify' && (
            <Module
              title="Envio à UTMify"
              description="Envia ICs ao Pixel UTMify e replica mudanças dos pedidos na API de vendas, com filas auditáveis separadas."
            >
              <div className="mb-5 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <p className="text-sm font-medium text-cyan-100">Pixel UTMify para PageView e IC</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Use o ID de 24 caracteres exibido em UTMify → Integrações → Pixel. Não use o ID
                  numérico do Pixel Meta.
                </p>
                <p className="mt-2 font-mono text-xs text-white/65">
                  Atual: {utmifyPixel.data?.pixel_id ?? 'não configurado'}
                </p>
                {canManage && (
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <Input
                      value={utmifyPixelId}
                      onChange={(event) => setUtmifyPixelId(event.target.value)}
                      placeholder="Ex.: 6a698a76093cf4ea09039541"
                      maxLength={24}
                    />
                    <Button
                      disabled={
                        !/^[a-f0-9]{24}$/i.test(utmifyPixelId.trim()) || saveUtmifyPixel.isPending
                      }
                      onClick={() => saveUtmifyPixel.mutate()}
                    >
                      Salvar Pixel UTMify
                    </Button>
                  </div>
                )}
              </div>
              <div className="mb-5 flex items-center justify-between rounded border border-white/[0.07] p-4">
                <div>
                  <p className="text-sm text-white/75">Destino de vendas</p>
                  <p className="mt-1 text-xs text-white/40">
                    {utmify.data?.configured
                      ? `Ativo · ${utmify.data.destination?.endpoint_url}`
                      : 'Ainda não configurado'}
                  </p>
                </div>
                <span
                  className={
                    utmify.data?.destination?.enabled ? 'text-emerald-300' : 'text-amber-300'
                  }
                >
                  {utmify.data?.destination?.enabled ? 'operacional' : 'aguardando token'}
                </span>
              </div>
              {canManage && (
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input
                    value={utmifyToken}
                    onChange={(event) => setUtmifyToken(event.target.value)}
                    type="password"
                    autoComplete="off"
                    placeholder="Token de API da UTMify"
                  />
                  <Button
                    disabled={utmifyToken.trim().length < 16 || saveUtmify.isPending}
                    onClick={() => saveUtmify.mutate()}
                  >
                    {utmify.data?.configured ? 'Atualizar conexão' : 'Conectar UTMify'}
                  </Button>
                  <Input
                    className="md:col-span-2"
                    value={utmifyEndpoint}
                    onChange={(event) => setUtmifyEndpoint(event.target.value)}
                    placeholder="Endpoint da API de vendas"
                  />
                  <div className="md:col-span-2 rounded border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                    <p className="text-sm font-medium text-cyan-100">Testar checkout pendente</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">
                      Envia um pedido de R$ 1,00 com status waiting_payment e isTest=true. Ele
                      valida a conexão sem registrar uma venda aprovada.
                    </p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={!utmify.data?.destination?.enabled || testUtmifyCheckout.isPending}
                      onClick={() => testUtmifyCheckout.mutate()}
                    >
                      {testUtmifyCheckout.isPending
                        ? 'Enviando checkout de teste...'
                        : 'Enviar checkout de teste'}
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-6">
                <p className="hud-label">Entregas de InitiateCheckout ao Pixel UTMify</p>
                <div className="mt-3 space-y-2">
                  {(utmifyWebEvents.data?.deliveries ?? []).slice(0, 20).map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                    >
                      <div>
                        <p className="font-mono text-white/70">{delivery.event_id}</p>
                        <p className="mt-1 text-white/35">
                          Pixel {delivery.pixel_id} · {delivery.attempts} tentativa(s)
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-white/30">
                          {delivery.campaign_id ?? 'sem campanha'} ·{' '}
                          {delivery.ad_id ?? 'sem anúncio'} ·{' '}
                          {delivery.placement ?? 'sem posicionamento'}
                        </p>
                        {delivery.utmify_event_id && (
                          <p className="mt-1 font-mono text-[10px] text-emerald-200/45">
                            Recibo UTMify: {delivery.utmify_event_id}
                          </p>
                        )}
                        {delivery.last_error && (
                          <p className="mt-1 max-w-2xl break-words text-red-200/70">
                            {delivery.last_error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            delivery.state === 'delivered'
                              ? 'text-emerald-300'
                              : delivery.state === 'failed' || delivery.state === 'dead'
                                ? 'text-red-300'
                                : 'text-amber-300'
                          }
                        >
                          {delivery.state}
                        </span>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retryUtmifyWebEvent.isPending}
                            onClick={() => retryUtmifyWebEvent.mutate(delivery.id)}
                          >
                            Reenviar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!utmifyWebEvents.data?.deliveries?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      Nenhum IC enviado neste dia.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6">
                <p className="hud-label">Últimas entregas de pedidos</p>
                <div className="mt-3 space-y-2">
                  {(utmifyDeliveries.data?.deliveries ?? []).slice(0, 20).map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                    >
                      <div>
                        <p className="font-mono text-white/70">{delivery.transaction_id}</p>
                        <p className="mt-1 text-white/35">
                          {delivery.event_type} · {delivery.attempts} tentativa(s)
                        </p>
                        {delivery.last_error && (
                          <p className="mt-1 max-w-2xl break-words text-red-200/70">
                            {delivery.last_error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            delivery.state === 'delivered'
                              ? 'text-emerald-300'
                              : delivery.state === 'failed' || delivery.state === 'dead'
                                ? 'text-red-300'
                                : 'text-amber-300'
                          }
                        >
                          {delivery.state}
                        </span>
                        {canManage &&
                          (delivery.state === 'failed' || delivery.state === 'dead') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryUtmify.mutate(delivery.id)}
                            >
                              Reenviar
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                  {!utmifyDeliveries.data?.deliveries?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      As entregas aparecerão aqui quando o primeiro pedido for recebido.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6">
                <p className="hud-label">Produtos: front ou upsell?</p>
                <p className="mt-1 max-w-2xl text-xs text-white/45">
                  Cada produto da Vendepay precisa ser marcado como venda front (novo comprador) ou
                  upsell (compra adicional do mesmo comprador). Sem isso o pedido fica &quot;não
                  mapeado&quot; e não entra corretamente nos números de front/upsell do resumo.
                </p>
                {(productKinds.data?.unmapped ?? []).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-amber-300/70">
                      Produtos vistos em pedidos mas ainda não classificados
                    </p>
                    {(productKinds.data?.unmapped ?? []).map((product) => (
                      <div
                        key={product.product_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300/15 bg-amber-300/[0.03] p-3 text-xs"
                      >
                        <div>
                          <p className="font-mono text-white/70">{product.product_id}</p>
                          <p className="mt-1 text-white/40">
                            {product.product_name ?? 'sem nome'} · {product.orders} pedido(s)
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <select
                              className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/80"
                              value={productKindSelection[product.product_id] ?? 'front'}
                              onChange={(event) =>
                                setProductKindSelection((prev) => ({
                                  ...prev,
                                  [product.product_id]: event.target.value as
                                    | 'front'
                                    | 'upsell'
                                    | 'upsell_2'
                                    | 'upsell_3',
                                }))
                              }
                            >
                              <option value="front">Front</option>
                              <option value="upsell">Upsell 1</option>
                              <option value="upsell_2">Upsell 2</option>
                              <option value="upsell_3">Upsell 3</option>
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saveProductKind.isPending}
                              onClick={() =>
                                saveProductKind.mutate({
                                  product_id: product.product_id,
                                  kind: productKindSelection[product.product_id] ?? 'front',
                                  label: product.product_name,
                                })
                              }
                            >
                              Classificar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-white/35">
                      Mapeamentos salvos
                    </p>
                    {canManage && (productKinds.data?.mapped ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recomputeProductKinds.isPending}
                          onClick={() => recomputeProductKinds.mutate()}
                        >
                          Reclassificar pedidos existentes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reconcileUtmifyUpsells.isPending}
                          onClick={() => reconcileUtmifyUpsells.mutate()}
                        >
                          Corrigir campanhas dos upsells
                        </Button>
                      </div>
                    )}
                  </div>
                  {(productKinds.data?.mapped ?? []).map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                    >
                      <div>
                        <p className="font-mono text-white/70">{mapping.product_id}</p>
                        {mapping.label && <p className="mt-1 text-white/40">{mapping.label}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            mapping.kind === 'front'
                              ? 'text-emerald-300'
                              : mapping.kind === 'upsell'
                                ? 'text-cyan-300'
                                : mapping.kind === 'upsell_2'
                                  ? 'text-amber-300'
                                  : 'text-fuchsia-300'
                          }
                        >
                          {mapping.kind === 'front'
                            ? 'Front'
                            : mapping.kind === 'upsell'
                              ? 'Upsell 1'
                              : mapping.kind === 'upsell_2'
                                ? 'Upsell 2'
                                : 'Upsell 3'}
                        </span>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={removeProductKind.isPending}
                            onClick={() => removeProductKind.mutate(mapping.product_id)}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!productKinds.data?.mapped?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      Nenhum produto classificado ainda.
                    </p>
                  )}
                </div>
              </div>
            </Module>
          )}
          {section === 'pushcut' && (
            <Module
              title="Notificações Pushcut"
              description="Receba uma notificação push no iPhone/iPad sempre que uma venda front ou upsell for aprovada. Cada destino é uma conta Pushcut (app) diferente — configure quantas precisar."
            >
              <div className="rounded border border-white/[0.07] bg-black/10 p-4 text-xs leading-5 text-white/50">
                No app Pushcut, crie uma notificação em{' '}
                <span className="font-mono">Notifications</span> (ex.: "Venda Aprovada") e outra pra
                upsell se quiser sons diferentes. Copie o <span className="font-mono">secret</span>{' '}
                da sua conta (aparece na URL do webhook,{' '}
                <span className="font-mono">api.pushcut.io/[secret]/notifications/...</span>) e o
                nome exato de cada notificação (ou o Reference ID, em Settings → Shortcuts).
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pushcut-name" className="block text-xs text-white/45">
                    Nome do destino (ex.: iPhone do Iago)
                  </label>
                  <Input
                    id="pushcut-name"
                    className="mt-2"
                    value={pushcutName}
                    onChange={(e) => setPushcutName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="pushcut-secret" className="block text-xs text-white/45">
                    Secret da conta Pushcut
                  </label>
                  <Input
                    id="pushcut-secret"
                    className="mt-2"
                    type="password"
                    value={pushcutSecret}
                    onChange={(e) => setPushcutSecret(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="pushcut-front" className="block text-xs text-white/45">
                    Nome da notificação · venda front
                  </label>
                  <Input
                    id="pushcut-front"
                    className="mt-2"
                    value={pushcutFrontNotification}
                    onChange={(e) => setPushcutFrontNotification(e.target.value)}
                    placeholder="Venda Aprovada"
                  />
                </div>
                <div>
                  <label htmlFor="pushcut-upsell" className="block text-xs text-white/45">
                    Nome da notificação · upsell (opcional)
                  </label>
                  <Input
                    id="pushcut-upsell"
                    className="mt-2"
                    value={pushcutUpsellNotification}
                    onChange={(e) => setPushcutUpsellNotification(e.target.value)}
                    placeholder="Deixe em branco pra não notificar upsell"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="pushcut-devices" className="block text-xs text-white/45">
                    Dispositivos específicos (opcional, separados por vírgula)
                  </label>
                  <Input
                    id="pushcut-devices"
                    className="mt-2"
                    value={pushcutDevices}
                    onChange={(e) => setPushcutDevices(e.target.value)}
                    placeholder="iPhone de Iago, iPad"
                  />
                </div>
              </div>
              {canManage && (
                <Button
                  className="mt-4"
                  disabled={
                    createPushcutDestination.isPending ||
                    !pushcutName ||
                    !pushcutSecret ||
                    !pushcutFrontNotification
                  }
                  onClick={() => createPushcutDestination.mutate()}
                >
                  Adicionar destino
                </Button>
              )}

              <div className="mt-7 border-t border-white/[0.07] pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="hud-label">Destinos configurados</p>
                  {canManage && (pushcutDestinations.data?.destinations?.length ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resendPushcutHistory.isPending}
                      onClick={() => resendPushcutHistory.mutate()}
                    >
                      Reenviar todas as compras já feitas
                    </Button>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {(pushcutDestinations.data?.destinations ?? []).map((destination) => (
                    <div
                      key={destination.id}
                      className="rounded border border-white/[0.07] bg-black/10 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-white/85">{destination.name}</p>
                          <p className="mt-1 text-white/40">
                            Front:{' '}
                            <span className="font-mono">{destination.front_notification_name}</span>
                            {destination.upsell_notification_name && (
                              <>
                                {' '}
                                · Upsell:{' '}
                                <span className="font-mono">
                                  {destination.upsell_notification_name}
                                </span>
                              </>
                            )}
                          </p>
                          {Array.isArray(destination.devices) && destination.devices.length > 0 && (
                            <p className="mt-1 text-white/30">
                              Dispositivos: {destination.devices.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={destination.enabled ? 'text-emerald-300' : 'text-white/30'}
                          >
                            {destination.enabled ? 'ativo' : 'desativado'}
                          </span>
                          {canManage && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={testPushcutDestination.isPending}
                                onClick={() => testPushcutDestination.mutate(destination.id)}
                              >
                                Testar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={togglePushcutDestination.isPending}
                                onClick={() =>
                                  togglePushcutDestination.mutate({
                                    destinationId: destination.id,
                                    enabled: !destination.enabled,
                                  })
                                }
                              >
                                {destination.enabled ? 'Desativar' : 'Ativar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={removePushcutDestination.isPending}
                                onClick={() => removePushcutDestination.mutate(destination.id)}
                              >
                                Remover
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {!pushcutDestinations.data?.destinations?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      Nenhum destino Pushcut configurado ainda.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-7 border-t border-white/[0.07] pt-6">
                <p className="hud-label">Últimas entregas</p>
                <div className="mt-3 space-y-2">
                  {(pushcutDeliveries.data?.deliveries ?? []).slice(0, 30).map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.07] p-3 text-xs"
                    >
                      <div>
                        <p className="font-mono text-white/70">{delivery.transaction_id}</p>
                        <p className="mt-1 text-white/35">
                          {delivery.destination_name ?? 'destino removido'} · {delivery.order_kind}{' '}
                          · {delivery.attempts} tentativa(s)
                          {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}
                        </p>
                        {delivery.last_error && (
                          <p className="mt-1 max-w-2xl break-words text-red-200/70">
                            {delivery.last_error}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={
                            delivery.state === 'delivered'
                              ? 'text-emerald-300'
                              : delivery.state === 'failed' || delivery.state === 'dead'
                                ? 'text-red-300'
                                : delivery.state === 'skipped'
                                  ? 'text-white/30'
                                  : 'text-amber-300'
                          }
                        >
                          {delivery.state}
                        </span>
                        {canManage &&
                          (delivery.state === 'failed' || delivery.state === 'dead') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryPushcutDelivery.mutate(delivery.id)}
                            >
                              Reenviar
                            </Button>
                          )}
                      </div>
                    </div>
                  ))}
                  {!pushcutDeliveries.data?.deliveries?.length && (
                    <p className="rounded border border-dashed border-white/[0.08] p-4 text-sm text-white/35">
                      As entregas aparecerão aqui quando o primeiro pedido pago chegar.
                    </p>
                  )}
                </div>
              </div>
            </Module>
          )}
          {section === 'fees' && (
            <Module
              title="Taxas e líquido"
              description="Configure as taxas cobradas pelo gateway pra calcular o faturamento líquido (bruto − reembolsos − chargebacks − taxas) exibido no Funil. Os valores já vêm preenchidos com as taxas do Mercado Global da Vendepay — ajuste se sua oferta usar outra tabela."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="fee-vendepay-pct" className="block text-xs text-white/45">
                    Taxa Vendepay (%)
                  </label>
                  <Input
                    id="fee-vendepay-pct"
                    className="mt-2"
                    inputMode="decimal"
                    value={feeVendepayPct}
                    onChange={(e) => setFeeVendepayPct(e.target.value)}
                    placeholder="9.9"
                  />
                </div>
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <div>
                    <label htmlFor="fee-extra-amount" className="block text-xs text-white/45">
                      Taxa extra (por venda)
                    </label>
                    <Input
                      id="fee-extra-amount"
                      className="mt-2"
                      inputMode="decimal"
                      value={feeExtraAmount}
                      onChange={(e) => setFeeExtraAmount(e.target.value)}
                      placeholder="1.49"
                    />
                  </div>
                  <div>
                    <label htmlFor="fee-extra-currency" className="block text-xs text-white/45">
                      Moeda
                    </label>
                    <Input
                      id="fee-extra-currency"
                      className="mt-2 uppercase"
                      maxLength={3}
                      value={feeExtraCurrency}
                      onChange={(e) => setFeeExtraCurrency(e.target.value.toUpperCase())}
                      placeholder="USD"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="fee-reserve-pct" className="block text-xs text-white/45">
                    Reserva (%)
                  </label>
                  <Input
                    id="fee-reserve-pct"
                    className="mt-2"
                    inputMode="decimal"
                    value={feeReservePct}
                    onChange={(e) => setFeeReservePct(e.target.value)}
                    placeholder="6.9"
                  />
                </div>
                <div>
                  <label htmlFor="fee-reserve-days" className="block text-xs text-white/45">
                    Tempo de reserva (dias)
                  </label>
                  <Input
                    id="fee-reserve-days"
                    className="mt-2"
                    inputMode="numeric"
                    value={feeReserveDays}
                    onChange={(e) => setFeeReserveDays(e.target.value)}
                    placeholder="90"
                  />
                </div>
                <div>
                  <label htmlFor="fee-payout-days" className="block text-xs text-white/45">
                    Recebe em (dias)
                  </label>
                  <Input
                    id="fee-payout-days"
                    className="mt-2"
                    inputMode="numeric"
                    value={feePayoutDays}
                    onChange={(e) => setFeePayoutDays(e.target.value)}
                    placeholder="5"
                  />
                </div>
              </div>
              {canManage && (
                <Button
                  className="mt-4"
                  disabled={saveFeeSettings.isPending}
                  onClick={() => saveFeeSettings.mutate()}
                >
                  Salvar taxas
                </Button>
              )}
              {feeSettings.data && !feeSettings.data.configured && (
                <p className="mt-4 rounded border border-dashed border-white/[0.08] p-3 text-xs text-white/40">
                  Ainda usando os valores padrão do Mercado Global. Salve pra fixar essa
                  configuração nesta oferta.
                </p>
              )}
            </Module>
          )}
          {section === 'ab' && (
            <Module
              title="Links e testes A/B"
              description="Mede a conexão entre o clique do anúncio e o carregamento real, além de dividir o tráfego entre variantes."
            >
              <div className="mb-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-4">
                <p className="hud-label text-emerald-200">Connect Rate · 100% TMX</p>
                <h3 className="mt-2 text-base font-semibold text-white">
                  Link de entrada do anúncio
                </h3>
                <p className="mt-2 text-xs leading-5 text-white/55">
                  Use este link como destino no anúncio. O TMX registra o clique antes do
                  redirecionamento, preserva todos os parâmetros e confirma a conexão quando o
                  script envia o PageView.
                </p>
                {canManage && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Input
                      value={entryLinkName}
                      onChange={(event) => setEntryLinkName(event.target.value)}
                      placeholder="Nome, ex.: Entrada PJR"
                    />
                    <Input
                      value={entryDestination}
                      onChange={(event) => setEntryDestination(event.target.value)}
                      placeholder="URL final da landing page"
                    />
                    <Button
                      className="md:col-span-2"
                      disabled={
                        entryLinkName.trim().length < 2 ||
                        !entryDestination.startsWith('http') ||
                        createEntryLink.isPending
                      }
                      onClick={() => createEntryLink.mutate()}
                    >
                      Criar link de entrada
                    </Button>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  {(advanced.data?.entry_links ?? []).map((link) => (
                    <div
                      key={link.id}
                      className="rounded-xl border border-white/[0.08] bg-black/10 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white/85">{link.name}</p>
                          <p className="mt-1 truncate text-xs text-white/40">
                            Destino: {link.destination_url}
                          </p>
                        </div>
                        <span className="text-xs text-emerald-300">
                          {link.ab_test_id ? 'Teste A/B ativo' : 'Destino único'}
                        </span>
                      </div>
                      {editingEntryLinkId === link.id && (
                        <div className="mt-3 grid gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.03] p-3 md:grid-cols-2">
                          <Input
                            value={editingEntryLinkName}
                            onChange={(event) => setEditingEntryLinkName(event.target.value)}
                            placeholder="Nome do link"
                          />
                          <Input
                            value={editingEntryDestination}
                            onChange={(event) => setEditingEntryDestination(event.target.value)}
                            placeholder="Novo destino"
                          />
                          <div className="flex gap-2 md:col-span-2">
                            <Button
                              size="sm"
                              disabled={
                                editingEntryLinkName.trim().length < 2 ||
                                !editingEntryDestination.startsWith('http') ||
                                updateEntryLink.isPending
                              }
                              onClick={() => updateEntryLink.mutate()}
                            >
                              Salvar sem mudar a URL TMX
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingEntryLinkId('')}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                      {convertingEntryLinkId === link.id && (
                        <div className="mt-3 grid gap-2 rounded-lg border border-fuchsia-300/15 bg-fuchsia-300/[0.03] p-3 md:grid-cols-2">
                          <Input
                            className="md:col-span-2"
                            value={entryAbName}
                            onChange={(event) => setEntryAbName(event.target.value)}
                            placeholder="Nome do teste A/B"
                          />
                          <Input
                            value={entryAbDestinationA}
                            onChange={(event) => setEntryAbDestinationA(event.target.value)}
                            placeholder="Destino A"
                          />
                          <Input
                            value={entryAbDestinationB}
                            onChange={(event) => setEntryAbDestinationB(event.target.value)}
                            placeholder="Destino B"
                          />
                          <label className="text-xs text-white/60 md:col-span-2">
                            Tráfego do destino A: {entryAbTrafficA}%
                            <input
                              className="mt-2 w-full accent-fuchsia-300"
                              type="range"
                              min="10"
                              max="90"
                              step="5"
                              value={entryAbTrafficA}
                              onChange={(event) => setEntryAbTrafficA(event.target.value)}
                            />
                          </label>
                          <div className="flex gap-2 md:col-span-2">
                            <Button
                              size="sm"
                              disabled={
                                entryAbName.trim().length < 2 ||
                                !entryAbDestinationA.startsWith('http') ||
                                !entryAbDestinationB.startsWith('http') ||
                                convertEntryLinkToAb.isPending
                              }
                              onClick={() => convertEntryLinkToAb.mutate()}
                            >
                              Ativar A/B nesta mesma URL
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConvertingEntryLinkId('')}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                      <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-lg bg-black/20 p-3 text-xs text-cyan-100/75">
                        {link.tracking_url}
                      </code>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(link.tracking_url);
                            toast.success('Link de entrada copiado.');
                          }}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          Copiar para o anúncio
                        </Button>
                        {link.ab_test_id ? (
                          <>
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`${link.tracking_url}?tmx_preview=1&tmx_variant=A`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Testar variante A
                              </a>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`${link.tracking_url}?tmx_preview=1&tmx_variant=B`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Testar variante B
                              </a>
                            </Button>
                          </>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`${link.tracking_url}?tmx_preview=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Testar sem contabilizar
                            </a>
                          </Button>
                        )}
                        {canManage && !link.ab_test_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setConvertingEntryLinkId('');
                              setEditingEntryLinkId(link.id);
                              setEditingEntryLinkName(link.name);
                              setEditingEntryDestination(link.destination_url);
                            }}
                          >
                            Editar destino
                          </Button>
                        )}
                        {canManage && !link.ab_test_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingEntryLinkId('');
                              setConvertingEntryLinkId(link.id);
                              setEntryAbName(`${link.name} · A/B`);
                              setEntryAbDestinationA(link.destination_url);
                              setEntryAbDestinationB('');
                            }}
                          >
                            Transformar em teste A/B
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={removeEntryLink.isPending}
                            onClick={() => {
                              if (window.confirm(`Remover o link "${link.name}"?`)) {
                                removeEntryLink.mutate(link.id);
                              }
                            }}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {canManage && (
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    className="md:col-span-2"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="Nome do teste"
                  />
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as typeof kind)}
                    className="h-10 rounded-md border border-white/[0.1] bg-[#06131d] px-3 text-sm text-white"
                  >
                    <option value="checkout">No checkout</option>
                    <option value="presell">Na presell</option>
                  </select>
                  <label className="text-xs text-white/65">
                    Tráfego da variante A: {trafficA}%
                    <input
                      className="mt-3 w-full accent-cyan-300"
                      type="range"
                      min="10"
                      max="90"
                      step="5"
                      value={trafficA}
                      onChange={(event) => setTrafficA(event.target.value)}
                    />
                  </label>
                  <Input
                    value={armA}
                    onChange={(e) => setArmA(e.target.value)}
                    placeholder="Braço A"
                  />
                  <Input
                    value={armB}
                    onChange={(e) => setArmB(e.target.value)}
                    placeholder="Braço B"
                  />
                  <Input
                    value={destinationA}
                    onChange={(event) => setDestinationA(event.target.value)}
                    placeholder="URL de destino da variante A"
                  />
                  <Input
                    value={destinationB}
                    onChange={(event) => setDestinationB(event.target.value)}
                    placeholder="URL de destino da variante B"
                  />
                  <div className="md:col-span-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4 text-xs leading-5 text-white/65">
                    Cada visitante permanece na mesma variante. O TMX troca o destino dos botões de
                    checkout, preserva UTMs e <code className="text-cyan-200">src</code>, e mede
                    visitantes, checkouts, compras e receita.
                  </div>
                  <Button
                    className="md:col-span-2"
                    disabled={
                      !testName.trim() ||
                      !destinationA.startsWith('http') ||
                      !destinationB.startsWith('http') ||
                      createTest.isPending
                    }
                    onClick={() => createTest.mutate()}
                  >
                    Criar e ativar teste
                  </Button>
                </div>
              )}
              <div className="mt-5 space-y-2">
                {advanced.data?.ab_tests?.map((test) => (
                  <AbTestCard
                    key={test.id}
                    offerId={offerId}
                    test={test}
                    canManage={canManage}
                    onUpdated={refresh}
                  />
                ))}
              </div>
            </Module>
          )}
          {section === 'vturb' && (
            <Module
              title="Conversões vTurb"
              description="Central de reenvio de vendas para recuperar a atribuição da vTurb."
            >
              <div className="rounded border border-white/[0.07] p-4 text-sm text-white/55">
                Estado:{' '}
                <span className="text-amber-300">
                  {advanced.data?.vturb?.enabled ? 'enviando' : 'aguardando configuração'}
                </span>
                <p className="mt-2 text-xs text-white/35">
                  As vendas seguem o ciclo recebida → ID capturado → enviada, com tentativas
                  registradas.
                </p>
              </div>
            </Module>
          )}
        </div>
      </div>
    </div>
  );
}

function AbTestCard({
  offerId,
  test,
  canManage,
  onUpdated,
}: {
  offerId: string;
  test: {
    id: string;
    name: string;
    kind: 'checkout' | 'presell';
    status: string;
    traffic_a: number;
    redirect_url: string;
    winner_variant_id?: string;
    variants: Array<{
      id: string;
      label: string;
      destination_url?: string;
      position: number;
    }>;
  };
  canManage: boolean;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(test.name);
  const [editTrafficA, setEditTrafficA] = useState(String(test.traffic_a));
  const [editLabels, setEditLabels] = useState(test.variants.map((variant) => variant.label));
  const [editDestinations, setEditDestinations] = useState(
    test.variants.map((variant) => variant.destination_url ?? ''),
  );
  const metrics = useQuery({
    queryKey: ['tracking-ab-metrics', offerId, test.id],
    queryFn: () => apiClient.getTrackingAbTestMetrics(offerId, test.id),
    refetchInterval: test.status === 'active' ? 30_000 : false,
  });
  const control = useMutation({
    mutationFn: (
      body: { action: 'pause' | 'resume' } | { action: 'select_winner'; variant_id: string },
    ) => apiClient.controlTrackingAbTest(offerId, test.id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tracking-ab-metrics', offerId, test.id] });
      onUpdated();
      toast.success('Teste A/B atualizado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => apiClient.deleteTrackingAbTest(offerId, test.id),
    onSuccess: () => {
      onUpdated();
      toast.success('Teste A/B removido.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveConfiguration = useMutation({
    mutationFn: () =>
      apiClient.controlTrackingAbTest(offerId, test.id, {
        action: 'update_config',
        name: editName.trim(),
        traffic_a: Number(editTrafficA),
        variants: test.variants.map((variant, index) => ({
          id: variant.id,
          label: (editLabels[index] ?? '').trim(),
          destination_url: (editDestinations[index] ?? '').trim(),
        })),
      }),
    onSuccess: () => {
      setEditing(false);
      onUpdated();
      void qc.invalidateQueries({ queryKey: ['tracking-ab-metrics', offerId, test.id] });
      toast.success('Teste A/B editado. O link público e o histórico foram mantidos.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  return (
    <article className="rounded-2xl border border-cyan-100/[0.12] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            {test.kind} · {test.traffic_a}% / {100 - test.traffic_a}%
          </span>
          <p className="mt-1 text-base font-semibold text-white/90">{test.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={test.status === 'active' ? 'text-emerald-300' : 'text-white/55'}>
            {test.status === 'active' ? 'Em execução' : 'Pausado'}
          </span>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil className="h-3.5 w-3.5" /> {editing ? 'Cancelar' : 'Editar'}
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
          <p className="text-xs leading-5 text-cyan-100/70">
            O link TMX e as métricas existentes não mudam. Novos visitantes usarão a nova divisão;
            visitantes já atribuídos permanecem na variante original.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              aria-label="Nome do teste A/B"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Nome do teste"
            />
            <label className="text-xs text-white/55">
              Tráfego da variante A: {editTrafficA}%
              <input
                aria-label="Tráfego da variante A"
                className="mt-2 w-full accent-cyan-300"
                type="range"
                min="1"
                max="99"
                value={editTrafficA}
                onChange={(event) => setEditTrafficA(event.target.value)}
              />
            </label>
            {test.variants.map((variant, index) => (
              <div key={variant.id} className="space-y-2 rounded-lg border border-white/[0.07] p-3">
                <Input
                  aria-label={`Nome da variante ${index + 1}`}
                  value={editLabels[index] ?? ''}
                  onChange={(event) =>
                    setEditLabels((current) => current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ))
                  }
                  placeholder={`Variante ${index + 1}`}
                />
                <Input
                  aria-label={`URL da variante ${index + 1}`}
                  value={editDestinations[index] ?? ''}
                  onChange={(event) =>
                    setEditDestinations((current) => current.map((value, item) =>
                      item === index ? event.target.value : value,
                    ))
                  }
                  placeholder="https://..."
                />
              </div>
            ))}
          </div>
          <Button
            className="mt-3 w-full"
            disabled={
              saveConfiguration.isPending ||
              editName.trim().length < 2 ||
              editLabels.some((label) => !label.trim()) ||
              editDestinations.some((url) => !url.startsWith('http'))
            }
            onClick={() => saveConfiguration.mutate()}
          >
            {saveConfiguration.isPending ? 'Salvando alterações…' : 'Salvar alterações do teste A/B'}
          </Button>
        </div>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {test.variants.map((variant, index) => {
          const row = metrics.data?.variants.find((item) => item.id === variant.id);
          const visitors = Number(row?.visitors ?? 0);
          const paid = Number(row?.paid_orders ?? 0);
          const conversion = visitors ? (paid / visitors) * 100 : 0;
          return (
            <div
              key={variant.id}
              className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-white/85">{variant.label}</p>
                <span className="text-xs text-white/45">
                  {index === 0 ? test.traffic_a : 100 - test.traffic_a}% do tráfego
                </span>
              </div>
              <p className="mt-2 truncate font-mono text-[11px] text-cyan-100/55">
                {variant.destination_url ?? 'Destino não informado'}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-white/45">Visitantes</dt>
                  <dd className="mt-1 text-base font-semibold text-white">{visitors}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Acessos ao checkout</dt>
                  <dd className="mt-1 text-base font-semibold text-white">
                    {Number(row?.checkouts ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/45">Compras</dt>
                  <dd className="mt-1 text-base font-semibold text-emerald-300">{paid}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Conversão</dt>
                  <dd className="mt-1 text-base font-semibold text-cyan-200">
                    {conversion.toFixed(2)}%
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-white/45">Receita atribuída</dt>
                  <dd className="mt-1 text-base font-semibold text-emerald-300">
                    {(Number(row?.revenue_brl_minor ?? 0) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </dd>
                </div>
              </dl>
              {canManage && !test.winner_variant_id && (
                <Button
                  className="mt-4 w-full"
                  size="sm"
                  variant="outline"
                  disabled={control.isPending}
                  onClick={() =>
                    control.mutate({ action: 'select_winner', variant_id: variant.id })
                  }
                >
                  Definir como vencedora
                </Button>
              )}
              {test.winner_variant_id === variant.id && (
                <p className="mt-4 text-xs font-semibold text-emerald-300">Variante vencedora</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
          Link do TMX para o botão de checkout
        </p>
        <code className="mt-2 block overflow-x-auto whitespace-nowrap text-xs text-white/70">
          {test.redirect_url}
        </code>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(test.redirect_url);
              toast.success('Link do teste A/B copiado.');
            }}
          >
            Copiar link
          </Button>
          {test.variants.map((variant) => (
            <Button key={variant.id} asChild size="sm" variant="outline">
              <a
                href={`${test.redirect_url}?tmx_preview=1&tmx_variant=${encodeURIComponent(variant.label)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Testar variante {variant.label}
              </a>
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-white/50">
          Cole esse endereço no CTA. O TMX mantém a variante do visitante, registra o checkout,
          preserva UTMs, adiciona o <code className="text-cyan-200">src</code> e redireciona para a
          Vendepay.
        </p>
      </div>
      {canManage && !test.winner_variant_id && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={control.isPending}
            onClick={() =>
              control.mutate({ action: test.status === 'active' ? 'pause' : 'resume' })
            }
          >
            {test.status === 'active' ? 'Pausar teste' : 'Retomar teste'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Remover o teste A/B "${test.name}"?`)) remove.mutate();
            }}
          >
            Remover teste
          </Button>
        </div>
      )}
    </article>
  );
}

function Module({
  title,
  description,
  children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <p className="hud-label">Trackeamento avançado</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-white/50">{description}</p>
      {children}
    </section>
  );
}
