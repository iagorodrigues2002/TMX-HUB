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
    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/15 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-white/75">{uploadItems.length} vídeo(s) no lote</p>
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
          <div key={item.id} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300/[0.07] text-cyan-200">
                {item.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : item.status === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/85">{item.file.name}</p>
                <p
                  className={`text-[10px] ${
                    item.status === 'failed' ? 'text-rose-300' : 'text-white/40'
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
                  className="rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white"
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
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-cyan-300 transition-[width]"
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
