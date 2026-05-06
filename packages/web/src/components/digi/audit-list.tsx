'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type DigiAuditView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHECKLIST, totalItems, totalCriticalItems, itemKey } from './checklist-data';

const STATUS_LABEL: Record<DigiAuditView['status'], string> = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  abandoned: 'Abandonado',
};

const STATUS_CLASS: Record<DigiAuditView['status'], string> = {
  draft: 'border-white/15 bg-white/[0.04] text-white/55',
  in_review: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200',
  approved: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
  rejected: 'border-rose-300/30 bg-rose-300/10 text-rose-200',
  abandoned: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
};

function progressOf(audit: DigiAuditView): {
  done: number;
  total: number;
  critical: { done: number; total: number };
} {
  const total = totalItems();
  const totalCritical = totalCriticalItems();
  let done = 0;
  let criticalDone = 0;
  for (const section of CHECKLIST) {
    for (const item of section.items) {
      const key = itemKey(section.id, item.id);
      const state = audit.items[key]?.state;
      if (state === 'done' || state === 'na') {
        done++;
        if (item.critical && state === 'done') criticalDone++;
      }
    }
  }
  return { done, total, critical: { done: criticalDone, total: totalCritical } };
}

export function AuditList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DigiAuditView[]>({
    queryKey: ['digi-audits'],
    queryFn: () => apiClient.listDigiAudits(),
  });
  const audits = data ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [productName, setProductName] = useState('');

  const createMut = useMutation({
    mutationFn: () => apiClient.createDigiAudit({ product_name: productName.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['digi-audits'] });
      setShowCreate(false);
      setProductName('');
      toast.success('Auditoria criada.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteDigiAudit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['digi-audits'] });
      toast.success('Auditoria removida.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Auditorias de produto</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {audits.length} auditoria(s)
          </h2>
        </div>
        <Button
          size="sm"
          variant={showCreate ? 'outline' : 'default'}
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCreate ? 'Cancelar' : 'Nova auditoria'}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!productName.trim()) return toast.error('Dê um nome ao produto.');
            createMut.mutate();
          }}
          className="glass-card space-y-3 p-4"
        >
          <div className="space-y-1">
            <Label className="hud-label">Nome do produto</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder='ex. "Manifestation Mastery System"'
              disabled={createMut.isPending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : audits.length === 0 ? (
        <div className="glass-card p-8 text-center text-[13px] text-white/55">
          Nenhuma auditoria ainda. Crie a primeira pra começar a aprovar um produto.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {audits.map((a) => {
            const { done, total, critical } = progressOf(a);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const critPct = critical.total > 0 ? Math.round((critical.done / critical.total) * 100) : 0;
            return (
              <div key={a.id} className="glass-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      href={`/tools/digi-approval/${a.id}`}
                      className="block truncate text-[15px] font-semibold text-white hover:text-cyan-200"
                    >
                      {a.productName}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${STATUS_CLASS[a.status]}`}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover auditoria "${a.productName}"?`)) deleteMut.mutate(a.id);
                    }}
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-[0.14em] text-white/45">
                      <span>Geral</span>
                      <span className="font-mono text-white/65">
                        {done}/{total}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full bg-cyan-300/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-[0.14em] text-white/45">
                      <span>Críticos</span>
                      <span className="font-mono text-white/65">
                        {critical.done}/{critical.total}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full ${critPct === 100 ? 'bg-emerald-300/70' : 'bg-amber-300/70'}`}
                        style={{ width: `${critPct}%` }}
                      />
                    </div>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="mt-auto w-full">
                  <Link href={`/tools/digi-approval/${a.id}`}>
                    Abrir
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
