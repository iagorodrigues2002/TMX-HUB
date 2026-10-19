'use client';

import { apiClient, authToken } from '@/lib/api-client';
import { loadPrivatePreview } from '@/lib/private-preview';
import type { CloneStatus } from '@page-cloner/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PreviewFrameProps {
  jobId: string;
  status: CloneStatus | undefined;
}

export function PreviewFrame({ jobId, status }: PreviewFrameProps) {
  const [preview, setPreview] = useState<{ jobId: string; html: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (status !== 'ready') return;
    const controller = new AbortController();
    setPreview(null);
    setFailed(false);
    void loadPrivatePreview(apiClient.previewUrl(jobId), authToken.get(), controller.signal)
      .then((html) => {
        if (!controller.signal.aborted) setPreview({ jobId, html });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [jobId, status]);

  if (status !== 'ready') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background/40">
        <div className="flex flex-col items-center gap-4">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-full border border-cyan-300/30 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
            style={{
              background: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(34,211,238,0.05))',
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

  if (failed || !preview || preview.jobId !== jobId) {
    return (
      <output className="grid h-full place-items-center text-sm text-muted-foreground">
        {failed ? 'Não foi possível carregar o preview autorizado.' : 'Carregando preview…'}
      </output>
    );
  }

  return (
    <iframe
      title="Preview sanitizado"
      srcDoc={preview.html}
      sandbox="allow-popups"
      referrerPolicy="no-referrer"
      className="h-full w-full bg-white"
    />
  );
}
