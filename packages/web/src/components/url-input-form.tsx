'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import type { InspectResult, LinkReplacement } from '@page-cloner/shared';
import { Box, Globe, Loader2, Search, Sparkles, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { InspectionPanel } from './inspection-panel';

type Step = 'idle' | 'inspecting' | 'inspected' | 'cloning';

export function UrlInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [renderJs, setRenderJs] = useState(true);
  const [inlineAssets, setInlineAssets] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const validateUrl = (value: string): string | null => {
    const normalized = /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    try {
      new URL(normalized);
      setUrlError('');
      return normalized;
    } catch {
      setUrlError('Digite uma URL http(s) válida.');
      return null;
    }
  };

  const handleInspect = async () => {
    const normalizedUrl = validateUrl(url);
    if (!normalizedUrl) return;
    setUrl(normalizedUrl);
    setStep('inspecting');
    abortRef.current = new AbortController();
    try {
      const result = await apiClient.inspectPage(normalizedUrl, abortRef.current.signal);
      setInspectResult(result);
      setStep('inspected');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      toast.error((err as Error).message);
      setStep('idle');
    }
  };

  const handleClone = async (opts: {
    linkReplacements: LinkReplacement[];
    keepScriptSrcs: string[];
  }) => {
    setStep('cloning');
    try {
      const job = await apiClient.createClone({
        url,
        options: {
          renderMode: renderJs ? 'js' : 'static',
          inlineAssets,
          escalation: 'auto',
          linkReplacements: opts.linkReplacements.length ? opts.linkReplacements : undefined,
          keepScriptSrcs: opts.keepScriptSrcs.length ? opts.keepScriptSrcs : undefined,
        },
      });
      toast.success('Clone iniciado');
      router.push(`/tools/cloner/jobs/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setStep('inspected');
    }
  };

  const handleCloneDirect = async () => {
    const normalizedUrl = validateUrl(url);
    if (!normalizedUrl) return;
    setUrl(normalizedUrl);
    setStep('cloning');
    try {
      const job = await apiClient.createClone({
        url: normalizedUrl,
        options: {
          renderMode: renderJs ? 'js' : 'static',
          inlineAssets,
          escalation: 'auto',
        },
      });
      toast.success('Clone iniciado');
      router.push(`/tools/cloner/jobs/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setStep('idle');
    }
  };

  if ((step === 'inspected' || step === 'cloning') && inspectResult) {
    return (
      <InspectionPanel
        result={inspectResult}
        onClone={handleClone}
        onCancel={() => setStep('idle')}
        submitting={step === 'cloning'}
      />
    );
  }

  const busy = step === 'inspecting' || step === 'cloning';

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="url">URL da página</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/70" />
          <Input
            id="url"
            type="url"
            placeholder="HTTPS://EXEMPLO.COM/PAGINA"
            autoComplete="off"
            spellCheck={false}
            className="h-12 pl-11 text-[14px]"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) validateUrl(e.target.value);
            }}
            disabled={busy}
          />
        </div>
        {urlError && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-300">
            {urlError}
          </p>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Opções
        </legend>
        <label
          htmlFor="render-js"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.025]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-300/[0.07] text-cyan-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white/85">
              Renderização inteligente
            </span>
            <span className="block text-xs text-white/40">
              Executa JavaScript para capturar SPAs e conteúdo dinâmico
            </span>
          </span>
          <Checkbox
            id="render-js"
            checked={renderJs}
            onChange={(e) => setRenderJs(e.target.checked)}
            disabled={busy}
          />
        </label>
        <label
          htmlFor="inline-assets"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.025]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/60">
            <Box className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white/85">Pacote independente</span>
            <span className="block text-xs text-white/40">
              Incorpora imagens, estilos e fontes diretamente no clone
            </span>
          </span>
          <Checkbox
            id="inline-assets"
            checked={inlineAssets}
            onChange={(e) => setInlineAssets(e.target.checked)}
            disabled={busy}
          />
        </label>
      </fieldset>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={handleInspect}
          disabled={busy || !url}
          size="lg"
          className="w-full gap-2"
        >
          {step === 'inspecting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Inspecionando…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Inspecionar e configurar
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={handleCloneDirect}
          disabled={busy || !url}
          className="w-full text-center text-[11px] text-white/35 transition hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {step === 'cloning' ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Clonando…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Clonagem rápida sem inspeção
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
