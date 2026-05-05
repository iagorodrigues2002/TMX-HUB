'use client';

import { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  Plus,
  RefreshCcw,
  Shuffle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type SlotMode =
  | 'alnum'      // letters + digits, mixed case
  | 'lowerAlnum' // letters + digits, lowercase
  | 'hex'        // 0-9 a-f
  | 'numeric'    // digits only
  | 'letters'    // letters only
  | 'uuid'       // uuid v4
  | 'static'     // fixed value
  | 'pick';      // pick from list

interface ParamSlot {
  id: string;
  name: string;
  mode: SlotMode;
  length: number;
  staticValue: string;   // for 'static' & 'pick' (CSV)
}

const ALPHABETS: Record<Exclude<SlotMode, 'uuid' | 'static' | 'pick'>, string> = {
  alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  lowerAlnum: 'abcdefghijklmnopqrstuvwxyz0123456789',
  hex: '0123456789abcdef',
  numeric: '0123456789',
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

const MODE_LABELS: Record<SlotMode, string> = {
  alnum: 'Alfanumérico (A-Z a-z 0-9)',
  lowerAlnum: 'Alfanumérico minúsculo',
  hex: 'Hexadecimal (0-9 a-f)',
  numeric: 'Numérico (0-9)',
  letters: 'Apenas letras',
  uuid: 'UUID v4',
  static: 'Valor fixo',
  pick: 'Sortear de lista (CSV)',
};

function newSlotId(): string {
  return `s_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

function emptySlot(name = 't', mode: SlotMode = 'alnum', length = 8): ParamSlot {
  return { id: newSlotId(), name, mode, length, staticValue: '' };
}

function randomFromAlphabet(alphabet: string, length: number): string {
  const out = new Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out[i] = alphabet[buf[i]! % alphabet.length];
  } else {
    for (let i = 0; i < length; i++) {
      out[i] = alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return out.join('');
}

function uuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (rare path).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateValue(slot: ParamSlot): string {
  switch (slot.mode) {
    case 'uuid':
      return uuidV4();
    case 'static':
      return slot.staticValue;
    case 'pick': {
      const items = slot.staticValue
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length === 0) return '';
      const idx = randomIntLessThan(items.length);
      return items[idx]!;
    }
    default:
      return randomFromAlphabet(ALPHABETS[slot.mode], Math.max(1, slot.length));
  }
}

function randomIntLessThan(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % max;
  }
  return Math.floor(Math.random() * max);
}

interface BuildOpts {
  baseUrl: string;
  slots: ParamSlot[];
  count: number;
  unique: boolean;
}

function buildUrl(base: string, slots: ParamSlot[]): string {
  const parts: string[] = [];
  for (const s of slots) {
    const name = s.name.trim();
    if (!name) continue;
    const val = generateValue(s);
    if (val === '' && s.mode !== 'static') continue;
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`);
  }
  if (parts.length === 0) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${parts.join('&')}`;
}

function generateBatch({ baseUrl, slots, count, unique }: BuildOpts): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10 + 50;
  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const url = buildUrl(baseUrl, slots);
    if (unique) {
      if (seen.has(url)) continue;
      seen.add(url);
    }
    out.push(url);
  }
  return out;
}

function copyText(value: string, label = 'Texto'): void {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

function downloadText(value: string, filename: string): void {
  const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PRESETS: Record<string, ParamSlot[]> = {
  'Token simples': [emptySlot('t', 'alnum', 10)],
  'Meta-friendly (ref + tk)': [
    emptySlot('ref', 'lowerAlnum', 8),
    emptySlot('tk', 'hex', 16),
  ],
  'UTMs + token': [
    { ...emptySlot('utm_source', 'static', 0), staticValue: 'fb' },
    { ...emptySlot('utm_medium', 'static', 0), staticValue: 'cpc' },
    {
      ...emptySlot('utm_campaign', 'pick', 0),
      staticValue: 'pflv1, pflv2, pflv3',
    },
    emptySlot('t', 'hex', 12),
  ],
  'UUID puro': [emptySlot('id', 'uuid', 0)],
};

export function CloakerGenerator() {
  const [baseUrl, setBaseUrl] = useState('https://exemplo.com/lp');
  const [count, setCount] = useState(20);
  const [unique, setUnique] = useState(true);
  const [slots, setSlots] = useState<ParamSlot[]>([
    emptySlot('t', 'alnum', 10),
    emptySlot('ref', 'lowerAlnum', 6),
  ]);
  const [results, setResults] = useState<string[]>([]);

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
    setResults(out);
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
            <code className="text-white/65">?gclid=xxx</code>) — os novos serão concatenados
            com <code className="text-white/65">&amp;</code>.
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
            <h3 className="mt-1 text-[14px] font-semibold text-white">
              {slots.length} slot(s)
            </h3>
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

        <label className="flex items-center gap-2 pb-2 text-[13px] text-white/75">
          <Checkbox
            checked={unique}
            onChange={(e) => setUnique(e.target.checked)}
          />
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
              <h3 className="mt-1 text-[14px] font-semibold text-white">
                {results.length} URLs
              </h3>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyText(results.join('\n'), 'Lista de URLs')}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar tudo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    results.join('\n'),
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
            {results.map((url, i) => (
              <div
                key={`${url}-${i}`}
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

function SlotRow({
  slot,
  onChange,
  onRemove,
}: {
  slot: ParamSlot;
  onChange: (p: Partial<ParamSlot>) => void;
  onRemove: () => void;
}) {
  const showLength = !['uuid', 'static', 'pick'].includes(slot.mode);
  const showStatic = slot.mode === 'static';
  const showPick = slot.mode === 'pick';

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="grid gap-2 md:grid-cols-[160px_1fr_120px_36px] md:items-end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Nome
          </Label>
          <Input
            value={slot.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="t"
            className="h-9 font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Tipo
          </Label>
          <Select
            value={slot.mode}
            onValueChange={(v) => onChange({ mode: v as SlotMode })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as SlotMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Tamanho
          </Label>
          <Input
            type="number"
            min={1}
            max={64}
            value={slot.length}
            onChange={(e) => onChange({ length: Number(e.target.value) })}
            disabled={!showLength}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label="Remover slot"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showStatic && (
        <div className="mt-2 space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Valor fixo
          </Label>
          <Input
            value={slot.staticValue}
            onChange={(e) => onChange({ staticValue: e.target.value })}
            placeholder="ex: fb"
            className="h-9 font-mono"
          />
        </div>
      )}

      {showPick && (
        <div className="mt-2 space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Lista de opções (separar por vírgula ou nova linha)
          </Label>
          <Input
            value={slot.staticValue}
            onChange={(e) => onChange({ staticValue: e.target.value })}
            placeholder="opt1, opt2, opt3"
            className="h-9 font-mono"
          />
        </div>
      )}
    </div>
  );
}
