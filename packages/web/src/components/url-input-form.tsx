'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Globe, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { InspectResult, LinkReplacement } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const validateUrl = (value: string): boolean => {
    try {
      new URL(value);
      setUrlError('');
      return true;
    } catch {
      setUrlError('Digite uma URL http(s) válida.');
      return false;
    }
  };

  const handleInspect = async () => {
    if (!validateUrl(url)) return;
    setStep('inspecting');
    abortRef.current = new AbortController();
    try {
      const result = await apiClient.inspectPage(url, abortRef.current.signal);
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
    if (!validateUrl(url)) return;
    setStep('cloning');
    try {
      const job = await apiClient.createClone({
        url,
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

      <fieldset className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-4">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Opções
        </legend>
        <label className="flex cursor-pointer items-center gap-3 text-[13px] text-white/75">
          <Checkbox
            checked={renderJs}
            onChange={(e) => setRenderJs(e.target.checked)}
            disabled={busy}
          />
          <span>Executar JavaScript (mais lento, necessário para SPAs)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-[13px] text-white/75">
          <Checkbox
            checked={inlineAssets}
            onChange={(e) => setInlineAssets(e.target.checked)}
            disabled={busy}
          />
          <span>Embutir assets (imagens, CSS, fontes) como data-URIs</span>
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
            'Ou clonar diretamente sem inspecionar'
          )}
        </button>
      </div>
    </div>
  );
}
