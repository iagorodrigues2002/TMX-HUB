'use client';

import { TrackingHelp } from '@/components/tracking/tracking-help';
import { TrackingLiveConsole } from '@/components/tracking/tracking-live-console';
import { TrackingPanel } from '@/components/tracking/tracking-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Braces,
  Cable,
  Copy,
  Facebook,
  FlaskConical,
  Globe2,
  HelpCircle,
  Megaphone,
  RadioTower,
  RefreshCw,
  Send,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
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

type Section =
  | 'tracker'
  | 'funnel'
  | 'attribution'
  | 'ab'
  | 'vturb'
  | 'pixels'
  | 'domains'
  | 'code'
  | 'gateways'
  | 'meta'
  | 'utmify'
  | 'help';

const sections: Array<{ id: Section; label: string; icon: LucideIcon; group: string }> = [
  { id: 'tracker', label: 'Tracker', icon: RadioTower, group: 'Operação' },
  { id: 'funnel', label: 'Funil', icon: BarChart3, group: 'Operação' },
  { id: 'attribution', label: 'Campanhas e anúncios', icon: Megaphone, group: 'Operação' },
  { id: 'ab', label: 'Testes A/B', icon: FlaskConical, group: 'Operação' },
  { id: 'vturb', label: 'Conversões vTurb', icon: Video, group: 'Operação' },
  { id: 'pixels', label: 'Pixels', icon: Facebook, group: 'Configuração' },
  { id: 'domains', label: 'Domínios', icon: Globe2, group: 'Configuração' },
  { id: 'code', label: 'Código', icon: Braces, group: 'Configuração' },
  { id: 'gateways', label: 'Gateways', icon: Cable, group: 'Configuração' },
  { id: 'meta', label: 'Envio ao Meta', icon: Send, group: 'Configuração' },
  { id: 'utmify', label: 'Envio à UTMify', icon: Cable, group: 'Configuração' },
  { id: 'help', label: 'Ajuda e testes', icon: HelpCircle, group: 'Configuração' },
];

