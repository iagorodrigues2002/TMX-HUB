'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
type Order = Awaited<ReturnType<typeof apiClient.syzeOrders>>['orders'][number];
function OrderClassification({
  connectionId,
  order,
  offers,
}: { connectionId: string; order: Order; offers: Array<{ id: string; name: string }> }) {
  const [offer, setOffer] = useState(order.mapping?.offer_id ?? order.hint_offer_id ?? '');
  const [kind, setKind] = useState(order.mapping?.order_kind ?? '');
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => apiClient.syzeClassify(connectionId, order.order_id, offer, kind),
    onSuccess: (r) => {
      toast.success(
        r.duplicate
          ? 'Pedido já registrado. Nenhum envio duplicado.'
          : `Pedido registrado. ${r.meta.length} envio(s) Meta e ${r.utmify.length} UTMify na fila.`,
      );
      void qc.invalidateQueries({ queryKey: ['syzepay-orders', connectionId] });
      void qc.invalidateQueries({ queryKey: ['syzepay-connections'] });
      void qc.invalidateQueries({ queryKey: ['syzepay-receipts', connectionId] });
      void qc.invalidateQueries({ queryKey: ['overview-financial'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const input = 'h-11 rounded-md border border-white/15 bg-bg px-3 text-sm';
  return (
    <article className="border-t border-white/10 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: order.currency }).format(
              order.amount_minor / 100,
            )}
          </p>
          <p className="mt-1 break-all text-xs text-white/45">Pedido {order.order_id}</p>
          <p className="mt-1 text-xs text-white/45">
            {[...new Set(order.types)].join(' + ')} · um único pedido
          </p>
        </div>
        <span
          className={order.signature_valid ? 'text-xs text-emerald-200' : 'text-xs text-amber-200'}
        >
          {order.signature_valid ? 'Assinatura validada' : 'Configure/verifique o secret'}
        </span>
      </div>
      {order.status === 'processed' ? (
        <p className="mt-3 text-sm text-emerald-200">
          Registrado: {offers.find((o) => o.id === order.mapping?.offer_id)?.name ?? 'Oferta'} ·{' '}
          {order.mapping?.order_kind}. Os envios podem ser acompanhados nas integrações da oferta.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            aria-label={`Oferta do pedido ${order.order_id}`}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            className={`${input} min-w-48 flex-1`}
          >
            <option value="">Selecionar oferta</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            aria-label={`Etapa do pedido ${order.order_id}`}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={input}
          >
            <option value="">Selecionar etapa</option>
            <option value="front">Front</option>
            <option value="upsell">Upsell 1</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={`upsell_${n}`}>
                Upsell {n}
              </option>
            ))}
          </select>
          <Button
            disabled={
              !offer ||
              !kind ||
              !order.signature_valid ||
              !order.types.includes('order.paid') ||
              save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Processando…' : 'Classificar e processar'}
          </Button>
        </div>
      )}
    </article>
  );
}
export function SyzepayOrders({ connectionId }: { connectionId: string }) {
  const qc = useQueryClient();
  const [secret, setSecret] = useState('');
  const query = useQuery({
    queryKey: ['syzepay-orders', connectionId],
    queryFn: () => apiClient.syzeOrders(connectionId),
    retry: false,
    refetchInterval: 15000,
  });
  const saveSecret = useMutation({
    mutationFn: () => apiClient.syzeSigningSecret(connectionId, secret),
    onSuccess: () => {
      setSecret('');
      void qc.invalidateQueries({ queryKey: ['syzepay-orders', connectionId] });
      toast.success('Secret guardado criptografado.');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <h3 className="text-sm font-semibold">Classificar pagamentos</h3>
      <p className="mt-2 text-sm text-white/50">
        A SyzePay ainda não informa o ID do produto. Associe cada pedido à oferta e etapa. Somente
        order.paid aprovado gera venda; order.created e reenvios não duplicam a compra.
      </p>
      {query.isError ? (
        <p role="alert" className="mt-3 text-red-300">
          Não foi possível carregar os pedidos.{' '}
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </p>
      ) : query.isLoading ? (
        <p className="mt-3 text-white/45">Carregando pedidos…</p>
      ) : (
        <>
          {!query.data?.signing_secret_configured && (
            <form
              className="mt-4 flex flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveSecret.mutate();
              }}
            >
              <input
                aria-label="Secret de assinatura SyzePay"
                type="password"
                autoComplete="new-password"
                required
                minLength={16}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Cole o secret da SyzePay"
                className="h-11 min-w-56 flex-1 rounded-md border border-white/15 bg-bg px-3 text-sm"
              />
              <Button type="submit" disabled={saveSecret.isPending}>
                Salvar secret
              </Button>
            </form>
          )}
          {!query.data?.orders.length ? (
            <p className="mt-4 text-sm text-white/45">
              Nenhum pagamento SyzePay recebido. Testes internos de recepção não aparecem aqui.
            </p>
          ) : (
            query.data.orders.map((order) => (
              <OrderClassification
                key={order.order_id}
                connectionId={connectionId}
                order={order}
                offers={query.data!.offers}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
