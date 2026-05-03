'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCloneJob } from '@/hooks/use-clone-job';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/editor/status-pill';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const { id } = use(params);
  const job = useCloneJob(id);

  return (
    <div className="flex h-screen flex-col bg-[#04101A]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#04101A]/80 px-4 backdrop-blur-xl">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/cloner/jobs/${id}`} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Voltar ao editor
            </span>
          </Link>
        </Button>
        <div className="mx-2 h-6 w-px bg-white/10" aria-hidden />
        <p className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
          Preview final · <span className="text-white/80 normal-case tracking-normal">{job.data?.url ?? id}</span>
        </p>
        <StatusPill status={job.data?.status} progress={job.data?.progress} />
      </header>
      <main className="flex-1 bg-[#04101A]">
        {job.data?.status === 'ready' ? (
          <iframe
            title="Preview final"
            src={apiClient.previewUrl(id)}
            sandbox="allow-same-origin allow-popups"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Aguardando clone ficar pronto…
          </div>
        )}
      </main>
    </div>
  );
}
