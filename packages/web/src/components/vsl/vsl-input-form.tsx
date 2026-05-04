'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function VslInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateUrl(url)) return;
    setSubmitting(true);
    try {
      const job = await apiClient.createVslJob(url);
      toast.success('Análise iniciada');
      router.push(`/tools/vsl/jobs/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="vsl-url" className="hud-label">
          URL da página com a VSL
        </Label>
        <div className="relative">
          <Video className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            id="vsl-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://exemplo.com/oferta"
            className="pl-9"
            disabled={submitting}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'vsl-url-error' : undefined}
          />
        </div>
        {urlError && (
          <p id="vsl-url-error" className="text-[12px] text-red-300">
            {urlError}
          </p>
        )}
        <div className="space-y-1 text-[12px] text-white/40">
          <p>
            Funciona com VTURB, Panda Video, Vimeo, Wistia, JW Player, Hotmart Player, vidalytics e
            qualquer player baseado em HLS/DASH/MP4.
          </p>
          <p className="text-cyan-300/70">
            <strong>Dica:</strong> alguns players só carregam o vídeo quando vêem parâmetros de
            tráfego pago. Cole a URL completa, com <code className="text-white/70">?fbclid=…</code>,{' '}
            <code className="text-white/70">?utm_*</code> ou outros parâmetros que você usaria no
            anúncio.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full" size="lg">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Iniciando…
          </>
        ) : (
          <>
            <Video className="h-4 w-4" />
            Analisar e baixar
          </>
        )}
      </Button>
    </form>
  );
}
