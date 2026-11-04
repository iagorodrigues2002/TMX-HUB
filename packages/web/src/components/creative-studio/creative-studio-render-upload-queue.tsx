'use client';

import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { formatBytes } from './creative-studio-support';
import type { useCreativeStudioState } from './creative-studio-use-creative-studio-state';

export function renderUploadQueue({
  uploadItems,
  setUploadItems,
  isUploading,
}: Pick<
  ReturnType<typeof useCreativeStudioState>,
  'uploadItems' | 'setUploadItems' | 'isUploading'
>) {
  return (
    <div className="glass-card space-y-2 rounded-xl border border-border bg-accent p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">
          {uploadItems.length} vídeo(s) no lote
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isUploading}
          onClick={() => setUploadItems([])}
        >
          Limpar lote
        </Button>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {uploadItems.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
                {item.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : item.status === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{item.file.name}</p>
                <p
                  className={`text-[10px] ${
                    item.status === 'failed' ? 'text-danger' : 'text-muted-foreground'
                  }`}
                >
                  {item.status === 'failed'
                    ? item.error
                    : `${formatBytes(item.file.size)} · ${
                        item.status === 'pending'
                          ? 'Aguardando'
                          : item.status === 'uploading'
                            ? `Enviando ${item.progress}%`
                            : 'Enviado'
                      }`}
                </p>
              </div>
              {!isUploading && (
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`Remover ${item.file.name}`}
                  onClick={() =>
                    setUploadItems((items) => items.filter((current) => current.id !== item.id))
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {item.status === 'uploading' && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
