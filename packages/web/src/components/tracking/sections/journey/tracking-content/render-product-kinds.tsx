'use client';
import { Button } from '@/components/ui/button';
import type { TrackingProductKind } from '@/lib/api-client';
import type { TrackingContentContext } from './tracking-content-context';
import { stageKeyToProductKind } from './tracking-helpers';
export function renderProductKinds(context: TrackingContentContext) {
  const {
    productKinds,
    canManage,
    productKindSelection,
    setProductKindSelection,
    upsellIntelligence,
    saveProductKind,
    recomputeProductKinds,
    reconcileUtmifyUpsells,
    removeProductKind,
  } = context;
  return (
    <div className="mt-6">
      <p className="hud-label">Produtos: front ou upsell?</p>
      <p className="mt-1 max-w-2xl text-xs text-white/45">
        Cada produto da Vendepay precisa ser marcado como venda front (novo comprador) ou upsell
        (compra adicional do mesmo comprador). Sem isso o pedido fica &quot;não mapeado&quot; e não
        entra corretamente nos números de front/upsell do resumo.
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
                        [product.product_id]: event.target.value as TrackingProductKind,
                      }))
                    }
                  >
                    <option value="front">Front</option>
                    {(upsellIntelligence.data?.stages ?? []).map((stage) => (
                      <option key={stage.stage_key} value={stageKeyToProductKind(stage.stage_key)}>
                        {stage.name}
                      </option>
                    ))}
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
          <p className="text-[10px] uppercase tracking-wider text-white/35">Mapeamentos salvos</p>
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
                    : `Upsell ${mapping.kind.replace('upsell_', '')}`}
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
  );
}
