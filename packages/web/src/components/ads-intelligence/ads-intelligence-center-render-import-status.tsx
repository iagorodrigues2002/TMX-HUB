'use client';

import { date, platformLabel } from './ads-intelligence-center-support';
import type { useAdsIntelligenceCenterState } from './ads-intelligence-center-use-ads-intelligence-center-state';

export function renderImportStatus({
  connection,
  data,
  importError,
}: Pick<ReturnType<typeof useAdsIntelligenceCenterState>, 'data' | 'importError'> & {
  data: NonNullable<ReturnType<typeof useAdsIntelligenceCenterState>['data']>;
} & {
  connection: NonNullable<
    NonNullable<ReturnType<typeof useAdsIntelligenceCenterState>['data']>['connection']
  >;
}) {
  return (
    <section
      aria-label="Estado da importação"
      className="rounded-xl border border-border bg-card p-5 text-sm"
    >
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <p>
          Estado:{' '}
          <span className="font-medium">
            {(
              {
                ready: 'Agendada',
                partial: 'Atualizada parcialmente',
                retry_wait: 'Aguardando nova tentativa',
                importing: 'Importando',
                paused: 'Pausada',
                running: 'Importando',
                error: 'Falha',
                completed: 'Atualizada',
                idle: 'Aguardando próxima atualização',
              } as Record<string, string>
            )[connection.state] ?? connection.state}
          </span>
        </p>
        <p>Última atualização: {date(connection.last_sync_at)}</p>
        <p>
          {connection.state === 'retry_wait' ? 'Nova tentativa' : 'Próxima'}:{' '}
          {connection.state === 'paused'
            ? 'Aguardando correção da conexão'
            : date(connection.next_sync_at)}
        </p>
      </div>
      {connection.state === 'retry_wait' && (
        <output className="block mt-3 text-muted-foreground">
          Uma falha temporária interrompeu a consulta. Tentativas automáticas de recuperação:{' '}
          {connection.retry_attempts ?? 0} de 2 por importação. Os dados já confirmados são
          preservados; não é necessário cadastrar a conexão novamente.
        </output>
      )}
      <p className="mt-3 text-muted-foreground">
        Histórico solicitado desde 01/08/2026.{' '}
        {data.coverage?.from && data.coverage.to
          ? `Dados confirmados de ${data.coverage.from.slice(0, 10)} até ${data.coverage.to.slice(0, 10)}${data.coverage.complete ? '.' : ' — cobertura parcial.'}`
          : 'Nenhum intervalo confirmado ainda; não exibimos valores zero como se fossem resultados.'}{' '}
        {data.coverage?.complete
          ? 'Importação desse intervalo concluída.'
          : 'ROAS e ROI são calculados somente onde há custo e atribuição suficientes. Contas com falha e vínculos pendentes não são tratados como gasto zero.'}
      </p>
      {!!connection.platform_coverage?.length && (
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
          {connection.platform_coverage.map((p) => (
            <li key={p.platform}>
              {platformLabel(p.platform)}:{' '}
              {{ complete: 'completa', partial: 'parcial', unavailable: 'indisponível' }[p.state]} ·{' '}
              {p.accounts} contas
            </li>
          ))}
        </ul>
      )}
      {!!connection.account_failures?.length && (
        <section
          aria-live="polite"
          aria-atomic="true"
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <h2 className="font-medium">
            Cobertura incompleta: {connection.account_failures.length} contas com falha
          </h2>
          <p className="mt-2 text-muted-foreground">
            As contas disponíveis continuam na tabela. Contas com falha não representam gasto zero;
            seus custos estão ausentes. O TMX verificará novamente essas contas na atualização
            semanal e recuperará o histórico quando a origem voltar a responder.
          </p>
          <ul className="mt-3 space-y-3">
            {connection.account_failures.map((failure, index) => (
              <li
                key={`${failure.platform}:${failure.account_id}:${index}`}
                className="break-words"
              >
                <p className="font-medium">
                  {platformLabel(failure.platform)} · {failure.account_name || 'Conta sem nome'}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  ID: {failure.account_id} · {failure.from.slice(0, 10)} a {failure.to.slice(0, 10)}
                </p>
                <p className="text-xs text-muted-foreground">{failure.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {importError && (
        <p
          role={importError.warning ? 'status' : 'alert'}
          className={`mt-3 ${importError.warning ? 'text-[var(--ads-cost)]' : 'text-destructive'}`}
        >
          {importError.message}
        </p>
      )}
    </section>
  );
}
