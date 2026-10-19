'use client';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { Trash2 } from 'lucide-react';
import { Copy } from 'lucide-react';
import { Metric } from './metric';
import type { TrackingContentContext } from './tracking-content-context';
export function renderUpsellStages(context: TrackingContentContext) {
  const {
    upsellIntelligence,
    canManage,
    setEditingUpsellStageId,
    setUpsellStageKey,
    setUpsellStageName,
    setUpsellDestination,
    setUpsellConnectionDestinations,
    deleteUpsellStage,
    vendepayConnections,
  } = context;
  return (
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
            className="min-w-0 rounded-xl border border-emerald-300/15 bg-black/15 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 break-words">
                <p className="hud-label text-emerald-200">{stage.stage_key}</p>
                <h3 className="mt-1 font-semibold text-white/90">{stage.name}</h3>
              </div>
              <span
                className={stage.enabled ? 'text-xs text-emerald-300' : 'text-xs text-white/35'}
              >
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
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal"
                  onClick={() => {
                    setEditingUpsellStageId(stage.id);
                    setUpsellStageKey(stage.stage_key);
                    setUpsellStageName(stage.name);
                    setUpsellDestination(stage.destination_url);
                    setUpsellConnectionDestinations(stage.connection_destinations ?? {});
                  }}
                >
                  Editar URLs por gateway
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-11 min-w-11"
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
                    <span className="max-w-[50%] shrink-0 break-words rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-2 py-0.5 text-emerald-100/75">
                      {connection.name}
                    </span>
                    <span
                      className="truncate text-cyan-100/55"
                      title={stage.connection_destinations[connection.id]}
                    >
                      {stage.connection_destinations[connection.id]}
                    </span>
                  </div>
                ))}
              {(['vendepay', 'syzepay', 'paysight', 'explodely'] as const)
                .filter((gateway) => stage.connection_destinations?.[`gateway:${gateway}`])
                .map((gateway) => (
                  <div key={gateway} className="mt-2 text-xs text-white/60">
                    <strong>
                      {
                        {
                          vendepay: 'VendePay',
                          syzepay: 'SyzePay',
                          paysight: 'Paysight',
                          explodely: 'Explodely',
                        }[gateway]
                      }
                    </strong>
                    <span className="ml-2 break-all">
                      {stage.connection_destinations?.[`gateway:${gateway}`]}
                    </span>
                  </div>
                ))}
              {!Object.keys(stage.connection_destinations ?? {}).length && (
                <p className="text-[11px] text-amber-100/55">
                  Nenhuma conta VendePay configurada nesta etapa.
                </p>
              )}
            </div>
            <p className="mt-4 text-[11px] text-white/40">
              Link TMX opcional — não é necessário trocar na Vendepay
            </p>
            <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded bg-black/25 p-2 text-[11px] text-cyan-100">
              {stage.secure_url}
            </code>
            <Button
              className="mt-2 w-full"
              size="sm"
              onClick={() => void copyText(stage.secure_url, 'Link seguro do upsell copiado.')}
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
              onClick={() => void copyText(stage.install_code, 'Script do upsell copiado.')}
            >
              Copiar script
            </Button>
          </article>
        );
      })}
    </div>
  );
}
