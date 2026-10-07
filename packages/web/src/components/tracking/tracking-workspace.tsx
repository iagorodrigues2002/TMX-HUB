'use client';

import { TrackingAdvancedCenter } from '@/components/tracking/tracking-advanced-center';
import { TrackingBackdrop } from '@/components/tracking/tracking-backdrop';
import {
  DEFAULT_TRACKING_SECTION,
  TRACKING_NAV,
  type TrackingView,
  buildTrackingHref,
  resolveTrackingLocation,
} from '@/components/tracking/tracking-nav';
import {
  TrackingOfferProvider,
  useTrackingOffer,
} from '@/components/tracking/tracking-offer-context';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { useDisplayCurrency } from '@/lib/currency-preference';
import { cn } from '@/lib/utils';
import { ChevronDown, RadioTower, RefreshCw, Store } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

function offerLabel(name: string, companyName?: string | null) {
  return companyName ? `${name} · ${companyName}` : name;
}

function TrackingWorkspaceContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency();
  const {
    offers,
    activeOffer,
    activeOfferId,
    setActiveOfferId,
    canManage,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useTrackingOffer();
  const { view, section } = resolveTrackingLocation(
    searchParams.get('view'),
    searchParams.get('section'),
  );
  const activeArea = TRACKING_NAV.find((item) => item.id === view)!;

  const navigate = (nextView: TrackingView, nextSection = DEFAULT_TRACKING_SECTION[nextView]) => {
    if (!activeOfferId) return;
    router.push(
      buildTrackingHref({
        view: nextView,
        section: nextSection,
        offerId: activeOfferId,
        pathname,
        searchParams: searchParams.toString(),
      }),
      { scroll: false },
    );
  };

  return (
    <div data-surface="tracking" className="signal-reveal space-y-4">
      <TrackingBackdrop />
      <header className="rounded-xl border border-[var(--hairline-strong)] bg-bg-elevated/75 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--hairline-strong)] bg-[var(--hairline)]">
              <RadioTower className="h-5 w-5 text-[var(--signal-300)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
                Rastreamento
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">
                Acompanhe cada sinal da entrada à receita e configure somente o ponto em foco.
              </p>
            </div>
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

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/[0.07] pt-4">
          <div className="min-w-full flex-1 sm:min-w-72">
            <label htmlFor="tracking-offer" className="text-xs font-medium text-white/55">
              Oferta ativa
            </label>
            <div className="relative mt-1.5">
              <select
                id="tracking-offer"
                value={activeOfferId}
                disabled={isLoading || !offers.length}
                onChange={(event) => setActiveOfferId(event.target.value)}
                className="h-11 w-full appearance-none rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-inset)] px-3 pr-10 text-sm text-[var(--ink-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-500)]"
              >
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offerLabel(offer.name, offer.companyName)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/40" />
            </div>
          </div>
          {activeOffer && (
            <div className="flex min-h-11 flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-white/55">
                {activeOffer.status}
              </span>
              <span className="rounded-md border border-white/[0.08] px-2.5 py-1.5 text-white/55">
                {activeOffer.currency}
              </span>
              <span
                className={cn(
                  'rounded-md border px-2.5 py-1.5',
                  canManage
                    ? 'border-emerald-300/20 text-emerald-200'
                    : 'border-white/[0.08] text-white/55',
                )}
              >
                {canManage ? 'Pode configurar' : 'Somente leitura'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg border border-white/[0.08] bg-black/15 p-2 xl:sticky xl:top-20">
          <div className="px-2 py-2">
            <h2 className="text-sm font-semibold text-white/85">{activeArea.label}</h2>
            <p className="mt-1 text-xs leading-5 text-white/45">{activeArea.description}</p>
          </div>
          <div className="mt-1 flex gap-1.5 overflow-x-auto xl:block xl:overflow-visible">
            {activeArea.sections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => navigate(view, item.id)}
                  className={cn(
                    'flex min-h-11 min-w-44 shrink-0 items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-500)] xl:mb-1 xl:w-full xl:min-w-0',
                    section === item.id && 'bg-white/[0.06]',
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 text-white/35',
                      section === item.id && 'text-[var(--signal-300)]',
                    )}
                  />
                  <span>
                    <span
                      className={cn(
                        'block text-xs font-medium text-white/55',
                        section === item.id && 'text-white',
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 hidden text-[11px] leading-4 text-white/35 xl:block">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {isLoading ? (
            <DataState variant="loading" title="Carregando ofertas…" />
          ) : isError ? (
            <DataState
              variant="error"
              title="Não foi possível carregar as ofertas"
              description="Verifique a conexão e tente novamente."
              onRetry={refetch}
              isRetrying={isFetching}
            />
          ) : !activeOffer ? (
            <DataState
              variant="empty"
              title="Nenhuma oferta disponível"
              description="Crie ou solicite acesso a uma oferta para iniciar o rastreamento."
              action={
                <Button asChild variant="outline">
                  <a href="/ofertas">
                    <Store className="h-4 w-4" /> Abrir ofertas
                  </a>
                </Button>
              }
            />
          ) : (
            <div
              key={`${activeOffer.id}:${view}:${section}`}
              className="tmx-tracking-section-transition"
            >
              <TrackingAdvancedCenter
                offerId={activeOffer.id}
                canManage={canManage}
                view={view}
                section={section}
              />
            </div>
          )}
        </main>
      </div>

      {isFetching && !isLoading && (
        <output className="fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-lg border border-white/[0.10] bg-bg-elevated px-3 py-2 text-xs text-white/60 shadow-xl md:bottom-4">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Atualizando contexto
        </output>
      )}
    </div>
  );
}

export function TrackingWorkspace() {
  return (
    <TrackingOfferProvider>
      <TrackingWorkspaceContent />
    </TrackingOfferProvider>
  );
}
