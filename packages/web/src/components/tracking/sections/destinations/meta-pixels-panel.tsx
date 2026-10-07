'use client';

import { DestinationFormShell } from '@/components/tracking/sections/destinations/destination-form-shell';
import { DestinationList } from '@/components/tracking/sections/destinations/destination-list';
import { DestinationShell } from '@/components/tracking/sections/destinations/destination-shell';
import { NetworkTrackingCard } from '@/components/tracking/sections/destinations/network-tracking-card';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Send, ShoppingCart, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface MetaPixelsPanelProps {
  offerId: string;
  canManage: boolean;
}

export function MetaPixelsPanel({ offerId, canManage }: MetaPixelsPanelProps) {
  const queryClient = useQueryClient();
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelToken, setPixelToken] = useState('');
  const [testEventCode, setTestEventCode] = useState('');
  const [editingPixelId, setEditingPixelId] = useState<string | null>(null);
  const [pixelTestCodes, setPixelTestCodes] = useState<Record<string, string>>({});
  const [pixelProducts, setPixelProducts] = useState<Record<string, string[]>>({});

  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const pixels = useQuery({
    queryKey: ['tracking-meta-pixels', offerId],
    queryFn: () => apiClient.listMetaPixels(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const productKinds = useQuery({
    queryKey: ['tracking-product-kinds', offerId],
    queryFn: () => apiClient.getTrackingProductKinds(offerId),
    enabled: Boolean(config.data?.configured),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const savePixelProducts = useMutation({
    mutationFn: ({ pixelId, productIds }: { pixelId: string; productIds: string[] }) =>
      apiClient.setMetaPixelProducts(offerId, pixelId, productIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      toast.success('Produtos autorizados para o pixel foram salvos.');
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
        toast.success(
          'Pixel atualizado. O token anterior foi preservado quando deixado em branco.',
        );
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

  if (!config.data?.configured) return null;

  return (
    <DestinationShell
      compact
      title="Pixels Meta"
      description="Configure os pixels que recebem eventos desta oferta pela Conversions API."
      count={pixels.data?.pixels.length ?? 0}
      countLabel="pixels"
    >
      <NetworkTrackingCard className="mb-4" network="meta" />
      <p className="max-w-3xl text-xs leading-5 text-white/45">
        Cada IC e venda elegível é enviado via CAPI para todos os pixels ativos desta oferta. Ao
        adicionar outro pixel, o TMX também envia automaticamente as conversões dos últimos sete
        dias, com deduplicação independente por pixel.
      </p>
      <DestinationList
        className="mt-3"
        isLoading={pixels.isPending}
        error={pixels.error as Error | null}
        empty={!pixels.isPending && !pixels.isError && !pixels.data?.pixels.length}
        loadingTitle="Carregando pixels Meta…"
        emptyTitle="Nenhum pixel Meta configurado nesta oferta."
        emptyDescription="Adicione o primeiro pixel abaixo para começar a enviar eventos pela Conversions API."
        onRetry={() => void pixels.refetch()}
        isRetrying={pixels.isFetching}
      >
        {pixels.data?.pixels.map((pixel) => (
          <article key={pixel.id} className="rounded border border-white/[0.06] px-3 py-3 text-xs">
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
                <div className="rounded border border-white/[0.07] bg-black/10 p-3">
                  <p className="text-xs font-medium text-white/75">
                    Produtos que enviam Purchase para este pixel
                  </p>
                  <p className="mt-1 text-[11px] text-white/40">
                    Sem seleção: todo produto classificado como front. Com seleção: somente os
                    marcados.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {(productKinds.data?.mapped ?? [])
                      .filter((product) => product.kind === 'front')
                      .map((product) => {
                        const chosen = pixelProducts[pixel.id] ?? pixel.product_ids ?? [];
                        return (
                          <label
                            key={product.product_id}
                            className="flex items-center gap-1.5 text-xs text-white/65"
                          >
                            <input
                              type="checkbox"
                              checked={chosen.includes(product.product_id)}
                              onChange={() =>
                                setPixelProducts((current) => ({
                                  ...current,
                                  [pixel.id]: chosen.includes(product.product_id)
                                    ? chosen.filter((id) => id !== product.product_id)
                                    : [...chosen, product.product_id],
                                }))
                              }
                            />
                            {product.label ?? product.product_id}
                          </label>
                        );
                      })}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={savePixelProducts.isPending}
                    onClick={() =>
                      savePixelProducts.mutate({
                        pixelId: pixel.id,
                        productIds: pixelProducts[pixel.id] ?? pixel.product_ids ?? [],
                      })
                    }
                  >
                    {savePixelProducts.isPending ? 'Salvando…' : 'Salvar produtos'}
                  </Button>
                </div>
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
                      !(pixelTestCodes[pixel.id] ?? '').trim() || updateTestEventCode.isPending
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
          </article>
        ))}
      </DestinationList>
      {canManage && (
        <DestinationFormShell
          className="mt-4"
          title={editingPixelId ? 'Editar pixel Meta' : 'Adicionar pixel Meta'}
          description="O Pixel ID identifica o destino; o token permanece protegido e não volta ao navegador."
          onSubmit={(event) => {
            event.preventDefault();
            savePixel.mutate();
          }}
          notice={
            editingPixelId ? (
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
            ) : null
          }
          actions={
            <Button
              type="submit"
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
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <FormField id="meta-pixel-name" label="Nome do pixel">
              <Input
                value={pixelName}
                onChange={(event) => setPixelName(event.target.value)}
                placeholder="Ex.: Pixel principal"
              />
            </FormField>
            <FormField id="meta-pixel-id" label="Pixel ID">
              <Input
                value={pixelId}
                onChange={(event) => setPixelId(event.target.value)}
                placeholder="ID numérico"
                inputMode="numeric"
              />
            </FormField>
            <FormField
              id="meta-pixel-token"
              label="Token da Conversions API"
              help={editingPixelId ? 'Deixe vazio para preservar o token atual.' : undefined}
            >
              <Input
                value={pixelToken}
                onChange={(event) => setPixelToken(event.target.value)}
                placeholder={editingPixelId ? 'Token atual preservado' : 'Token de acesso'}
                type="password"
              />
            </FormField>
            <FormField
              id="meta-test-event-code"
              label="Test Event Code"
              help="Opcional; necessário somente para validar em Test Events."
            >
              <Input
                value={testEventCode}
                onChange={(event) => setTestEventCode(event.target.value)}
                placeholder="TEST12345"
              />
            </FormField>
          </div>
        </DestinationFormShell>
      )}
    </DestinationShell>
  );
}
