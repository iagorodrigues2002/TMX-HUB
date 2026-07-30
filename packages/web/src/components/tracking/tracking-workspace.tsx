'use client';

import { TrackingAdvancedCenter } from '@/components/tracking/tracking-advanced-center';
import { TrackingBackdrop } from '@/components/tracking/tracking-backdrop';
import { TrackingHelp } from '@/components/tracking/tracking-help';
import { Button } from '@/components/ui/button';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useDisplayCurrency } from '@/lib/currency-preference';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RadioTower,
  ShieldCheck,
  Store,
  Webhook,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type WorkspaceTab = 'operation' | 'guide';

function offerLabel(offer: OfferView) {
  return offer.companyName ? `${offer.name} · ${offer.companyName}` : offer.name;
}

export function TrackingWorkspace() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const [tab, setTab] = useState<WorkspaceTab>('operation');
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency();
  const offers = useQuery({
    queryKey: ['tracking-offers'],
    queryFn: () => apiClient.listOffers(),
  });

  useEffect(() => {
    if (!selectedOfferId && offers.data?.[0]) {
      setSelectedOfferId(offers.data[0].id);
    }
  }, [offers.data, selectedOfferId]);

  const selectedOffer = offers.data?.find((offer) => offer.id === selectedOfferId);

  return (
    <div data-surface="tracking" className="signal-reveal space-y-6">
      <TrackingBackdrop />
      <header className="overflow-hidden rounded-xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.08] via-white/[0.025] to-transparent p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08]">
                <RadioTower className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <p className="hud-label">TMX Signal · First-party data</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-emerald-200/80">
                  <span className="status-dot" aria-hidden /> Infraestrutura online
                </p>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Trackeamento avançado
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Acompanhe a jornada da visita até a compra, atribua vendas da Vendepay e envie
              conversões server-side para a Meta em uma única central.
            </p>
          </div>
          <div className="flex min-w-[230px] flex-col items-end gap-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Webhook, label: 'Vendepay', value: 'Webhook' },
                { icon: ShieldCheck, label: 'Meta', value: 'CAPI' },
                { icon: Activity, label: 'Eventos', value: 'First-party' },
                { icon: CheckCircle2, label: 'Entrega', value: 'Retentativas' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-md border border-white/[0.07] bg-black/15 p-3">
                  <Icon className="h-3.5 w-3.5 text-cyan-300/75" />
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/35">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-white/70">{value}</p>
                </div>
              ))}
            </div>
            <fieldset className="tmx-currency-toggle">
              <legend className="tmx-currency-toggle-label">Moeda</legend>
              {(['BRL', 'USD'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setDisplayCurrency(code)}
                  className="tmx-currency-toggle-btn"
                  data-active={displayCurrency === code}
                  aria-pressed={displayCurrency === code}
                >
                  {code}
                </button>
              ))}
            </fieldset>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-white/[0.07] pb-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setTab('operation')}
          className={cn(
            'gap-2 text-white/45',
            tab === 'operation' && 'bg-cyan-300/[0.09] text-cyan-200',
          )}
        >
          <Activity className="h-4 w-4" />
          Operação
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setTab('guide')}
          className={cn(
            'gap-2 text-white/45',
            tab === 'guide' && 'bg-cyan-300/[0.09] text-cyan-200',
          )}
        >
          <BookOpenCheck className="h-4 w-4" />
          Configuração e testes
        </Button>
      </div>

      {tab === 'guide' ? (
        <div>
          <div className="mb-6">
            <p className="hud-label">Guia completo</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Configurar e validar o tracking Vendepay
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/50">
              Siga o roteiro até a primeira venda atribuída e use o diagnóstico para localizar
              qualquer etapa que não esteja entregando dados.
            </p>
          </div>
          <TrackingHelp offerId={selectedOfferId} />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-cyan-300" />
                  <p className="hud-label">Oferta monitorada</p>
                </div>
                <p className="mt-2 text-sm text-white/50">
                  Todas as configurações e métricas abaixo pertencem à oferta selecionada.
                </p>
              </div>
              {offers.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/45">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando ofertas…
                </div>
              ) : (
                <div className="relative min-w-full sm:min-w-[320px]">
                  <select
                    aria-label="Selecionar oferta para tracking"
                    value={selectedOfferId}
                    onChange={(event) => setSelectedOfferId(event.target.value)}
                    className="h-11 w-full appearance-none rounded-md border border-white/[0.10] bg-[#06131d] px-4 pr-10 text-sm text-white outline-none transition focus:border-cyan-300/40"
                  >
                    {(offers.data ?? []).map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offerLabel(offer)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/35" />
                </div>
              )}
            </div>
            {selectedOffer && (
              <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                <span className="rounded border border-white/[0.07] px-2 py-1 text-white/45">
                  {selectedOffer.status}
                </span>
                <span className="rounded border border-white/[0.07] px-2 py-1 text-white/45">
                  {selectedOffer.currency}
                </span>
                <span
                  className={cn(
                    'rounded border px-2 py-1',
                    canManage
                      ? 'border-emerald-300/15 text-emerald-200/70'
                      : 'border-white/[0.07] text-white/45',
                  )}
                >
                  {canManage ? 'Acesso de configuração' : 'Somente leitura'}
                </span>
              </div>
            )}
          </section>

          {offers.isError ? (
            <div className="rounded-lg border border-red-300/15 bg-red-300/[0.04] p-5 text-sm text-red-100/75">
              Não foi possível carregar as ofertas. Atualize a página e tente novamente.
            </div>
          ) : !offers.isLoading && !selectedOffer ? (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-8 text-center">
              <Store className="mx-auto h-6 w-6 text-white/25" />
              <h2 className="mt-3 font-medium text-white/80">Nenhuma oferta disponível</h2>
              <p className="mt-1 text-sm text-white/40">
                Crie ou solicite acesso a uma oferta para iniciar o tracking.
              </p>
            </div>
          ) : selectedOffer ? (
            <>
              <TrackingAdvancedCenter offerId={selectedOffer.id} canManage={Boolean(canManage)} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
