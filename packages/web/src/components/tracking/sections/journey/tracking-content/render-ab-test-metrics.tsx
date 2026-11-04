'use client';
import { Button } from '@/components/ui/button';
import type { useAbTestCard } from './use-ab-test-card';
export function renderAbTestMetrics({
  test,
  metrics,
  canManage,
  control,
}: {
  test: {
    id: string;
    name: string;
    kind: 'checkout' | 'presell';
    status: string;
    traffic_a: number;
    redirect_url: string;
    winner_variant_id?: string;
    variants: Array<{ id: string; label: string; destination_url?: string; position: number }>;
  };
  metrics: ReturnType<typeof useAbTestCard>['metrics'];
  canManage: boolean;
  control: ReturnType<typeof useAbTestCard>['control'];
}) {
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {test.variants.map((variant, index) => {
        const row = metrics.data?.variants.find((item) => item.id === variant.id);
        const visitors = Number(row?.visitors ?? 0);
        const paid = Number(row?.paid_orders ?? 0);
        const frontBuyers = Number(row?.front_buyers ?? 0);
        const conversion = visitors ? (paid / visitors) * 100 : 0;
        const revenueBrlMinor = Number(row?.revenue_brl_minor ?? 0);
        const aovBrlMinor = frontBuyers ? revenueBrlMinor / frontBuyers : 0;
        return (
          <div key={variant.id} className="glass-card rounded-xl border border-border bg-muted p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{variant.label}</p>
              <span className="text-xs text-muted-foreground">
                {index === 0 ? test.traffic_a : 100 - test.traffic_a}% do tráfego
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-primary">
              {variant.destination_url ?? 'Destino não informado'}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Visitantes</dt>
                <dd className="mt-1 text-base font-semibold text-foreground">{visitors}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Acessos ao checkout</dt>
                <dd className="mt-1 text-base font-semibold text-foreground">
                  {Number(row?.checkouts ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Compras</dt>
                <dd className="mt-1 text-base font-semibold text-success">{paid}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Conversão</dt>
                <dd className="mt-1 text-base font-semibold text-primary">
                  {conversion.toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Receita atribuída</dt>
                <dd className="mt-1 text-base font-semibold text-success">
                  {(revenueBrlMinor / 100).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </dd>
              </div>
              <div>
                <dt
                  className="text-muted-foreground"
                  title="Receita do front e upsells dividida pelos compradores únicos de front"
                >
                  AOV do funil
                </dt>
                <dd className="mt-1 text-base font-semibold text-warning">
                  {(aovBrlMinor / 100).toLocaleString('pt-BR', {
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
                onClick={() => control.mutate({ action: 'select_winner', variant_id: variant.id })}
              >
                Definir como vencedora
              </Button>
            )}
            {test.winner_variant_id === variant.id && (
              <p className="mt-4 text-xs font-semibold text-success">Variante vencedora</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
