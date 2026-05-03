'use client';

import { useMemo } from 'react';
import type { CloneStatus } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';
import { Loader2 } from 'lucide-react';

interface PreviewFrameProps {
  jobId: string;
  status: CloneStatus | undefined;
}

export function PreviewFrame({ jobId, status }: PreviewFrameProps) {
  const src = useMemo(() => apiClient.previewUrl(jobId), [jobId]);

  if (status !== 'ready') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#04101A]/40">
        <div className="flex flex-col items-center gap-4">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-full border border-cyan-300/30 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
            style={{
              background:
                'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
            }}
          >
            <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            {status === 'failed' ? 'Renderização falhou' : 'Aguardando renderização'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title="Preview sanitizado"
      src={src}
      sandbox="allow-same-origin allow-popups"
      className="h-full w-full bg-white"
    />
  );
}
