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
      <div className="rounded-md border border-border bg-accent p-4 text-[12px] text-muted-foreground">
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
            <Label className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {f.label}
            </Label>
            <select
              value={props.cols[f.key] ?? ''}
              onChange={(e) => props.onChange({ ...props.cols, [f.key]: e.target.value })}
              className="flex h-11 w-full rounded-md border border-border bg-muted px-4 text-[14px] text-foreground focus-visible:outline-none focus-visible:border-border"
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
