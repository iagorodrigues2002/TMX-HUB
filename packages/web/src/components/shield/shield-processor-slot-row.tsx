'use client';

import { CheckCircle2, FileVideo, Loader2, Trash2, XCircle } from 'lucide-react';
import { type UploadSlot, formatBytes } from './shield-processor-support';

export function SlotRow({ slot, onRemove }: { slot: UploadSlot; onRemove: () => void }) {
  const icon =
    slot.status === 'done' ? (
      <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
    ) : slot.status === 'failed' ? (
      <XCircle className="h-3 w-3 shrink-0 text-danger" />
    ) : slot.status === 'uploading' ? (
      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
    ) : (
      <FileVideo className="h-3 w-3 shrink-0 text-muted-foreground" />
    );
  return (
    <li className="rounded px-2 py-1.5 hover:bg-muted">
      <div className="flex items-center gap-2 text-[12px]">
        {icon}
        <span className="flex-1 truncate text-foreground" title={slot.file.name}>
          {slot.file.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatBytes(slot.file.size)}
        </span>
        {slot.status === 'pending' && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-danger"
            title="Remover da fila"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {slot.status === 'uploading' && (
        <div className="ml-5 mt-1 h-0.5 overflow-hidden rounded-full bg-accent">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${slot.progress}%` }}
          />
        </div>
      )}
      {slot.status === 'failed' && slot.error && (
        <p className="ml-5 mt-1 truncate text-[10px] text-danger" title={slot.error}>
          {slot.error}
        </p>
      )}
    </li>
  );
}
