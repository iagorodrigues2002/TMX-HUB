'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type TikTokDestination, type TikTokDestinationInput } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const empty: TikTokDestinationInput = { name: '', pixel_code: '', access_token: '', enabled: true };

export function TikTokDestinations({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const key = ['tiktok-destinations', offerId];
  const [form, setForm] = useState<TikTokDestinationInput>(empty);
  const [editing, setEditing] = useState<TikTokDestination | null>(null);
  const [testCode, setTestCode] = useState<Record<string, string>>({});
  const [testDelivery, setTestDelivery] = useState<string | null>(null);
  const destinations = useQuery({
    queryKey: key,
    queryFn: () => apiClient.tiktokDestinations(offerId),
    retry: false,
  });
  const delivery = useQuery({
    queryKey: ['tiktok-delivery', offerId, testDelivery],
    queryFn: () => apiClient.tiktokDelivery(offerId, testDelivery!),
    enabled: Boolean(testDelivery),
    refetchInterval: (query) =>
      ['pending', 'processing', 'test'].includes(query.state.data?.delivery.state ?? '')
        ? 1500
        : false,
  });
  useEffect(() => {
    if (delivery.data?.delivery.state === 'delivered')
      toast.success(
        'TikTok confirmou o evento de teste. Confira também a aba Test Events no Events Manager.',
      );
  }, [delivery.data?.delivery.state]);
  const save = useMutation({
    mutationFn: () => apiClient.saveTikTokDestination(offerId, form, editing?.id),
    onSuccess: () => {
      setForm(empty);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: key });
      toast.success('Pixel TikTok salvo com credencial protegida.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteTikTokDestination(offerId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const test = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiClient.testTikTokDestination(offerId, id, code),
    onSuccess: (result) => {
      setTestDelivery(result.delivery_id);
      toast.message('Teste enviado. Aguardando confirmação da Events API…');
    },
  });
  const edit = (d: TikTokDestination) => {
    setEditing(d);
    setForm({ name: d.name, pixel_code: d.pixel_code, access_token: '', enabled: d.enabled });
  };
  return (
    <section className="space-y-5" aria-label="Destinos TikTok Ads">
      <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/5 p-4 text-sm text-fuchsia-50">
        <p className="font-medium">Pixel + Events API · entrega resiliente</p>
        <p className="mt-1 text-white/60">
          O TMX instala o Pixel no navegador para PageView e InitiateCheckout, e envia somente
          compras front aprovadas pela Events API. O clique <code>ttclid</code>, quando presente,
          segue com a venda sem redirect. Upsells permanecem no financeiro e não inflam a
          otimização de CPA.
        </p>
      </div>
      {destinations.isPending ? (
        <p>Carregando pixels TikTok…</p>
      ) : destinations.isError ? (
        <p role="alert" className="text-rose-200">
          Não foi possível carregar os pixels TikTok.
        </p>
      ) : (
        <div className="space-y-3">
          {destinations.data.destinations.map((d) => (
            <article key={d.id} className="rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-medium">{d.name}</h3>
                  <p className="mt-1 font-mono text-xs text-white/55">Pixel {d.pixel_code}</p>
                </div>
                <span className={d.enabled ? 'text-xs text-emerald-200' : 'text-xs text-amber-200'}>
                  {d.enabled ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <p className="mt-3 text-xs text-white/50">
                7 dias: {d.delivered_7d}/{d.deliveries_7d} entregas · última confirmação:{' '}
                {d.last_delivered_at
                  ? new Date(d.last_delivered_at).toLocaleString('pt-BR')
                  : 'nenhuma'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => edit(d)}>Editar</Button>
                <Button disabled={remove.isPending} onClick={() => remove.mutate(d.id)}>
                  Remover
                </Button>
              </div>
              <div className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.03] p-3">
                <label className="text-xs text-white/65">
                  Código de teste do TikTok Events Manager
                  <Input
                    value={testCode[d.id] ?? ''}
                    onChange={(e) => setTestCode((s) => ({ ...s, [d.id]: e.target.value }))}
                    placeholder="Cole o Test Event Code"
                    className="mt-2"
                  />
                </label>
                <Button
                  className="mt-2"
                  disabled={!testCode[d.id]?.trim() || test.isPending}
                  onClick={() => test.mutate({ id: d.id, code: testCode[d.id]! })}
                >
                  {test.isPending ? 'Enviando…' : 'Testar sem venda real'}
                </Button>
              </div>
            </article>
          ))}
          {!destinations.data.destinations.length && (
            <p className="text-sm text-white/55">Nenhum pixel TikTok configurado nesta oferta.</p>
          )}
        </div>
      )}
      {testDelivery && (
        <div
          role="status"
          className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm"
        >
          <p className="font-medium">Teste Events API</p>
          <p className="mt-1">
            {delivery.isPending
              ? 'Consultando entrega…'
              : delivery.data
                ? `${delivery.data.delivery.state === 'delivered' ? 'Confirmado pelo TikTok' : `Estado: ${delivery.data.delivery.state}`} · HTTP ${delivery.data.delivery.response_status ?? '—'}${delivery.data.delivery.last_error ? ` · ${delivery.data.delivery.last_error}` : ''}`
                : 'Aguardando fila.'}
          </p>
          <p className="mt-2 text-xs text-white/55">
            Use este mesmo código na aba <em>Test Events</em> do Events Manager. O teste não cria
            compra nem altera métricas da campanha.
          </p>
        </div>
      )}
      <form
        className="space-y-4 rounded-xl border border-white/10 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h3 className="font-medium">
          {editing ? 'Editar pixel TikTok' : 'Adicionar pixel TikTok'}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            Nome interno
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="TikTok · PJR · Conta 1"
              className="mt-2"
            />
          </label>
          <label className="text-sm">
            Pixel Code
            <Input
              required
              value={form.pixel_code}
              onChange={(e) => setForm({ ...form, pixel_code: e.target.value })}
              placeholder="Ex.: C123…"
              className="mt-2"
            />
          </label>
          <label className="text-sm">
            Access Token
            <input
              required
              type="password"
              value={form.access_token}
              onChange={(e) => setForm({ ...form, access_token: e.target.value })}
              placeholder="Token da Events API"
              className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />{' '}
          Ativar envio de novas compras front
        </label>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar pixel'}
        </Button>
        {editing && (
          <Button
            type="button"
            className="ml-2"
            onClick={() => {
              setEditing(null);
              setForm(empty);
            }}
          >
            Cancelar
          </Button>
        )}
      </form>
      {(save.isError || test.isError) && (
        <p role="alert" className="text-sm text-rose-200">
          {String((save.error || test.error)?.message ?? 'Não foi possível concluir a operação.')}
        </p>
      )}
    </section>
  );
}
