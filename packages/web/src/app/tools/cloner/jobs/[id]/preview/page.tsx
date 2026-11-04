'use client';

import { PublicSurface } from '@/components/hub/public-surface';

import { PreviewFrame } from '@/components/editor/preview-frame';
import { StatusPill } from '@/components/editor/status-pill';
import { Button } from '@/components/ui/button';
import { useCloneJob } from '@/hooks/use-clone-job';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const { id } = use(params);
  const job = useCloneJob(id);

  return (
    <PublicSurface>
      <div className="flex h-screen flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 backdrop-blur-xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/tools/cloner/jobs/${id}`} className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Voltar ao editor
              </span>
            </Link>
          </Button>
          <div className="mx-2 h-6 w-px bg-accent" aria-hidden />
          <p className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Preview final ·{' '}
            <span className="text-foreground normal-case tracking-normal">
              {job.data?.url ?? id}
            </span>
          </p>
          <StatusPill status={job.data?.status} progress={job.data?.progress} />
        </header>
        <main className="flex-1 bg-background">
          {job.data?.status === 'ready' ? (
            <PreviewFrame jobId={id} status={job.data.status} />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Aguardando clone ficar pronto…
            </div>
          )}
        </main>
      </div>
    </PublicSurface>
  );
}
