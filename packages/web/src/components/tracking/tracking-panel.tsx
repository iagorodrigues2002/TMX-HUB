'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, Copy, ExternalLink, Loader2, Radio } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

export function TrackingPanel({ offerId, canManage }: { offerId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [secretWebhook, setSecretWebhook] = useState('');
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelToken, setPixelToken] = useState('');
  const [testEventCode, setTestEventCode] = useState('');
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
      setSecretWebhook(result.vendepay_webhook_url);
      void queryClient.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void queryClient.invalidateQueries({ queryKey: ['tracking-summary', offerId] });
      toast.success('Tracking Vendepay criado.');
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
  const savePixel = useMutation({
    mutationFn: () =>
      apiClient.saveMetaPixel(offerId, {
        name: pixelName.trim(),
        pixel_id: pixelId.trim(),
        access_token: pixelToken.trim(),
        ...(testEventCode.trim() ? { test_event_code: testEventCode.trim() } : {}),
      }),
    onSuccess: () => {
      setPixelName('');
      setPixelId('');
      setPixelToken('');
      setTestEventCode('');
      void queryClient.invalidateQueries({ queryKey: ['tracking-meta-pixels', offerId] });
      toast.success('Pixel Meta validado e salvo.');
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
        <Button asChild variant="outline" size="sm">
          <Link href="/help/tracking-vendepay">
            Guia de configuração <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
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
                  <p className="hud-label">Meta Conversions API</p>
                  <p className="mt-1 text-xs text-white/40">
                    {pixels.data?.pixels.length ?? 0} pixel(is) ativo(s)
                  </p>
                </div>
              </div>
              {pixels.data?.pixels.map((pixel) => (
                <div
                  key={pixel.id}
                  className="mt-3 flex items-center justify-between rounded border border-white/[0.06] px-3 py-2 text-xs"
                >
                  <span className="text-white/70">{pixel.name}</span>
                  <code className="text-cyan-200/70">{pixel.pixel_id}</code>
                </div>
              ))}
              {canManage && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
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
                      !pixelToken.trim() ||
                      savePixel.isPending
                    }
                  >
                    {savePixel.isPending ? 'Validando no Meta…' : 'Adicionar pixel'}
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
