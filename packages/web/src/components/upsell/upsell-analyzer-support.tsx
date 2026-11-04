'use client';

import { Label } from '@/components/ui/label';
import type { ColumnMap } from '@/lib/upsell/calc';
import type { ParsedSheet } from '@/lib/upsell/parse-spreadsheet';
import { Upload } from 'lucide-react';

export const EMPTY_COLS: ColumnMap = {
  customerId: '',
  product: '',
  offer: '',
  status: '',
  dateTime: '',
};

// ---- sub-components ----

export function FilePicker(props: {
  label: string;
  fileName: string;
  sheet: ParsedSheet | null;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="hud-label">{props.label}</Label>
      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border bg-muted p-4 transition hover:border-border hover:bg-accent">
        <Upload className="h-4 w-4 text-primary" />
        <div className="flex-1 text-[13px]">
          {props.fileName ? (
            <>
              <p className="font-semibold text-foreground">{props.fileName}</p>
              <p className="text-[11px] text-muted-foreground">
                {props.sheet?.rows.length ?? 0} linhas · {props.sheet?.columns.length ?? 0} colunas
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Clique para escolher arquivo</p>
          )}
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
          }}
        />
      </label>
    </div>
  );
}
