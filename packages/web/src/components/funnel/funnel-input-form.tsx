'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { Gauge, Layers3, Loader2, Network, Route } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export function FunnelInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(4);
  const [maxPages, setMaxPages] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const presets = [
    { label: 'Rápido', hint: 'Até 8 páginas', depth: 2, pages: 8, icon: Gauge },
    { label: 'Completo', hint: 'Até 20 páginas', depth: 4, pages: 20, icon: Layers3 },
    { label: 'Profundo', hint: 'Até 30 páginas', depth: 7, pages: 30, icon: Route },
  ];

  const normalize = (value: string): string | null => {
    const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return candidate;
    } catch {
      return null;
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedUrl = normalize(url);
    if (!normalizedUrl) {
      toast.error('Cole uma URL http(s) válida.');
      return;
    }
    setSubmitting(true);
    try {
      const job = await apiClient.createFunnelJob({
        url: normalizedUrl,
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

      <div className="grid grid-cols-3 gap-2">
        {presets.map(({ label, hint, depth, pages, icon: Icon }) => {
          const active = maxDepth === depth && maxPages === pages;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setMaxDepth(depth);
                setMaxPages(pages);
              }}
              className={`rounded-xl border p-3 text-left transition ${active ? 'border-cyan-300/35 bg-cyan-300/[0.08]' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20'}`}
            >
              <Icon className={`mb-2 h-4 w-4 ${active ? 'text-cyan-300' : 'text-white/45'}`} />
              <span className="block text-sm font-medium text-white/85">{label}</span>
              <span className="text-[10px] text-white/40">{hint}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 rounded-xl border border-white/[0.07] bg-black/15 p-4 md:grid-cols-2">
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
