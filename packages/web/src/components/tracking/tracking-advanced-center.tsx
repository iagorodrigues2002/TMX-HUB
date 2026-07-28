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
  Facebook,
  FlaskConical,
  Globe2,
  HelpCircle,
  RadioTower,
  Send,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

type Section =
  | 'tracker'
  | 'funnel'
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
  const [domain, setDomain] = useState('');
  const [minimum, setMinimum] = useState('0');
  const [attributedOnly, setAttributedOnly] = useState(true);
  const [testName, setTestName] = useState('');
  const [kind, setKind] = useState<'checkout' | 'presell'>('checkout');
  const [armA, setArmA] = useState('A');
  const [armB, setArmB] = useState('B');
  const [vendepayWebhook, setVendepayWebhook] = useState('');
  const [utmifyToken, setUtmifyToken] = useState('');
  const [utmifyEndpoint, setUtmifyEndpoint] = useState(
    'https://api.utmify.com.br/api-credentials/orders',
  );
  const qc = useQueryClient();
  const advanced = useQuery({
    queryKey: ['tracking-advanced', offerId],
    queryFn: () => apiClient.getAdvancedTracking(offerId),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
  const addDomain = useMutation({
    mutationFn: () => apiClient.addTrackingDomain(offerId, domain),
    onSuccess: () => {
      setDomain('');
      void refresh();
      toast.success('Domínio adicionado.');
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
        traffic_a: 50,
        variants: [
          { label: armA, gateway: kind === 'checkout' ? 'vendepay' : undefined },
          { label: armB, gateway: kind === 'checkout' ? 'cooud' : undefined },
        ],
      }),
    onSuccess: () => {
      setTestName('');
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
  const rotateVendepay = useMutation({
    mutationFn: () => apiClient.rotateVendepayWebhook(offerId),
    onSuccess: (result) => {
      setVendepayWebhook(result.vendepay_webhook_url);
      toast.success('URL real gerada. A URL anterior foi desativada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const copyVendepayWebhook = async () => {
    await navigator.clipboard.writeText(vendepayWebhook);
    toast.success('Webhook real copiado.');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="h-fit rounded-lg border border-white/[0.08] bg-black/15 p-3 lg:sticky lg:top-20">
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
        {section === 'tracker' && <TrackingLiveConsole offerId={offerId} mode="tracker" />}
        {section === 'funnel' && <TrackingLiveConsole offerId={offerId} mode="funnel" />}
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
              <div className="flex gap-2">
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="checkout.suaoferta.com"
                />
                <Button
                  disabled={!domain.trim() || addDomain.isPending}
                  onClick={() => addDomain.mutate()}
                >
                  Adicionar
                </Button>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {advanced.data?.domains?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border border-white/[0.07] p-3 text-sm"
                >
                  <span className="text-white/70">{item.hostname}</span>
                  <span className={item.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}>
                    {item.status === 'live' ? 'ao vivo' : 'aguardando evento'}
                  </span>
                </div>
              ))}
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
                <div className="text-sm text-white/50 self-center">Divisão 50% / 50%</div>
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
                <Button
                  className="md:col-span-2"
                  disabled={!testName.trim() || createTest.isPending}
                  onClick={() => createTest.mutate()}
                >
                  Criar e ativar teste
                </Button>
              </div>
            )}
            <div className="mt-5 space-y-2">
              {advanced.data?.ab_tests?.map((test) => (
                <div key={test.id} className="rounded border border-white/[0.07] p-4">
                  <div className="flex justify-between">
                    <div>
                      <span className="text-xs uppercase text-cyan-300">{test.kind}</span>
                      <p className="mt-1 text-white/75">{test.name}</p>
                    </div>
                    <span
                      className={test.status === 'active' ? 'text-emerald-300' : 'text-white/35'}
                    >
                      {test.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-white/40">
                    {test.variants.map((v) => v.label).join(' × ')} · {test.traffic_a}% /{' '}
                    {100 - test.traffic_a}%
                  </p>
                </div>
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
