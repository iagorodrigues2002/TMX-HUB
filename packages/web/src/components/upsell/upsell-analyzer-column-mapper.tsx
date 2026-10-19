'use client';

import { Label } from '@/components/ui/label';
import type { ColumnMap } from '@/lib/upsell/calc';
import type { ParsedSheet } from '@/lib/upsell/parse-spreadsheet';
import { useMemo } from 'react';

export function ColumnMapper(props: {
  title: string;
  sheet: ParsedSheet | null;
  cols: ColumnMap;
  onChange: (next: ColumnMap) => void;
  showStatus: boolean;
  showDateTime: boolean;
}) {
  const options = useMemo(() => props.sheet?.columns ?? [], [props.sheet]);
  if (!props.sheet) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-black/20 p-4 text-[12px] text-white/40">
        {props.title}: faça upload do arquivo.
      </div>
    );
  }
  const fields: Array<{ key: keyof ColumnMap; label: string; show: boolean }> = [
    { key: 'customerId', label: 'ID Cliente', show: true },
    { key: 'product', label: 'Produto', show: true },
    { key: 'offer', label: 'Oferta', show: true },
    { key: 'status', label: 'Status', show: props.showStatus },
    { key: 'dateTime', label: 'Data/Hora', show: props.showDateTime },
  ];
  return (
    <div className="space-y-2">
      <p className="hud-label">{props.title}</p>
      {fields
        .filter((f) => f.show)
        .map((f) => (
          <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="text-[11px] uppercase tracking-[0.12em] text-white/55">
              {f.label}
            </Label>
            <select
              value={props.cols[f.key] ?? ''}
              onChange={(e) => props.onChange({ ...props.cols, [f.key]: e.target.value })}
              className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
            >
              <option value="">— escolha —</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ))}
    </div>
  );
}
