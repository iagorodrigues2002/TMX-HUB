'use client';

import { CheckCircle2, FileVideo, Loader2, Trash2, XCircle } from 'lucide-react';
import { type UploadSlot, formatBytes } from './shield-processor-support';

export function SlotRow({ slot, onRemove }: { slot: UploadSlot; onRemove: () => void }) {
  const icon =
    slot.status === 'done' ? (
      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300" />
    ) : slot.status === 'failed' ? (
      <XCircle className="h-3 w-3 shrink-0 text-rose-300" />
    ) : slot.status === 'uploading' ? (
      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-300" />
    ) : (
      <FileVideo className="h-3 w-3 shrink-0 text-white/45" />
    );
  return (
    <li className="rounded px-2 py-1.5 hover:bg-white/[0.03]">
      <div className="flex items-center gap-2 text-[12px]">
        {icon}
        <span className="flex-1 truncate text-white/85" title={slot.file.name}>
          {slot.file.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-white/40">
          {formatBytes(slot.file.size)}
        </span>
        {slot.status === 'pending' && (
          <button
            type="button"
            onClick={onRemove}
            className="text-white/40 hover:text-rose-300"
            title="Remover da fila"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {slot.status === 'uploading' && (
        <div className="ml-5 mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full bg-cyan-300/70 transition-all"
            style={{ width: `${slot.progress}%` }}
          />
        </div>
      )}
      {slot.status === 'failed' && slot.error && (
        <p className="ml-5 mt-1 truncate text-[10px] text-rose-300/85" title={slot.error}>
          {slot.error}
        </p>
      )}
    </li>
  );
}
