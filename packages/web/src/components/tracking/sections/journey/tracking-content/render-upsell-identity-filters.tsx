'use client';
import { Button } from '@/components/ui/button';
import { renderUpsellIdentities } from './render-upsell-identities';
import type { TrackingContentContext } from './tracking-content-context';
import { UPSELL_IDENTITIES_PAGE_SIZE } from './tracking-helpers';
export function renderUpsellIdentityFilters(context: TrackingContentContext) {
  const {
    canManage,
    reconcileUpsellIdentities,
    recoverFailedUpsellLinks,
    upsellBuyerFilter,
    setUpsellBuyerFilter,
    upsellTestFilter,
    setUpsellTestFilter,
    filteredUpsellIdentities,
    upsellIdentities,
    upsellIdentityOffset,
    setUpsellIdentityOffset,
  } = context;
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.08]">
      <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-white/80">vendaId e jornadas</p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={reconcileUpsellIdentities.isPending}
                onClick={() => reconcileUpsellIdentities.mutate()}
              >
                {reconcileUpsellIdentities.isPending
                  ? 'Reconciliando…'
                  : 'Recuperar vendaId dos webhooks'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={recoverFailedUpsellLinks.isPending}
                onClick={() => recoverFailedUpsellLinks.mutate()}
              >
                {recoverFailedUpsellLinks.isPending
                  ? 'Verificando…'
                  : 'Verificar API dos reprovados'}
              </Button>
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-white/40">
          Histórico de compras de front aprovadas. VendePay usa vendaId validado; SyzePay usa a
          sessão do checkout e confirma a página no funil antes de liberar o link.
        </p>
        <p className="mt-1 text-xs text-white/35">
          As verificações de sessão são somente de leitura e não realizam cobranças. “Recuperar
          vendaId” é específico da VendePay. Cada compra abre somente os destinos do seu gateway.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ['all', 'Todos'],
              ['front_only', 'Somente front'],
              ['with_upsell', 'Comprou upsell'],
            ] as const
          ).map(([value, label]) => (
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-white/30">
            Resultado do teste
          </span>
          {(
            [
              ['all', 'Todos'],
              ['worked', 'Funcionou'],
              ['failed', 'Não funcionou'],
              ['unclassified', 'Não classificados'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={upsellTestFilter === value ? 'default' : 'outline'}
              onClick={() => setUpsellTestFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {renderUpsellIdentities(context)}
      {!upsellIdentities.isLoading && !filteredUpsellIdentities.length && (
        <p className="px-4 py-5 text-sm text-white/40">Nenhum comprador encontrado neste filtro.</p>
      )}
      {!upsellIdentities.isLoading && (upsellIdentities.data?.total ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3 text-xs text-white/45">
          <span>
            Exibindo {upsellIdentityOffset + 1}–
            {Math.min(
              upsellIdentityOffset + (upsellIdentities.data?.items.length ?? 0),
              upsellIdentities.data?.total ?? 0,
            )}{' '}
            de {upsellIdentities.data?.total} compras aprovadas.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={upsellIdentityOffset === 0}
              onClick={() =>
                setUpsellIdentityOffset((offset) =>
                  Math.max(0, offset - UPSELL_IDENTITIES_PAGE_SIZE),
                )
              }
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                upsellIdentityOffset + (upsellIdentities.data?.items.length ?? 0) >=
                (upsellIdentities.data?.total ?? 0)
              }
              onClick={() =>
                setUpsellIdentityOffset((offset) => offset + UPSELL_IDENTITIES_PAGE_SIZE)
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
