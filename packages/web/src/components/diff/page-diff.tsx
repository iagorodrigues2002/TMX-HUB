'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { GitCompare, Loader2, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const SELECT =
  'flex h-11 w-full rounded-md border border-border bg-muted px-4 text-[14px] text-foreground focus-visible:outline-none focus-visible:border-border';

export function PageDiff() {
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  const [renderMode, setRenderMode] = useState<'static' | 'js'>('js');
  const [filter, setFilter] = useState<'all' | 'changed'>('changed');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | (Omit<Awaited<ReturnType<typeof apiClient.pageDiff>>, 'entries'> & {
        entries: Array<{ id: number; op: 'equal' | 'add' | 'remove'; text: string }>;
      })
    | null
  >(null);

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
      setResult({ ...out, entries: out.entries.map((entry, id) => ({ ...entry, id })) });
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
      <form onSubmit={(event) => void handleSubmit(event)} className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">1 · URLs para comparar</p>
          <h2 className="mt-1 text-[16px] font-semibold text-foreground">
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
              <h2 className="mt-1 text-[16px] font-semibold text-foreground">
                <span className="text-success">+{result.summary.added}</span> ·{' '}
                <span className="text-danger">-{result.summary.removed}</span> ·{' '}
                <span className="text-muted-foreground">{result.summary.unchanged} iguais</span>
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
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
            <div className="rounded-md border border-border bg-accent p-3">
              <p className="hud-label">URL A</p>
              <p className="mt-1 break-all font-mono text-muted-foreground">{result.url_a.final}</p>
              <p className="mt-1 text-muted-foreground">
                HTTP {result.url_a.status} · {result.url_a.lines} linhas
              </p>
            </div>
            <div className="rounded-md border border-border bg-accent p-3">
              <p className="hud-label">URL B</p>
              <p className="mt-1 break-all font-mono text-muted-foreground">{result.url_b.final}</p>
              <p className="mt-1 text-muted-foreground">
                HTTP {result.url_b.status} · {result.url_b.lines} linhas
              </p>
            </div>
          </div>

          <div className="rounded-md border border-border bg-accent">
            {visibleEntries.length === 0 ? (
              <p className="p-6 text-center text-[12px] text-muted-foreground">
                Nenhuma mudança detectada. As duas páginas têm exatamente o mesmo texto visível.
              </p>
            ) : (
              <ul className="divide-y divide-border font-mono text-[12px] leading-5">
                {visibleEntries.map((e) => (
                  <li
                    key={e.id}
                    className={`flex gap-2 px-3 py-1.5 ${
                      e.op === 'add'
                        ? 'bg-success/10 text-success'
                        : e.op === 'remove'
                          ? 'bg-danger/10 text-danger'
                          : 'text-muted-foreground'
                    }`}
                  >
                    <span className="shrink-0 select-none text-muted-foreground">
                      {e.op === 'add' ? (
                        <Plus className="h-3 w-3" />
                      ) : e.op === 'remove' ? (
                        <Minus className="h-3 w-3" />
                      ) : (
                        ' '
                      )}
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
