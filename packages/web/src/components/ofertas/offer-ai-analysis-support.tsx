'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';

export function AnalysisFeedback({
  analysisId,
  value,
  pending,
  onChange,
  onSave,
}: {
  analysisId: string;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 rounded-md border border-cyan-300/10 bg-cyan-300/[0.025] p-3">
      <Label htmlFor={`ai-feedback-${analysisId}`} className="text-[11px] text-cyan-100/70">
        Resultado depois desta análise
      </Label>
      <textarea
        id={`ai-feedback-${analysisId}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={1_000}
        rows={3}
        className={`${textareaClass} mt-2`}
        placeholder="Ex.: reduzi o orçamento às 16h; a janela seguinte recuperou para ROAS 1,8."
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-white/30">
          A próxima análise usará este resultado como memória operacional.
        </p>
        <Button variant="outline" size="sm" onClick={onSave} disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salvar feedback
        </Button>
      </div>
    </div>
  );
}

export const textareaClass =
  'w-full rounded-md border border-white/10 bg-[#0b1b22] px-3 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-white/25 focus:border-cyan-300/35';

export const SCHEDULE_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
