'use client';

import { TrackingAdvancedCenter } from '@/components/tracking/tracking-advanced-center';
import { TrackingBackdrop } from '@/components/tracking/tracking-backdrop';
import {
  DEFAULT_TRACKING_SECTION,
  TRACKING_NAV,
  type TrackingView,
  buildTrackingHref,
  resolveTrackingLocation,
  trackingWorkspaceNavigation,
} from '@/components/tracking/tracking-nav';
import {
  TrackingOfferProvider,
  useTrackingOffer,
} from '@/components/tracking/tracking-offer-context';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import type { OfferView } from '@/lib/api-client';
import { useDisplayCurrency } from '@/lib/currency-preference';
import { useRouter } from '@/lib/motion-router';
import { cn } from '@/lib/utils';
import { ChevronDown, RefreshCw, Store } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

function groupOffersByCompany(offers: OfferView[]) {
  const groups = new Map<string, OfferView[]>();
  for (const offer of offers) {
    const company = offer.companyName?.trim() || 'Sem empresa';
    groups.set(company, [...(groups.get(company) ?? []), offer]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([company, companyOffers]) => ({
      company,
      offers: companyOffers.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    }));
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
  const offersByCompany = useMemo(() => groupOffersByCompany(offers), [offers]);
  const { view, section } = resolveTrackingLocation(
    searchParams.get('view'),
    searchParams.get('section'),
  );
  const activeArea = TRACKING_NAV.find((item) => item.id === view)!;
  const workspaceNav = trackingWorkspaceNavigation(view, section);
  const AreaIcon = activeArea.icon;

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
    <div
      data-surface="tracking"
      data-motion-screen={`tracking:${view}:${section}`}
      className="space-y-4"
    >
      <TrackingBackdrop />
      <header
        data-motion-panel
        className="glass-card rounded-xl border border-[var(--hairline-strong)] bg-bg-elevated/75 p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 sm:items-start sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--hairline-strong)] bg-[var(--hairline)] sm:h-10 sm:w-10">
              <AreaIcon className="h-5 w-5 text-[var(--signal-300)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl md:text-2xl">
                {workspaceNav.title}
              </h1>
              <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-muted-foreground sm:block">
                {workspaceNav.description}
              </p>
            </div>
          </div>
          <fieldset className="tmx-currency-toggle" aria-label="Moeda">
            <legend className="tmx-currency-toggle-label hidden sm:block">Moeda</legend>
            {(['BRL', 'USD'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setDisplayCurrency(code)}
                className="tmx-currency-toggle-btn max-sm:min-h-11 max-sm:min-w-11 max-sm:px-2!"
                data-active={displayCurrency === code}
                aria-pressed={displayCurrency === code}
              >
                {code}
              </button>
            ))}
          </fieldset>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3 sm:mt-4 sm:gap-3 sm:pt-4">
          <div className="min-w-full flex-1 sm:min-w-72">
            <label htmlFor="tracking-offer" className="text-xs font-medium text-muted-foreground">
              Oferta ativa
            </label>
            <div className="relative mt-1.5">
              <select
                id="tracking-offer"
                value={activeOfferId}
                disabled={isLoading || !offers.length}
                onChange={(event) => setActiveOfferId(event.target.value)}
                className="h-11 w-full appearance-none rounded-md border border-[var(--hairline-strong)] bg-[var(--surface-inset)] px-3 pr-10 text-base text-[var(--ink-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-500)] sm:text-sm"
              >
                {offersByCompany.map((group) => (
                  <optgroup key={group.company} label={group.company}>
                    {group.offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          {activeOffer && (
            <div className="flex min-h-11 flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">
                {activeOffer.status}
              </span>
              <span className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground">
                {activeOffer.currency}
              </span>
              <span
                className={cn(
                  'rounded-md border px-2.5 py-1.5',
                  canManage
                    ? 'border-success/30 text-success'
                    : 'border-border text-muted-foreground',
                )}
              >
                {canManage ? 'Pode configurar' : 'Somente leitura'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div
        className={cn(
          'grid min-w-0 gap-4',
          workspaceNav.sections.length > 0 && 'xl:grid-cols-[230px_minmax(0,1fr)]',
        )}
      >
        {workspaceNav.sections.length > 0 && (
          <aside
            data-motion-panel
            data-glass-surface
            className="h-fit min-w-0 rounded-lg border border-border bg-accent p-2 xl:sticky xl:top-20"
          >
            <div className="px-2 py-2">
              <h2 className="text-sm font-semibold text-foreground">Nesta área</h2>
              <p className="mt-1 hidden text-xs leading-5 text-muted-foreground xl:block">
                {workspaceNav.description}
              </p>
            </div>
            <nav
              aria-label={`Seções de ${workspaceNav.title}`}
              className="mt-1 flex gap-1.5 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-500)] xl:block xl:overflow-visible"
            >
              {workspaceNav.sections.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={section === item.id ? 'location' : undefined}
                    onClick={() => navigate(view, item.id)}
                    className={cn(
                      'flex min-h-11 min-w-max shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-500)] xl:mb-1 xl:w-full xl:min-w-0 xl:items-start',
                      section === item.id && 'bg-accent',
                    )}
                  >
                    <Icon
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground',
                        section === item.id && 'text-[var(--signal-300)]',
                      )}
                    />
                    <span>
                      <span
                        className={cn(
                          'block text-xs font-medium text-muted-foreground',
                          section === item.id && 'text-foreground',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground xl:block">
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        <section className="min-w-0" aria-label={`Conteúdo de ${activeArea.label}`}>
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
            <div key={`${activeOffer.id}:${view}:${section}`}>
              <TrackingAdvancedCenter
                offerId={activeOffer.id}
                canManage={canManage}
                view={view}
                section={section}
              />
            </div>
          )}
        </section>
      </div>

      {isFetching && !isLoading && (
        <output className="fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-muted-foreground shadow-xl md:bottom-4">
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
