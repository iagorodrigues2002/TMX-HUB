import { type Delay, refundPercent } from './refunds-visualizations-support';

export function RefundDelay({
  delay,
  isPrivate,
  basis = 'effective',
}: {
  delay: Delay;
  isPrivate: boolean;
  basis?: 'effective' | 'observed';
}) {
  const sampleCount = delay.sample_count ?? delay.buckets.reduce((sum, b) => sum + b.count, 0);
  const hasSample = sampleCount > 0;
  const days = (v: number | null) =>
    isPrivate
      ? '****'
      : v == null
        ? '—'
        : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  return (
    <div className="mt-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)]">
        <div className="min-w-0 border-b border-border pb-5 lg:border-b-0 lg:border-r lg:pr-7">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div>
              <dt className="text-sm text-muted-foreground">Tempo médio</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                {days(hasSample ? delay.mean_days : null)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Mediana</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {days(hasSample ? delay.median_days : null)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            A mediana é o prazo central: metade das devoluções acontece até esse tempo.
          </p>
          <p className="mt-3 text-sm text-foreground">
            <span className="font-semibold tabular-nums">
              {isPrivate ? '****' : sampleCount.toLocaleString('pt-BR')}
            </span>{' '}
            {basis === 'observed'
              ? 'notificações com intervalo válido'
              : 'devoluções com intervalo válido'}
          </p>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Distribuição por prazo</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Participação de cada faixa nas devoluções com intervalo válido.
          </p>
          {isPrivate ? (
            <p className="mt-4 rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Distribuição oculta pelo modo de privacidade.
            </p>
          ) : !hasSample ? (
            <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6">
              <p className="text-sm font-medium text-foreground">
                Sem intervalo válido neste filtro
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                É preciso identificar a data da compra e a do primeiro recebimento do webhook no
                mesmo pedido. Sem esse vínculo, o prazo não é calculado como zero.
              </p>
            </div>
          ) : (
            <ul
              className="mt-4 space-y-4"
              aria-label={
                basis === 'observed'
                  ? 'Distribuição do tempo entre compra e recebimento da notificação'
                  : 'Distribuição do tempo entre compra e devolução'
              }
            >
              {delay.buckets.map((b) => {
                const share = (b.count / sampleCount) * 100;
                return (
                  <li key={b.label}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <span className="text-foreground">{b.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {b.count.toLocaleString('pt-BR')}{' '}
                        {basis === 'observed' ? 'notificações' : 'devoluções'}{' '}
                        <span className="font-medium text-primary">
                          ({refundPercent(share, false)})
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-accent" aria-hidden="true">
                      <div
                        className="refund-bar-reveal h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {(Boolean(delay.missing_paid_at) ||
        Boolean(delay.missing_reversal_at) ||
        Boolean(delay.negative_delay_orders)) && (
        <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
          Datas ausentes ou inconsistentes foram excluídas apenas desta análise de prazo. Os valores
          dessas devoluções permanecem no resumo financeiro.
          {!isPrivate && (
            <span className="mt-1 block tabular-nums">
              Sem data da compra: {delay.missing_paid_at ?? 0}.{' '}
              {basis === 'observed' ? 'Sem data do recebimento' : 'Sem data da devolução'}:{' '}
              {delay.missing_reversal_at ?? 0}. Intervalos negativos:{' '}
              {delay.negative_delay_orders ?? 0}.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
