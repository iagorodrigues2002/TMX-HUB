'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Download, ExternalLink, Plus, RefreshCcw, Shuffle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SlotRow } from './cloaker-generator-slot-row';
import {
  PRESETS,
  type ParamSlot,
  buildUrl,
  copyText,
  downloadText,
  emptySlot,
  generateBatch,
  newSlotId,
} from './cloaker-generator-support';

export function CloakerGenerator() {
  const uniqueId = useId();
  const [baseUrl, setBaseUrl] = useState('https://exemplo.com/lp');
  const [count, setCount] = useState(20);
  const [unique, setUnique] = useState(true);
  const [slots, setSlots] = useState<ParamSlot[]>([
    emptySlot('t', 'alnum', 10),
    emptySlot('ref', 'lowerAlnum', 6),
  ]);
  const [results, setResults] = useState<Array<{ id: string; url: string }>>([]);

  const previewUrl = useMemo(() => buildUrl(baseUrl.trim(), slots), [baseUrl, slots]);

  const updateSlot = (id: string, patch: Partial<ParamSlot>) =>
    setSlots((s) => s.map((sl) => (sl.id === id ? { ...sl, ...patch } : sl)));

  const removeSlot = (id: string) => setSlots((s) => s.filter((sl) => sl.id !== id));
  const addSlot = () => setSlots((s) => [...s, emptySlot(`p${s.length + 1}`, 'alnum', 8)]);

  const onGenerate = () => {
    const url = baseUrl.trim();
    if (!url) {
      toast.error('Informe uma URL base.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast.error('URL deve começar com http:// ou https://');
      return;
    }
    const n = Math.max(1, Math.min(1000, Math.floor(count)));
    const out = generateBatch({ baseUrl: url, slots, count: n, unique });
    setResults(out.map((url) => ({ id: newSlotId(), url })));
    if (out.length < n) {
      toast.warning(
        `Gerou ${out.length} URLs únicas (pediu ${n}). Aumenta o tamanho dos params pra ter mais variedade.`,
      );
    } else {
      toast.success(`${out.length} URLs geradas.`);
    }
  };

  const applyPreset = (name: keyof typeof PRESETS) => {
    const preset = PRESETS[name];
    if (!preset) return;
    setSlots(preset.map((s) => ({ ...s, id: newSlotId() })));
  };

  return (
    <div className="space-y-6">
      {/* URL base + presets */}
      <section className="glass-card space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="base-url" className="hud-label">
            URL base (página de destino)
          </Label>
          <Input
            id="base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://meusite.com/lp"
            className="font-mono"
          />
          <p className="text-[11px] text-white/40">
            Pode incluir parâmetros pré-existentes (ex.{' '}
            <code className="text-white/65">?gclid=xxx</code>) — os novos serão concatenados com{' '}
            <code className="text-white/65">&amp;</code>.
          </p>
        </div>

        <div className="space-y-2">
          <p className="hud-label">Presets</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(PRESETS).map((name) => (
              <Button
                key={name}
                size="sm"
                variant="outline"
                onClick={() => applyPreset(name as keyof typeof PRESETS)}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Slots */}
      <section className="glass-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="hud-label">Parâmetros</p>
            <h3 className="mt-1 text-[14px] font-semibold text-white">{slots.length} slot(s)</h3>
          </div>
          <Button size="sm" variant="outline" onClick={addSlot}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>

        {slots.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/[0.01] p-6 text-center text-[12px] text-white/40">
            Nenhum parâmetro. Clique em <strong>Adicionar</strong> ou escolha um preset.
          </p>
        ) : (
          <div className="space-y-3">
            {slots.map((s) => (
              <SlotRow
                key={s.id}
                slot={s}
                onChange={(p) => updateSlot(s.id, p)}
                onRemove={() => removeSlot(s.id)}
              />
            ))}
          </div>
        )}

        <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.03] p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">
            Preview (1 amostra)
          </p>
          <p className="break-all font-mono text-[12px] text-white/80">{previewUrl}</p>
        </div>
      </section>

      {/* Options + Generate */}
      <section className="glass-card flex flex-wrap items-end gap-4 p-5">
        <div className="space-y-1">
          <Label htmlFor="count" className="hud-label">
            Quantidade
          </Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-32"
          />
        </div>

        <label
          htmlFor={uniqueId}
          className="flex items-center gap-2 pb-2 text-[13px] text-white/75"
        >
          <Checkbox id={uniqueId} checked={unique} onChange={(e) => setUnique(e.target.checked)} />
          Apenas URLs únicas
        </label>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setSlots(slots.map((s) => ({ ...s })))}>
            <RefreshCcw className="h-4 w-4" />
            Reset preview
          </Button>
          <Button onClick={onGenerate}>
            <Shuffle className="h-4 w-4" />
            Gerar URLs
          </Button>
        </div>
      </section>

      {/* Results */}
      {results.length > 0 && (
        <section className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="hud-label">Resultado</p>
              <h3 className="mt-1 text-[14px] font-semibold text-white">{results.length} URLs</h3>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  copyText(results.map((result) => result.url).join('\n'), 'Lista de URLs')
                }
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar tudo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    results.map((result) => result.url).join('\n'),
                    `cloaker-urls-${new Date().toISOString().slice(0, 10)}.txt`,
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Baixar .txt
              </Button>
            </div>
          </div>

          <div className="max-h-[480px] space-y-1 overflow-y-auto rounded-md border border-white/[0.06] bg-black/15 p-2">
            {results.map(({ id, url }, i) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/[0.03]"
              >
                <span className="w-8 shrink-0 text-right font-mono text-[10px] text-white/30">
                  {i + 1}
                </span>
                <span className="flex-1 truncate font-mono text-[11px] text-white/80" title={url}>
                  {url}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(url, `URL #${i + 1}`)}
                  className="text-white/40 hover:text-cyan-300"
                  title="Copiar"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/40 hover:text-cyan-300"
                  title="Abrir"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
