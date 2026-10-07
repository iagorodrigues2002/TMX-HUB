'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { type TikTokDestination, type TikTokDestinationInput, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const TIKTOK_TEST_EVENTS_DOCS =
  'https://business-api.tiktok.com/portal/docs?id=1799004129683458#item-link-Verify%20TikTok%20Events%20API%20Setup';
const empty: TikTokDestinationInput = {
  name: '',
  pixel_code: '',
  access_token: '',
  test_event_code: null,
  enabled: true,
};
type TikTokTestContext = { code: string; eventUrl: string; email: string; phone: string };
const emptyTest: TikTokTestContext = { code: '', eventUrl: '', email: '', phone: '' };

export function TikTokDestinations({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const key = ['tiktok-destinations', offerId];
  const [form, setForm] = useState<TikTokDestinationInput>(empty);
  const [editing, setEditing] = useState<TikTokDestination | null>(null);
  const [testContext, setTestContext] = useState<Record<string, TikTokTestContext>>({});
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
    mutationFn: () =>
      apiClient.saveTikTokDestination(
        offerId,
        { ...form, test_event_code: form.test_event_code?.trim() || null },
        editing?.id,
      ),
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
    mutationFn: ({ id, context }: { id: string; context: TikTokTestContext }) =>
      apiClient.testTikTokDestination(offerId, id, {
        test_event_code: context.code,
        ...(context.eventUrl.trim() ? { event_url: context.eventUrl.trim() } : {}),
        ...(context.email.trim() ? { email: context.email.trim() } : {}),
        ...(context.phone.trim() ? { phone: context.phone.trim() } : {}),
      }),
    onSuccess: (result) => {
      setTestDelivery(result.delivery_id);
      toast.success('Evento enviado. Aguardando confirmação da Events API…');
    },
  });
  const edit = (d: TikTokDestination) => {
    setEditing(d);
    setForm({
      name: d.name,
      pixel_code: d.pixel_code,
      access_token: '',
      test_event_code: d.test_event_code,
      enabled: d.enabled,
    });
  };
  return (
    <section className="space-y-5" aria-label="Destinos TikTok Ads">
      <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/5 p-4 text-sm text-fuchsia-50">
        <p className="font-medium">Pixel + Events API · entrega resiliente</p>
        <p className="mt-1 text-white/60">
          O TMX instala o Pixel no navegador para PageView e InitiateCheckout, e envia somente
          compras front aprovadas pela Events API. O clique <code>ttclid</code>, quando presente,
          segue com a venda sem redirect. Upsells permanecem no financeiro e não inflam a otimização
          de CPA.
        </p>
      </div>
      {destinations.isPending ? (
        <DataState className="min-h-64" variant="loading" title="Carregando pixels TikTok…" />
      ) : destinations.isError ? (
        <p role="alert" className="text-rose-200">
          Não foi possível carregar os pixels TikTok.
        </p>
      ) : (
        <div className="space-y-3">
          {destinations.data.destinations.map((d) => (
            <article key={d.id} className="rounded-xl border border-white/10 p-4">
              {(() => {
                const savedTestContext = { ...emptyTest, code: d.test_event_code ?? '' };
                const context = testContext[d.id] ?? savedTestContext;
                const setContext = (patch: Partial<TikTokTestContext>) =>
                  setTestContext((current) => ({
                    ...current,
                    [d.id]: { ...(current[d.id] ?? savedTestContext), ...patch },
                  }));
                return (
                  <>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{d.name}</h3>
                        <p className="mt-1 font-mono text-xs text-white/55">Pixel {d.pixel_code}</p>
                      </div>
                      <span
                        className={
                          d.enabled ? 'text-xs text-emerald-200' : 'text-xs text-amber-200'
                        }
                      >
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
                      <label htmlFor={`tiktok-test-code-${d.id}`} className="text-xs text-white/65">
                        Test Event Code
                        <Input
                          id={`tiktok-test-code-${d.id}`}
                          value={context.code}
                          onChange={(e) => setContext({ code: e.target.value })}
                          placeholder="Ex.: TMX_TEST_123"
                          className="mt-2"
                        />
                      </label>
                      <p className="mt-2 text-xs leading-5 text-white/55">
                        Opcional. Cole o código criado no TikTok Events Manager &gt; Test Events pra
                        validar eventos em modo teste.{' '}
                        <a
                          href={TIKTOK_TEST_EVENTS_DOCS}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 hover:text-cyan-100"
                        >
                          Ver documentação do TikTok
                        </a>
                        .
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label
                          htmlFor={`tiktok-event-url-${d.id}`}
                          className="text-xs text-white/65"
                        >
                          URL real da página (recomendado)
                          <Input
                            id={`tiktok-event-url-${d.id}`}
                            value={context.eventUrl}
                            onChange={(e) => setContext({ eventUrl: e.target.value })}
                            placeholder="https://sua-pagina.com/vsl"
                            className="mt-2"
                          />
                        </label>
                        <label
                          htmlFor={`tiktok-test-email-${d.id}`}
                          className="text-xs text-white/65"
                        >
                          Email de teste (opcional)
                          <Input
                            id={`tiktok-test-email-${d.id}`}
                            type="email"
                            value={context.email}
                            onChange={(e) => setContext({ email: e.target.value })}
                            placeholder="seu@email.com"
                            className="mt-2"
                          />
                        </label>
                        <label
                          htmlFor={`tiktok-test-phone-${d.id}`}
                          className="text-xs text-white/65"
                        >
                          Telefone de teste (opcional)
                          <Input
                            id={`tiktok-test-phone-${d.id}`}
                            value={context.phone}
                            onChange={(e) => setContext({ phone: e.target.value })}
                            placeholder="+55 11 99999-9999"
                            className="mt-2"
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-[11px] leading-4 text-white/45">
                        Email e telefone são enviados apenas como SHA-256 para validar o matching;
                        use dados seus e somente se quiser conferir esses campos no Events Manager.
                      </p>
                      <Button
                        className="mt-2"
                        disabled={!d.enabled || !context.code.trim() || test.isPending}
                        onClick={() => test.mutate({ id: d.id, context })}
                      >
                        {test.isPending ? 'Enviando…' : 'Enviar evento de teste'}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </article>
          ))}
          {!destinations.data.destinations.length && (
            <p className="text-sm text-white/55">Nenhum pixel TikTok configurado nesta oferta.</p>
          )}
        </div>
      )}
      {testDelivery && (
        <output className="block rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm">
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
        </output>
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
        <div className="grid gap-4 md:grid-cols-2">
          <label htmlFor="tiktok-destination-name" className="text-sm">
            Nome interno
            <Input
              id="tiktok-destination-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="TikTok · PJR · Conta 1"
              className="mt-2"
            />
          </label>
          <label htmlFor="tiktok-pixel-code" className="text-sm">
            Pixel Code
            <Input
              id="tiktok-pixel-code"
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
          <div>
            <label htmlFor="tiktok-test-event-code" className="text-sm">
              Test Event Code
            </label>
            <Input
              id="tiktok-test-event-code"
              value={form.test_event_code ?? ''}
              onChange={(e) => setForm({ ...form, test_event_code: e.target.value || null })}
              placeholder="Ex.: TMX_TEST_123"
              className="mt-2"
              aria-describedby="tiktok-test-event-code-help"
            />
            <p id="tiktok-test-event-code-help" className="mt-2 text-xs leading-5 text-white/55">
              Opcional. Cole o código criado no TikTok Events Manager &gt; Test Events pra validar
              eventos em modo teste.{' '}
              <a
                href={TIKTOK_TEST_EVENTS_DOCS}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-cyan-200 underline decoration-cyan-200/40 underline-offset-4 hover:text-cyan-100"
              >
                Ver documentação do TikTok
              </a>
              .
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />{' '}
          Ativar envio de novas compras front
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar pixel'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              !editing || !editing.enabled || !form.test_event_code?.trim() || test.isPending
            }
            onClick={() =>
              editing &&
              test.mutate({
                id: editing.id,
                context: { ...emptyTest, code: form.test_event_code?.trim() ?? '' },
              })
            }
          >
            {test.isPending ? 'Enviando…' : 'Enviar evento de teste'}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>
      {(save.isError || test.isError) && (
        <p role="alert" className="text-sm text-rose-200">
          {String((save.error || test.error)?.message ?? 'Não foi possível concluir a operação.')}
        </p>
      )}
    </section>
  );
}
