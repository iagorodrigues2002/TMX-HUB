'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Network } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function FunnelInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(4);
  const [maxPages, setMaxPages] = useState(12);
  const [submitting, setSubmitting] = useState(false);

  const validate = (u: string) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(url)) {
      toast.error('Cole uma URL http(s) válida.');
      return;
    }
    setSubmitting(true);
    try {
      const job = await apiClient.createFunnelJob({
        url,
        max_depth: maxDepth,
        max_pages: maxPages,
      });
      toast.success('Crawler iniciado');
      router.push(`/tools/funnel-clone/jobs/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="funnel-url" className="hud-label">
          URL inicial do funil (front)
        </Label>
        <Input
          id="funnel-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com/oferta"
          disabled={submitting}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="hud-label">Profundidade máxima</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            disabled={submitting}
          />
          <p className="text-[11px] text-white/40">
            Quantos cliques de distância do front (1 = só front e upsells diretos).
          </p>
        </div>
        <div className="space-y-2">
          <Label className="hud-label">Limite de páginas</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={submitting}
          />
          <p className="text-[11px] text-white/40">
            Trava de segurança. Máximo 30 pra evitar crawl infinito.
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
            <Network className="h-4 w-4" />
            Descobrir e clonar funil
          </>
        )}
      </Button>
    </form>
  );
}
