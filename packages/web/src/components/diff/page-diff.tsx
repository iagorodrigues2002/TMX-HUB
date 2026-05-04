'use client';

import { useState } from 'react';
import { GitCompare, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SELECT =
  'flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40';

export function PageDiff() {
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  const [renderMode, setRenderMode] = useState<'static' | 'js'>('js');
  const [filter, setFilter] = useState<'all' | 'changed'>('changed');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof apiClient.pageDiff>> | null>(null);

  const validate = (u: string) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(urlA) || !validate(urlB)) {
      toast.error('Cole duas URLs válidas (com http/https).');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const out = await apiClient.pageDiff({ url_a: urlA, url_b: urlB, render_mode: renderMode });
      setResult(out);
      toast.success(
        `Diff pronto: +${out.summary.added} / -${out.summary.removed} (${out.duration_ms}ms)`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const visibleEntries = result
    ? filter === 'changed'
      ? result.entries.filter((e) => e.op !== 'equal')
      : result.entries
    : [];

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">1 · URLs para comparar</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Cole duas URLs (versão antiga e nova, ou competidor A e B)
          </h2>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="hud-label">URL A (referência)</Label>
            <Input
              type="url"
              value={urlA}
              onChange={(e) => setUrlA(e.target.value)}
              placeholder="https://exemplo.com/v1"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label className="hud-label">URL B (atual)</Label>
            <Input
              type="url"
              value={urlB}
              onChange={(e) => setUrlB(e.target.value)}
              placeholder="https://exemplo.com/v2"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label className="hud-label">Modo de renderização</Label>
            <select
              className={`${SELECT} w-auto`}
              value={renderMode}
              onChange={(e) => setRenderMode(e.target.value as 'static' | 'js')}
              disabled={submitting}
            >
              <option value="js">JavaScript (Playwright) — pega SPAs</option>
              <option value="static">Estático (mais rápido)</option>
            </select>
          </div>
          <Button type="submit" disabled={submitting} size="lg">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Comparando…
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" />
                Comparar
              </>
            )}
          </Button>
        </div>
      </form>

      {result && (
        <section className="glass-card space-y-5 p-6">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="hud-label">2 · Resultado</p>
              <h2 className="mt-1 text-[16px] font-semibold text-white">
                <span className="text-emerald-300">+{result.summary.added}</span> ·{' '}
                <span className="text-red-300">-{result.summary.removed}</span> ·{' '}
                <span className="text-white/45">{result.summary.unchanged} iguais</span>
              </h2>
              <p className="mt-1 text-[12px] text-white/45">
                {result.duration_ms}ms · render {result.render_mode}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={filter === 'changed' ? 'default' : 'outline'}
                onClick={() => setFilter('changed')}
              >
                Só mudanças ({result.summary.added + result.summary.removed})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filter === 'all' ? 'default' : 'outline'}
                onClick={() => setFilter('all')}
              >
                Tudo ({result.entries.length})
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
              <p className="hud-label">URL A</p>
              <p className="mt-1 break-all font-mono text-white/70">{result.url_a.final}</p>
              <p className="mt-1 text-white/40">
                HTTP {result.url_a.status} · {result.url_a.lines} linhas
              </p>
            </div>
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-3">
              <p className="hud-label">URL B</p>
              <p className="mt-1 break-all font-mono text-white/70">{result.url_b.final}</p>
              <p className="mt-1 text-white/40">
                HTTP {result.url_b.status} · {result.url_b.lines} linhas
              </p>
            </div>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-black/40">
            {visibleEntries.length === 0 ? (
              <p className="p-6 text-center text-[12px] text-white/40">
                Nenhuma mudança detectada. As duas páginas têm exatamente o mesmo texto visível.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.04] font-mono text-[12px] leading-5">
                {visibleEntries.map((e, i) => (
                  <li
                    key={i}
                    className={`flex gap-2 px-3 py-1.5 ${
                      e.op === 'add'
                        ? 'bg-emerald-500/[0.08] text-emerald-200'
                        : e.op === 'remove'
                          ? 'bg-red-500/[0.08] text-red-200'
                          : 'text-white/55'
                    }`}
                  >
                    <span className="shrink-0 select-none text-white/30">
                      {e.op === 'add' ? <Plus className="h-3 w-3" /> : e.op === 'remove' ? <Minus className="h-3 w-3" /> : ' '}
                    </span>
                    <span className="break-words">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
