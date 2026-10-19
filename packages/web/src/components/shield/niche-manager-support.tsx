'use client';

import type { NicheWhiteView } from '@/lib/api-client';
import { Trash2, Upload } from 'lucide-react';

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function WhiteRow({
  white,
  canModify,
  onRemove,
}: {
  white: NicheWhiteView;
  canModify: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]">
      <Upload className="h-3 w-3 shrink-0 text-cyan-300/70" />
      <span className="flex-1 truncate text-white/85" title={white.filename}>
        {white.label || white.filename}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-white/40">
        {formatBytes(white.bytes)}
      </span>
      {canModify && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remover áudio "${white.label || white.filename}"?`)) onRemove();
          }}
          className="text-white/40 hover:text-rose-300"
          title="Remover"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