export function TrackingAdvancedCenter({
  offerId,
  canManage,
}: { offerId: string; canManage: boolean }) {
  const [section, setSection] = useState<Section>('tracker');
  const [trackingDate, setTrackingDate] = useState(() => saoPauloDate());
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
  const [vendepayWebhook, setVendepayWebhook] = useState('');
  const [vendepaySigningSecret, setVendepaySigningSecret] = useState('');
  const [vendepayPayload, setVendepayPayload] = useState(vendepaySample);
  const [utmifyToken, setUtmifyToken] = useState('');
  const [utmifyEndpoint, setUtmifyEndpoint] = useState(
    'https://api.utmify.com.br/api-credentials/orders',
  );
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
        ].map((key) => qc.invalidateQueries({ queryKey: [key, offerId, trackingDate] })),
      );
      toast.success('Dados do dia atualizados.');
    } finally {
      setIsRefreshingTracking(false);
    }
  };
  const advanced = useQuery({
    queryKey: ['tracking-advanced', offerId],
    queryFn: () => apiClient.getAdvancedTracking(offerId),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
  const reconcileInitiateCheckouts = useMutation({
    mutationFn: () => apiClient.reconcileInitiateCheckouts(offerId, trackingDate),
    onSuccess: (result) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ['tracking-meta-deliveries', offerId] }),
        qc.invalidateQueries({ queryKey: ['tracking-utmify-deliveries', offerId] }),
      ]);
      toast.success(
        `${result.events_found} ICs conferidos · ${result.meta_queued} Meta reenfileirados · ${result.utmify_queued} ICs reenfileirados na UTMify.`,
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
    mutationFn: () =>
      apiClient.createTrackingAbTest(offerId, {
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
      }),
    onSuccess: () => {
      setTestName('');
      setDestinationA('');
      setDestinationB('');
      void refresh();
      toast.success('Teste A/B ativado.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
  });
  const utmify = useQuery({
    queryKey: ['tracking-utmify-destination', offerId],
    queryFn: () => apiClient.getTrackingUtmifyDestination(offerId),
    retry: false,
  });
  const utmifyDeliveries = useQuery({
    queryKey: ['tracking-utmify-deliveries', offerId],
    queryFn: () => apiClient.listTrackingUtmifyDeliveries(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const saveUtmify = useMutation({
    mutationFn: () =>
      apiClient.saveTrackingUtmifyDestination(offerId, {
        name: 'UTMify',
        api_token: utmifyToken,
        endpoint_url: utmifyEndpoint,
      }),
    onSuccess: () => {
      setUtmifyToken('');
      void qc.invalidateQueries({ queryKey: ['tracking-utmify-destination', offerId] });
      toast.success('Destino UTMify configurado.');
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
  const rotateVendepay = useMutation({
    mutationFn: () => apiClient.rotateVendepayWebhook(offerId),
    onSuccess: (result) => {
      setVendepayWebhook(result.vendepay_webhook_url);
      toast.success('URL real gerada. A URL anterior foi desativada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const saveVendepaySigningSecret = useMutation({
    mutationFn: () => apiClient.saveVendepaySigningSecret(offerId, vendepaySigningSecret),
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

  return (
    <div className="grid min-w-0 gap-5 2xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="h-fit min-w-0 rounded-lg border border-white/[0.08] bg-black/15 p-3 2xl:sticky 2xl:top-20">
        {['Operação', 'Configuração'].map((group) => (
          <div key={group} className="mb-4 last:mb-0">
            <p className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/30">
              {group}
            </p>
            {sections
              .filter((item) => item.group === group)
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={cn(
                    'mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-white/45 transition hover:bg-white/[0.04] hover:text-white/70',
                    section === id &&
                      'border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,.08)]',
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
          </div>
        ))}
      </aside>
      <div className="min-w-0">
        {(['tracker', 'funnel', 'attribution'] as Section[]).includes(section) && (
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/15 p-3">
            <div>
              <p className="hud-label">Período do trackeamento</p>
              <p className="mt-1 text-xs text-white/40">
                Dados históricos separados por dia · horário de São Paulo
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label htmlFor="tracking-date" className="space-y-1">
                <span className="hud-label block">Data</span>
                <Input
                  id="tracking-date"
                  type="date"
                  value={trackingDate}
                  max={saoPauloDate()}
                  onChange={(event) => setTrackingDate(event.target.value || saoPauloDate())}
                  className="h-9 w-[160px]"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                disabled={isRefreshingTracking}
                onClick={() => void refreshTracking()}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRefreshingTracking && 'animate-spin')} />
                Atualizar
              </Button>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2"
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
          <TrackingLiveConsole offerId={offerId} mode="tracker" date={trackingDate} />
        )}
        {section === 'funnel' && (
          <TrackingLiveConsole offerId={offerId} mode="funnel" date={trackingDate} />
        )}
        {section === 'attribution' && (
          <TrackingLiveConsole offerId={offerId} mode="attribution" date={trackingDate} />
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
                  O TMX sempre usará o subdomínio tmx, como tmx.suaempresa.com. Não crie A/AAAA para
                  ele e não altere o DNS da landing page ou do checkout.
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
              {(
                advanced.data?.gateways ?? [
                  { provider: 'vendepay', propagation_param: 'src', enabled: true },
                ]
              ).map((gateway, index) => (
                <div
                  key={`${gateway.provider}-${index}`}
                  className="flex items-center justify-between rounded border border-white/[0.07] p-4"
                >
                  <div>
                    <p className="capitalize text-white/75">{gateway.provider}</p>
                    <p className="mt-1 font-mono text-xs text-cyan-200/60">
                      atribuição: {gateway.propagation_param}
                    </p>
                  </div>
                  <span className="text-xs text-emerald-300">
                    {gateway.enabled ? 'ativo' : 'pausado'}
                  </span>
                </div>
              ))}
            </div>
            {canManage && config.data?.configured && (
              <div className="mt-5 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-4">
                <p className="text-sm font-medium text-amber-100">URL secreta da Vendepay</p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Por segurança, o token só aparece ao gerar a URL. Gerar novamente desativa o
                  webhook anterior.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled={rotateVendepay.isPending}
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
              <div className="mt-5 rounded-md border border-cyan-300/15 bg-cyan-300/[0.03] p-4">
                <p className="text-sm font-medium text-cyan-100">
                  Secret de assinatura da Vendepay
                </p>
                <p className="mt-1 text-xs leading-5 text-white/45">
                  Salvo criptografado. Depois de salvar, o valor nunca volta ao navegador.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Secret de assinatura da Vendepay"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      config.data?.vendepay?.signing_secret_configured
                        ? '•••••••••••••••••••••••• (configurado)'
                        : 'Cole o secret exibido pela Vendepay'
                    }
                    value={vendepaySigningSecret}
                    onChange={(event) => setVendepaySigningSecret(event.target.value)}
                  />
                  <Button
                    disabled={
                      vendepaySigningSecret.trim().length < 16 ||
                      saveVendepaySigningSecret.isPending
                    }
                    onClick={() => saveVendepaySigningSecret.mutate()}
                  >
                    {saveVendepaySigningSecret.isPending
                      ? 'Salvando…'
                      : config.data?.vendepay?.signing_secret_configured
                        ? 'Substituir secret'
                        : 'Salvar secret'}
                  </Button>
                </div>
                {config.data?.vendepay?.signing_secret_configured && (
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
                  Cole um exemplo recebido da Vendepay. O teste apenas normaliza os campos: não cria
                  pedido, não envia ao Meta e não envia à UTMify.
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
            description="Controle quais compras entram na Conversions API e filtre pedidos de baixo valor."
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
          </Module>
        )}
        {section === 'utmify' && (
          <Module
            title="Envio à UTMify"
            description="Replica cada mudança do pedido na API de vendas da UTMify, preservando UTMs e mantendo uma fila auditável."
          >
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
                    Envia um pedido de R$ 1,00 com status waiting_payment e isTest=true. Ele valida
                    a conexão sem registrar uma venda aprovada.
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
              <p className="hud-label">Últimas entregas</p>
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
                      {canManage && (delivery.state === 'failed' || delivery.state === 'dead') && (
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
          </Module>
        )}
        {section === 'ab' && (
          <Module
            title="Testes A/B"
            description="Divide o tráfego e elege o braço com maior receita por visitante. Apenas um teste fica ativo por oferta."
          >
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
  return (
    <article className="rounded-2xl border border-cyan-100/[0.12] bg-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            {test.kind} · {test.traffic_a}% / {100 - test.traffic_a}%
          </span>
          <p className="mt-1 text-base font-semibold text-white/90">{test.name}</p>
        </div>
        <span className={test.status === 'active' ? 'text-emerald-300' : 'text-white/55'}>
          {test.status === 'active' ? 'Em execução' : 'Pausado'}
        </span>
      </div>
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
                    {(Number(row?.revenue_minor ?? 0) / 100).toLocaleString('pt-BR', {
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
          <Button asChild size="sm" variant="outline">
            <a
              href={`${test.redirect_url}?tmx_preview=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Testar sem contabilizar
            </a>
          </Button>
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
