'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, Copy, Loader2, Pencil, Radio, Send, ShoppingCart, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const META_URL_PARAMETERS =
  'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}';

export function TrackingPanel({ offerId, canManage }: { offerId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [secretWebhook, setSecretWebhook] = useState('');
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelToken, setPixelToken] = useState('');
  const [testEventCode, setTestEventCode] = useState('');
  const [editingPixelId, setEditingPixelId] = useState<string | null>(null);
  const [pixelTestCodes, setPixelTestCodes] = useState<Record<string, string>>({});
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['tracking-summary', offerId],
    queryFn: () => apiClient.getTrackingSummary(offerId),
    enabled: Boolean(config.data?.configured),
    refetchInterval: 30_000,
    retry: false,
  });
  const pixels = useQuery({
    queryKey: ['tracking-meta-pixels', offerId],
    queryFn: () => apiClient.listMetaPixels(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
  });
  const setup = useMutation({
    mutationFn: () => apiClient.setupTracking(offerId),
    onSuccess: (result) => {
      if (result.vendepay_webhook_url) setSecretWebhook(result.vendepay_webhook_url);
      void queryClient.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void queryClient.invalidateQueries({ queryKey: ['tracking-summary', offerId] });
      toast.success(
        result.already_configured
          ? 'Tracking existente recuperado sem criar duplicidade.'
          : 'Tracking Vendepay criado.',
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const rotate = useMutation({
    mutationFn: () => apiClient.rotateVendepayWebhook(offerId),
    onSuccess: (result) => {
      setSecretWebhook(result.vendepay_webhook_url);
      toast.success('URL do webhook renovada. Atualize-a na Vendepay.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const savePixel = useMutation<
    | { updated: true }
    | {
        updated: false;
        verification: 'verified' | 'pending_event_test';
        verification_warning?: string;
        backfill_queued: number;
      }
  >({
    mutationFn: () => {
      const input = {
        name: pixelName.trim(),
        pixel_id: pixelId.trim(),
        ...(pixelToken.trim() ? { access_token: pixelToken.trim() } : {}),
        test_event_code: testEventCode.trim() || null,
      };
      if (editingPixelId) {
        return apiClient
          .updateMetaPixel(offerId, editingPixelId, input)
          .then(() => ({ updated: true as const }));
      }
      return apiClient
        .saveMetaPixel(offerId, {
          name: input.name,
          pixel_id: input.pixel_id,
          access_token: pixelToken.trim(),
          ...(input.test_event_code ? { test_event_code: input.test_event_code } : {}),
        })
        .then((result) => ({ updated: false as const, ...result }));
    },
    onSuccess: (result) => {
      setPixelName('');
      setPixelId('');
      setPixelToken('');
      setTestEventCode('');
      setEditingPixelId(null);
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      if (result.updated) {
        toast.success('Pixel atualizado. O token anterior foi preservado quando deixado em branco.');
        return;
      }
      if (result.verification === 'verified') {
        toast.success(
          `Pixel Meta validado. ${result.backfill_queued} conversão(ões) recente(s) enviada(s) para popular o pixel.`,
        );
      } else {
        toast.warning(
          `${result.verification_warning ?? 'Pixel salvo. Faça um envio em Test Events.'} ${result.backfill_queued} conversão(ões) recente(s) foram enfileiradas.`,
        );
      }
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const sendTestEvent = useMutation({
    mutationFn: ({
      pixelId,
      eventName,
    }: {
      pixelId: string;
      eventName: 'InitiateCheckout' | 'Purchase';
    }) => apiClient.sendMetaTestEvent(offerId, pixelId, eventName),
    onSuccess: (result) =>
      toast.success(
        `${result.event_name} aceito pela Meta (${result.events_received} evento recebido).`,
      ),
    onError: (error) => toast.error((error as Error).message),
  });
  const updateTestEventCode = useMutation({
    mutationFn: ({ pixelId, code }: { pixelId: string; code: string }) =>
      apiClient.updateMetaTestEventCode(offerId, pixelId, code),
    onSuccess: (_, variables) => {
      setPixelTestCodes((current) => ({ ...current, [variables.pixelId]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      toast.success('Test Event Code salvo. Os botões de teste estão liberados.');
    },
    onError: (error) => toast.error((error as Error).message),
  });
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success('Copiado.');
  };

  return (
    <section className="mb-6 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-300" />
            <p className="hud-label">Tracking Vendepay</p>
          </div>
          <p className="mt-2 text-sm text-white/55">
            Jornada first-party, atribuição pelo parâmetro{' '}
            <code className="text-cyan-200">src</code> e envio server-side.
          </p>
        </div>
      </div>

      {config.isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando tracking…
        </div>
      ) : !config.data?.configured ? (
        <div className="mt-5 rounded-md border border-white/[0.08] bg-black/10 p-4">
          <p className="text-sm text-white/65">Esta oferta ainda não possui tracking próprio.</p>
          {canManage && (
            <Button className="mt-3" onClick={() => setup.mutate()} disabled={setup.isPending}>
              {setup.isPending ? 'Criando…' : 'Criar configuração'}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ['Visitas', summary.data?.page_views ?? 0],
              ['Checkouts', summary.data?.checkouts ?? 0],
              ['Pagas', summary.data?.paid_orders ?? 0],
              ['Órfãs', summary.data?.orphan_orders ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/[0.07] bg-black/10 p-3">
                <p className="hud-label">{label}</p>
                <p className="mt-1 font-mono text-xl text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <p className="hud-label">Código de instalação</p>
              <div className="mt-1 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-black/30 p-3 text-[11px] text-cyan-100">
                  {config.data.project?.install_code}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(config.data?.project?.install_code ?? '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <p className="hud-label">Parâmetros da URL · Meta Ads</p>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Cole em “Parâmetros da URL” no anúncio. O Meta substituirá as macros e o TMX
                preservará os valores até a Vendepay.
              </p>
              <div className="mt-2 flex gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-black/30 p-3 text-[11px] text-cyan-100">
                  {META_URL_PARAMETERS}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar parâmetros da URL do Meta"
                  onClick={() => copy(META_URL_PARAMETERS)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {secretWebhook && (
              <div className="rounded-md border border-amber-300/20 bg-amber-300/[0.04] p-3">
                <p className="text-xs font-medium text-amber-200">
                  Copie agora: esta URL secreta não será mostrada novamente.
                </p>
                <div className="mt-2 flex gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto text-[11px] text-white/70">
                    {secretWebhook}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copy(secretWebhook)}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
              <span className="flex items-center gap-1 text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Vendepay configurada
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> atualização a cada 30s
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => rotate.mutate()}
                  disabled={rotate.isPending}
                >
                  Gerar nova URL do webhook
                </Button>
              )}
            </div>
            <div className="rounded-md border border-white/[0.08] bg-black/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="hud-label">Meta Conversions API · múltiplos pixels</p>
                  <p className="mt-1 text-xs text-white/40">
                    {pixels.data?.pixels.length ?? 0} pixel(is) ativo(s)
                  </p>
                </div>
              </div>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/45">
                Cada IC e venda elegível é enviado via CAPI para todos os pixels ativos desta
                oferta. Ao adicionar outro pixel, o TMX também envia automaticamente as conversões
                dos últimos sete dias, com deduplicação independente por pixel.
              </p>
              {pixels.data?.pixels.map((pixel) => (
                <div
                  key={pixel.id}
                  className="mt-3 rounded border border-white/[0.06] px-3 py-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-white/70">{pixel.name}</span>
                    <div className="flex items-center gap-2">
                      <code className="text-cyan-200/70">{pixel.pixel_id}</code>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5"
                          onClick={() => {
                            setEditingPixelId(pixel.id);
                            setPixelName(pixel.name);
                            setPixelId(pixel.pixel_id);
                            setPixelToken('');
                            setTestEventCode(pixel.test_event_code ?? '');
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          className="h-9 flex-1"
                          value={pixelTestCodes[pixel.id] ?? ''}
                          onChange={(event) =>
                            setPixelTestCodes((current) => ({
                              ...current,
                              [pixel.id]: event.target.value,
                            }))
                          }
                          placeholder={
                            pixel.test_event_code
                              ? `Código atual: ${pixel.test_event_code}`
                              : 'Cole o Test Event Code da Meta'
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !(pixelTestCodes[pixel.id] ?? '').trim() ||
                            updateTestEventCode.isPending
                          }
                          onClick={() =>
                            updateTestEventCode.mutate({
                              pixelId: pixel.id,
                              code: (pixelTestCodes[pixel.id] ?? '').trim(),
                            })
                          }
                        >
                          {updateTestEventCode.isPending ? 'Salvando…' : 'Salvar código'}
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!pixel.test_event_code || sendTestEvent.isPending}
                        onClick={() =>
                          sendTestEvent.mutate({
                            pixelId: pixel.id,
                            eventName: 'InitiateCheckout',
                          })
                        }
                      >
                        {sendTestEvent.isPending ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-3.5 w-3.5" />
                        )}
                        Testar Initiate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!pixel.test_event_code || sendTestEvent.isPending}
                        onClick={() =>
                          sendTestEvent.mutate({
                            pixelId: pixel.id,
                            eventName: 'Purchase',
                          })
                        }
                      >
                        {sendTestEvent.isPending ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShoppingCart className="mr-2 h-3.5 w-3.5" />
                        )}
                        Testar venda
                      </Button>
                      {!pixel.test_event_code && (
                        <span className="text-amber-200/65">
                          Cole e salve o código acima para habilitar os testes.
                        </span>
                      )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {canManage && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {editingPixelId && (
                    <div className="md:col-span-2 flex items-center justify-between rounded-md border border-cyan-300/20 bg-cyan-300/[0.05] px-3 py-2 text-xs text-cyan-100">
                      <span>Editando pixel existente · deixe o token vazio para manter o atual.</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1"
                        onClick={() => {
                          setEditingPixelId(null);
                          setPixelName('');
                          setPixelId('');
                          setPixelToken('');
                          setTestEventCode('');
                        }}
                      >
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </Button>
                    </div>
                  )}
                  <Input
                    value={pixelName}
                    onChange={(event) => setPixelName(event.target.value)}
                    placeholder="Nome do pixel"
                  />
                  <Input
                    value={pixelId}
                    onChange={(event) => setPixelId(event.target.value)}
                    placeholder="Pixel ID"
                    inputMode="numeric"
                  />
                  <Input
                    value={pixelToken}
                    onChange={(event) => setPixelToken(event.target.value)}
                    placeholder="Token da Conversions API"
                    type="password"
                  />
                  <Input
                    value={testEventCode}
                    onChange={(event) => setTestEventCode(event.target.value)}
                    placeholder="Test Event Code (opcional)"
                  />
                  <Button
                    className="md:col-span-2"
                    onClick={() => savePixel.mutate()}
                    disabled={
                      !pixelName.trim() ||
                      !pixelId.trim() ||
                      (!editingPixelId && !pixelToken.trim()) ||
                      savePixel.isPending
                    }
                  >
                    {savePixel.isPending
                      ? 'Validando no Meta…'
                      : editingPixelId
                        ? 'Salvar alterações do pixel'
                      : (pixels.data?.pixels.length ?? 0) > 0
                        ? 'Adicionar outro pixel'
                        : 'Adicionar pixel'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
