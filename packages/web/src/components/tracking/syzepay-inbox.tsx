'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { toast } from 'sonner';
import { Building2, Copy, Webhook, RefreshCw } from 'lucide-react';
import { SyzepayFeeForm } from './syzepay-fees';
import { SyzepayOrders } from './syzepay-orders';

export function SyzepayInbox() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('SyzePay Mainex');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const companies = useQuery({
    queryKey: ['syzepay-companies'],
    queryFn: apiClient.syzeCompanies,
    retry: false,
  });
  const connections = useQuery({
    queryKey: ['syzepay-connections'],
    queryFn: apiClient.syzeConnections,
    retry: false,
    refetchInterval: 15000,
  });
  const requested = params.get('company') ?? '';
  const company = requested
    ? companies.data?.companies.find((c) => c.key === requested || c.name === requested)
    : companies.data?.companies[0];
  const rows = connections.data?.connections.filter((c) => c.company_key === company?.key) ?? [];
  const active = rows.find((c) => c.id === selected) ?? rows[0];
  const receipts = useQuery({
    queryKey: ['syzepay-receipts', active?.id],
    queryFn: () => apiClient.syzeReceipts(active!.id),
    enabled: Boolean(active),
    retry: false,
    refetchInterval: 15000,
  });
  const create = useMutation({
    mutationFn: () => apiClient.syzeCreate(company!.key, name),
    onSuccess: (result) => {
      setUrls((previous) => ({ ...previous, [result.id]: result.webhook_url }));
      setSelected(result.id);
      void qc.invalidateQueries({ queryKey: ['syzepay-connections'] });
      toast.success('Webhook geral criado. Recepção sem processamento de vendas.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const reveal = useMutation({
    mutationFn: apiClient.syzeUrl,
    onSuccess: (result, id) => setUrls((previous) => ({ ...previous, [id]: result.webhook_url })),
    onError: (error) => toast.error((error as Error).message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.syzeToggle(id, enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['syzepay-connections'] });
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const choose = (key: string) => {
    const target = companies.data?.companies.find((c) => c.key === key);
    if (!target) return;
    setSelected('');
    setUrls({});
    router.replace(`/integracoes/syzepay?company=${encodeURIComponent(target.name)}`, {
      scroll: false,
    });
  };
  if (companies.isLoading) return <DataState variant="loading" title="Carregando empresas…" />;
  if (companies.isError)
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar as empresas"
        onRetry={() => void companies.refetch()}
      />
    );
  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-white/10 bg-bg-elevated p-5">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">SyzePay por empresa</h1>
            <p className="mt-1 text-sm text-white/55">
              Uma conexão geral para os produtos da empresa. Os demais gateways continuam por
              oferta.
            </p>
          </div>
        </div>
        <label htmlFor="syze-company" className="mt-5 block text-sm">
          Empresa
        </label>
        <select
          id="syze-company"
          value={company?.key ?? ''}
          onChange={(e) => choose(e.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-white/15 bg-bg px-3"
        >
          {!company && <option value="">Nenhuma empresa própria disponível</option>}
          {companies.data?.companies.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name} · {c.offers} ofertas
            </option>
          ))}
        </select>
        {!company && (
          <p className="mt-3 text-sm text-white/55">
            Cadastre uma empresa nas suas ofertas. Convites para ofertas não concedem acesso ao
            webhook geral da empresa.
          </p>
        )}
      </header>
      <section className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-4 text-sm">
        <strong>Recepção rápida · classificação segura por pedido</strong>
        <p className="mt-2 text-white/60">
          Os eventos são guardados criptografados e só geram venda após assinatura validada e
          classificação. Os envios respeitam os destinos ativos da oferta. Compras front são
          elegíveis aos pixels; upsells não inflam a otimização.
        </p>
      </section>
      {company && (
        <section className="rounded-lg border border-white/10 p-5">
          <h2 className="font-semibold">Adicionar conta SyzePay à {company.name}</h2>
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="min-w-56 flex-1">
              <label htmlFor="syze-name" className="text-sm text-white/65">
                Nome da conexão
              </label>
              <input
                id="syze-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={100}
                required
                className="mt-2 h-11 w-full rounded-md border border-white/15 bg-bg px-3"
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Criando…' : 'Criar webhook geral'}
            </Button>
          </form>
        </section>
      )}
      {connections.isError ? (
        <DataState
          variant="error"
          title="Falha ao carregar conexões"
          onRetry={() => void connections.refetch()}
        />
      ) : (
        rows.map((c) => (
          <section key={c.id} className="rounded-lg border border-white/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold">
                <Webhook className="h-5 w-5 text-primary" />
                {c.name}
              </h2>
              <span className="text-xs text-amber-200">
                {c.receipts} eventos aguardando mapeamento
              </span>
            </div>
            <p className="mt-2 text-sm text-white/50">
              Empresa: {c.company_name} · SyzePay ·{' '}
              {c.enabled ? 'Recepção ativa' : 'Recepção pausada'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {urls[c.id] ? (
                <>
                  <input
                    aria-label={`Webhook de ${c.name}`}
                    readOnly
                    value={urls[c.id]}
                    className="h-11 min-w-48 flex-1 rounded-md border border-white/15 bg-bg px-3 text-xs"
                  />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(urls[c.id]!);
                        toast.success('Webhook copiado.');
                      } catch {
                        toast.error('Selecione a URL e copie manualmente.');
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copiar
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  disabled={reveal.isPending}
                  onClick={() => reveal.mutate(c.id)}
                >
                  Mostrar webhook
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelected(c.id)}>
                Ver eventos
              </Button>
              <Button
                variant="ghost"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ id: c.id, enabled: !c.enabled })}
              >
                {c.enabled ? 'Pausar recepção' : 'Retomar recepção'}
              </Button>
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <h3 className="text-sm font-medium">Produtos → Oferta → Front ou upsell</h3>
              <p className="mt-2 text-sm text-white/45">
                Produto não informado pelo gateway. A classificação abaixo é por pedido, sem
                presumir que todos os produtos da loja são front.
              </p>
            </div>
            <SyzepayOrders connectionId={c.id} />
            <SyzepayFeeForm id={c.id} settings={c.fee_settings ?? {}} />
          </section>
        ))
      )}
      {active && (
        <section className="rounded-lg border border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Eventos recebidos · {active.name}</h2>
            <Button
              variant="ghost"
              onClick={() => {
                void receipts.refetch();
                void connections.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
          {receipts.isError ? (
            <p role="alert" className="mt-3 text-red-300">
              Falha ao carregar eventos. Tente atualizar.
            </p>
          ) : receipts.isLoading ? (
            <p className="mt-3 text-white/50">Carregando eventos…</p>
          ) : !receipts.data?.receipts.length ? (
            <p className="mt-3 text-white/50">Nenhum evento recebido ainda.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/50">
                  <tr>
                    <th className="py-2">Recebido</th>
                    <th>Formato</th>
                    <th>Reenvios</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.data.receipts.map((r) => (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="py-3">
                        {new Date(r.received_at).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </td>
                      <td>
                        {r.content_type} · {r.body_bytes} bytes
                      </td>
                      <td>{r.attempts - 1}</td>
                      <td className="text-amber-200">
                        {r.state === 'processed'
                          ? 'Processado'
                          : r.state === 'ignored'
                            ? 'Sem efeito financeiro'
                            : r.state === 'quarantined'
                              ? 'Requer revisão'
                              : 'Aguardando classificação'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-white/40">
                Últimos 50 eventos. Reenvios são agrupados por event.id. Sem ele, preservamos
                alterações do pedido para não perder reembolsos ou renovações.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
