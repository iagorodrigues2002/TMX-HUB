'use client';

import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle } from 'lucide-react';

export function TestCenter({ offerId }: { offerId: string }) {
  const test = useMutation({
    mutationFn: async () => {
      if (!offerId) throw new Error('Selecione uma oferta para executar os testes.');
      const [diagnostics, config, advanced, receipts] = await Promise.all([
        apiClient.getTrackingDiagnostics(offerId),
        apiClient.getTrackingConfig(offerId),
        apiClient.getAdvancedTracking(offerId),
        apiClient.listVendepayReceipts(offerId),
      ]);
      const liveDomains = advanced.domains.filter((domain) => domain.status === 'live').length;
      return [
        {
          label: 'Banco e migrations',
          ok: diagnostics.database === 'ready' && diagnostics.migrations === 'ready',
          detail:
            diagnostics.database === 'ready' && diagnostics.migrations === 'ready'
              ? `Estrutura v${diagnostics.schema_version ?? '?'} pronta`
              : diagnostics.detail,
        },
        {
          label: 'Criptografia',
          ok: diagnostics.encryption === 'ready',
          detail:
            diagnostics.encryption === 'ready'
              ? 'Segredos protegidos'
              : 'Chave de criptografia indisponível',
        },
        {
          label: 'Tracker da oferta',
          ok: config.configured && Boolean(config.project?.public_key),
          detail: config.configured ? 'Chave pública e script disponíveis' : 'Tracking não criado',
        },
        {
          label: 'Vendepay',
          ok: Boolean(config.vendepay?.configured && config.vendepay.enabled),
          detail: config.vendepay?.configured
            ? `${receipts.receipts.length} webhook(s) registrado(s)`
            : 'Webhook ainda não configurado',
        },
        {
          label: 'Domínios',
          ok: liveDomains > 0,
          detail:
            liveDomains > 0
              ? `${liveDomains} domínio(s) recebendo eventos`
              : 'Nenhum domínio confirmou PageView',
        },
        {
          label: 'Fila do Meta',
          ok: diagnostics.meta.failed === 0,
          detail:
            diagnostics.meta.failed === 0
              ? `${diagnostics.meta.pending} entrega(s) pendente(s), nenhuma falha`
              : `${diagnostics.meta.failed} entrega(s) com falha`,
        },
      ];
    },
  });
  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hud-label text-emerald-200">Central de homologação</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            Testar a instalação automaticamente
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
            Verifica infraestrutura, tracker, Vendepay, domínios e fila do Meta sem criar uma venda
            real ou disparar conversões.
          </p>
        </div>
        <Button disabled={!offerId || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Executar diagnóstico
        </Button>
      </div>
      {test.isError && <p className="mt-4 text-sm text-red-200">{test.error.message}</p>}
      {test.data && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {test.data.map((item) => (
            <div
              key={item.label}
              className="flex gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-3"
            >
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              )}
              <div>
                <p className="text-sm font-medium text-white/85">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
