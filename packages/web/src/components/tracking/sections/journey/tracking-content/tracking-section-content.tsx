'use client';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { cn } from '@/lib/utils';
import { Copy } from 'lucide-react';
import { renderTrackingNavigation } from './render-tracking-navigation';
import type { TrackingSectionId } from './tracking-navigation';
import { useDestinationQueries } from './use-destination-queries';
import { useDomainActions } from './use-domain-actions';
import { useEntryLinkActions } from './use-entry-link-actions';
import { useFeeActions } from './use-fee-actions';
import { useFormState } from './use-form-state';
import { useGatewayActions } from './use-gateway-actions';
import { useProductActions } from './use-product-actions';
import { usePushcutActions } from './use-pushcut-actions';
import { useSetupStatus } from './use-setup-status';
import { useTrackingPeriod } from './use-tracking-period';
import { useUpsellActions } from './use-upsell-actions';
import { useUpsellQueries } from './use-upsell-queries';
import { useUtmifyActions } from './use-utmify-actions';
import { useVendepayActions } from './use-vendepay-actions';
export function TrackingSectionContent({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: TrackingSectionId }) {
  // Keep hook order and direct render calls: section changes must preserve the existing React tree.
  const props = { offerId, section, canManage };
  const formState = useFormState();
  const periodState = useTrackingPeriod({ ...props, ...formState });
  const upsellQueries = useUpsellQueries({ ...props, ...formState, ...periodState });
  const upsellActions = useUpsellActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
  });
  const domainActions = useDomainActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
  });
  const entryLinkActions = useEntryLinkActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
  });
  const destinationQueries = useDestinationQueries({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
  });
  const utmifyActions = useUtmifyActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
  });
  const productActions = useProductActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
  });
  const pushcutActions = usePushcutActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
  });
  const feeActions = useFeeActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
    ...pushcutActions,
  });
  const gatewayActions = useGatewayActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
    ...pushcutActions,
    ...feeActions,
  });
  const vendepayActions = useVendepayActions({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
    ...pushcutActions,
    ...feeActions,
    ...gatewayActions,
  });
  const setupStatus = useSetupStatus({
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
    ...pushcutActions,
    ...feeActions,
    ...gatewayActions,
    ...vendepayActions,
  });
  const context = {
    ...props,
    ...formState,
    ...periodState,
    ...upsellQueries,
    ...upsellActions,
    ...domainActions,
    ...entryLinkActions,
    ...destinationQueries,
    ...utmifyActions,
    ...productActions,
    ...pushcutActions,
    ...feeActions,
    ...gatewayActions,
    ...vendepayActions,
    ...setupStatus,
  };
  const { setSection } = formState;
  const { config } = destinationQueries;
  const { copyInstallKit, setupSteps, setupReady, destinationLoadingTitle } = setupStatus;

  if (destinationLoadingTitle) {
    return (
      <DataState
        className="min-h-[28rem]"
        variant="loading"
        title={destinationLoadingTitle}
        description="A estrutura desta seção será mantida enquanto os dados são preparados."
      />
    );
  }

  return (
    <div className="space-y-5">
      {false && (
        <section className="hidden">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="hud-label">Configuração guiada</p>
              <h2 className="mt-2 text-lg font-semibold text-white">
                Oferta pronta em cinco etapas
              </h2>
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyInstallKit()}
                >
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
      )}
      {renderTrackingNavigation(context)}
    </div>
  );
}
