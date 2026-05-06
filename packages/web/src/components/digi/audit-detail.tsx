'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  apiClient,
  type DigiAuditItemView,
  type DigiAuditStatusView,
  type DigiAuditView,
  type DigiItemStateView,
} from '@/lib/api-client';
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
import { cn } from '@/lib/utils';
import {
  CHECKLIST,
  RED_FLAGS,
  RED_FLAG_ACTION,
  itemKey,
  totalCriticalItems,
  totalItems,
  type ChecklistItem,
} from './checklist-data';

const STATUS_OPTIONS: Array<{ value: DigiAuditStatusView; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'in_review', label: 'Em revisão' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Rejeitado' },
  { value: 'abandoned', label: 'Abandonado' },
];

function progressOfSection(audit: DigiAuditView, sectionId: string) {
  const section = CHECKLIST.find((s) => s.id === sectionId);
  if (!section) return { done: 0, total: 0 };
  let done = 0;
  for (const item of section.items) {
    const state = audit.items[itemKey(sectionId, item.id)]?.state;
    if (state === 'done' || state === 'na') done++;
  }
  return { done, total: section.items.length };
}

export function AuditDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DigiAuditView>({
    queryKey: ['digi-audit', id],
    queryFn: () => apiClient.getDigiAudit(id),
  });

  const [openSection, setOpenSection] = useState<string | null>('pre');

  // Local notes draft to debounce save.
  const [localNotes, setLocalNotes] = useState<string>('');
  useEffect(() => {
    if (data?.notes !== undefined) setLocalNotes(data.notes ?? '');
  }, [data?.notes]);

  const patchMut = useMutation({
    mutationFn: (patch: Parameters<typeof apiClient.updateDigiAudit>[1]) =>
      apiClient.updateDigiAudit(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(['digi-audit', id], updated);
      qc.invalidateQueries({ queryKey: ['digi-audits'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const overall = useMemo(() => {
    if (!data) return { done: 0, total: 0, critDone: 0, critTotal: 0 };
    let done = 0;
    let critDone = 0;
    for (const section of CHECKLIST) {
      for (const item of section.items) {
        const state = data.items[itemKey(section.id, item.id)]?.state;
        if (state === 'done' || state === 'na') done++;
        if (item.critical && state === 'done') critDone++;
      }
    }
    return {
      done,
      total: totalItems(),
      critDone,
      critTotal: totalCriticalItems(),
    };
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="glass-card flex items-center justify-center p-12">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
      </div>
    );
  }

  const updateItem = (sectionId: string, itemId: string, patch: Partial<DigiAuditItemView>) => {
    const key = itemKey(sectionId, itemId);
    const current = data.items[key] ?? { state: 'pending' as DigiItemStateView };
    const next: DigiAuditItemView = { ...current, ...patch };
    patchMut.mutate({ items: { [key]: next } });
  };

  const updateStatus = (status: DigiAuditStatusView) => {
    patchMut.mutate({ status });
  };

  const flushNotes = () => {
    if (localNotes !== (data.notes ?? '')) {
      patchMut.mutate({ notes: localNotes });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/tools/digi-approval" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Todas as auditorias
              </span>
            </Link>
          </Button>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">{data.productName}</h1>
            <div className="flex items-center gap-2">
              <Label className="hud-label">Status</Label>
              <Select
                value={data.status}
                onValueChange={(v) => updateStatus(v as DigiAuditStatusView)}
              >
                <SelectTrigger className="h-8 min-w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Progress overview */}
        <div className="glass-card space-y-3 p-5">
          <div className="grid grid-cols-2 gap-4">
            <ProgressMini
              label="Geral"
              done={overall.done}
              total={overall.total}
              tone="cyan"
            />
            <ProgressMini
              label="Críticos"
              done={overall.critDone}
              total={overall.critTotal}
              tone={overall.critDone === overall.critTotal && overall.critTotal > 0 ? 'emerald' : 'amber'}
            />
          </div>
          {overall.critDone < overall.critTotal && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-300/85">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {overall.critTotal - overall.critDone} item(ns) crítico(s) ainda pendente(s) — bloqueiam
              aprovação segura.
            </p>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-2">
          {CHECKLIST.map((section) => {
            const open = openSection === section.id;
            const { done, total } = progressOfSection(data, section.id);
            const pct = total > 0 ? (done / total) * 100 : 0;
            return (
              <div key={section.id} className="glass-card overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setOpenSection(open ? null : section.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  <span className="text-[18px]">{section.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-[14px] font-semibold text-white">{section.title}</h3>
                      <span className="font-mono text-[10px] text-white/45">
                        {done}/{total}
                      </span>
                    </div>
                    <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full bg-cyan-300/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-white/45" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/45" />
                  )}
                </button>
                {open && (
                  <div className="space-y-2 border-t border-white/[0.06] bg-black/15 p-4">
                    {section.context && (
                      <p className="mb-2 text-[12px] italic text-white/45">{section.context}</p>
                    )}
                    {section.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        state={data.items[itemKey(section.id, item.id)]}
                        onChange={(patch) => updateItem(section.id, item.id, patch)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall notes */}
        <div className="glass-card space-y-2 p-5">
          <Label className="hud-label">Anotações gerais</Label>
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={flushNotes}
            placeholder="Decisões, contexto, links externos…"
            rows={5}
            className="w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-[13px] text-white/85 placeholder:text-white/30 focus:border-cyan-300/40 focus:outline-none"
          />
          <p className="text-[10px] text-white/35">Salva ao sair do campo.</p>
        </div>
      </div>

      {/* Sidebar — Red flags */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="glass-card space-y-3 border-rose-300/20 bg-rose-300/[0.03] p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-300" />
            <p className="hud-label text-rose-200">Bandeiras vermelhas</p>
          </div>
          <p className="text-[11px] text-white/55">
            Se qualquer um disso acionar, pause tudo:
          </p>
          <ul className="space-y-1.5">
            {RED_FLAGS.map((rf) => (
              <li key={rf.id} className="flex items-start gap-1.5 text-[11px] text-rose-100/80">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300/70" />
                <span>{rf.label}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-rose-300/15 bg-rose-300/[0.05] p-2 text-[10px] text-rose-100/75">
            <strong>Ação:</strong> {RED_FLAG_ACTION}
          </div>
        </div>

        <div className="glass-card p-4 text-[11px] text-white/55">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-cyan-300/70" />
            <p className="hud-label text-white/65">Resumo 1-página</p>
          </div>
          <ul className="space-y-1 font-mono text-[10px]">
            <li>matriz: 5% | afiliados: 95% (cap 50k)</li>
            <li>cookie 180d · manual approval</li>
            <li>cloaker server-side · privacy/terms WHITE</li>
            <li>category: Spirituality · marketplace OFF</li>
            <li>ticket $27-97 · refund 30d</li>
            <li>IPN webhook + SHA512</li>
          </ul>
        </div>

        <div className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-[11px] text-white/65">
          <a
            href="https://help.digistore24.com/hc/en-us"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-semibold text-cyan-200 hover:text-cyan-100"
          >
            Help Center Digi <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://www.digistore24.com/extern/calculator/iframe/en"
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 font-semibold text-cyan-200 hover:text-cyan-100"
          >
            Calculadora de fees <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </aside>
    </div>
  );
}

function ItemRow({
  item,
  state,
  onChange,
}: {
  item: ChecklistItem;
  state: DigiAuditItemView | undefined;
  onChange: (patch: Partial<DigiAuditItemView>) => void;
}) {
  const current = state?.state ?? 'pending';
  const [showNotes, setShowNotes] = useState(!!state?.notes);
  const [localNote, setLocalNote] = useState(state?.notes ?? '');
  const [localUrl, setLocalUrl] = useState(state?.url ?? '');

  useEffect(() => {
    setLocalNote(state?.notes ?? '');
    setLocalUrl(state?.url ?? '');
  }, [state?.notes, state?.url]);

  return (
    <div
      className={cn(
        'rounded-md border p-2.5',
        item.critical
          ? 'border-amber-300/15 bg-amber-300/[0.02]'
          : 'border-white/[0.06] bg-white/[0.02]',
      )}
    >
      <div className="flex items-start gap-2">
        <StateToggle current={current} onChange={(s) => onChange({ state: s })} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[12.5px] leading-snug',
              current === 'done' && 'text-white/60 line-through decoration-white/40',
              current === 'na' && 'text-white/40',
              current === 'pending' && 'text-white/85',
            )}
          >
            {item.label}
            {item.critical && (
              <span className="ml-1.5 inline-block rounded-sm border border-amber-300/30 bg-amber-300/10 px-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-200/85">
                crítico
              </span>
            )}
          </p>
          {item.hint && <p className="mt-0.5 text-[11px] text-white/45">{item.hint}</p>}
          {item.hasUrl && (
            <Input
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              onBlur={() => {
                if (localUrl !== (state?.url ?? '')) onChange({ url: localUrl });
              }}
              placeholder="https://..."
              className="mt-1.5 h-7 font-mono text-[11px]"
            />
          )}
          {showNotes ? (
            <textarea
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              onBlur={() => {
                if (localNote !== (state?.notes ?? '')) onChange({ notes: localNote });
              }}
              placeholder="anotação"
              rows={2}
              className="mt-1.5 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 placeholder:text-white/30 focus:border-cyan-300/40 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35 hover:text-cyan-300"
            >
              + nota
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StateToggle({
  current,
  onChange,
}: {
  current: DigiItemStateView;
  onChange: (s: DigiItemStateView) => void;
}) {
  const cycle = () => {
    const next: DigiItemStateView =
      current === 'pending' ? 'done' : current === 'done' ? 'na' : 'pending';
    onChange(next);
  };
  const cls =
    current === 'done'
      ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200'
      : current === 'na'
        ? 'border-white/[0.15] bg-white/[0.04] text-white/45'
        : 'border-white/[0.18] bg-white/[0.04] text-white/65';
  const label = current === 'done' ? '✓' : current === 'na' ? '—' : ' ';
  return (
    <button
      type="button"
      onClick={cycle}
      title={`Estado: ${current}. Clique pra alternar.`}
      className={cn(
        'mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-sm border font-mono text-[11px] font-bold transition-colors',
        cls,
      )}
    >
      {label}
    </button>
  );
}

function ProgressMini({
  label,
  done,
  total,
  tone,
}: {
  label: string;
  done: number;
  total: number;
  tone: 'cyan' | 'emerald' | 'amber';
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barClass = {
    cyan: 'bg-cyan-300/70',
    emerald: 'bg-emerald-300/70',
    amber: 'bg-amber-300/70',
  }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="hud-label">{label}</p>
        <span className="font-mono text-[12px] text-white/65">
          {done}/{total} <span className="text-white/35">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
