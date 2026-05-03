'use client';

import { useState } from 'react';
import { ExternalLink, FileCode2, ShoppingCart, X } from 'lucide-react';
import type { InspectResult, LinkReplacement } from '@page-cloner/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface InspectionPanelProps {
  result: InspectResult;
  onClone: (opts: { linkReplacements: LinkReplacement[]; keepScriptSrcs: string[] }) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function InspectionPanel({ result, onClone, onCancel, submitting }: InspectionPanelProps) {
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>(
    Object.fromEntries(result.checkoutLinks.map((l) => [l.href, ''])),
  );
  const [keptScripts, setKeptScripts] = useState<Set<string>>(new Set());

  const handleClone = () => {
    const linkReplacements: LinkReplacement[] = Object.entries(linkTargets)
      .filter(([, to]) => to.trim() !== '')
      .map(([from, to]) => ({ from, to: to.trim() }));
    onClone({ linkReplacements, keepScriptSrcs: Array.from(keptScripts) });
  };

  const toggleScript = (src: string) => {
    setKeptScripts((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="hud-label">Resultado da inspeção</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 text-white/40 transition hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Checkout links */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-cyan-300/70" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            Links de checkout detectados ({result.checkoutLinks.length})
          </span>
        </div>

        {result.checkoutLinks.length === 0 ? (
          <p className="pl-6 text-[12px] text-white/35">Nenhum link de checkout encontrado.</p>
        ) : (
          <div className="space-y-2 pl-2">
            {result.checkoutLinks.map((link) => (
              <div key={link.href} className="space-y-1 rounded-md border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-start gap-2">
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-white/30" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[11px] text-white/60">{link.href}</p>
                    {link.text && (
                      <p className="text-[11px] text-white/35">{link.text} · {link.occurrences}×</p>
                    )}
                  </div>
                </div>
                <Input
                  type="url"
                  placeholder="Substituir por… (deixe vazio para manter)"
                  value={linkTargets[link.href] ?? ''}
                  onChange={(e) =>
                    setLinkTargets((prev) => ({ ...prev, [link.href]: e.target.value }))
                  }
                  className="h-8 text-[12px]"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HEAD scripts */}
      {result.headScripts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-cyan-300/70" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
              Scripts no HEAD ({result.headScripts.length} externos
              {result.inlineScriptCount > 0 && `, ${result.inlineScriptCount} inline`})
            </span>
          </div>
          <p className="pl-6 text-[11px] text-white/35">
            Todos os scripts são removidos por padrão. Marque os que deseja preservar.
          </p>
          <div className="space-y-1.5 pl-2">
            {result.headScripts.map((script) => (
              <label
                key={script.src}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.015] p-2.5 transition hover:bg-white/[0.04]"
              >
                <input
                  type="checkbox"
                  checked={keptScripts.has(script.src)}
                  onChange={() => toggleScript(script.src)}
                  className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/55">
                  {script.src}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1"
        >
          Voltar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleClone}
          disabled={submitting}
          className="flex-1"
        >
          {submitting ? 'Clonando…' : 'Confirmar clonagem'}
        </Button>
      </div>
    </div>
  );
}
