'use client';

import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CloneJob } from '@/lib/api-client';
import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { BuildButton } from './build-button';
import { StatusPill } from './status-pill';
import { truncate } from '@/lib/utils';

interface EditorShellProps {
  jobId: string;
  job: CloneJob | undefined;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function EditorShell({ jobId, job, left, center, right }: EditorShellProps) {
  const breadcrumb = ['CLONER', `JOB ${jobId.slice(0, 6).toUpperCase()}`];

  return (
    <HubShell
      breadcrumb={breadcrumb}
      fullBleed
      topbarRight={
        <>
          <StatusPill status={job?.status} progress={job?.progress} />
          {job?.url && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={job.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Origem
              </a>
            </Button>
          )}
          <BuildButton jobId={jobId} disabled={job?.status !== 'ready'} />
        </>
      }
    >
      <div className="flex h-full flex-col">
        {/* Sub-header: source URL */}
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 text-[11px] text-white/55">
          <span className="font-semibold uppercase tracking-[0.18em] text-white/40">
            Source
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-white/70">
            {truncate(job?.url ?? jobId, 110)}
          </span>
          {job?.finalUrl && job.finalUrl !== job.url && (
            <span className="hidden truncate font-mono text-white/45 md:inline">
              → {truncate(job.finalUrl, 80)}
            </span>
          )}
        </div>

        {/* 3-pane editor */}
        <main className="grid flex-1 overflow-hidden lg:grid-cols-[280px_1fr_360px]">
          <section className="hidden overflow-hidden border-r border-white/[0.06] lg:block">
            {left}
          </section>
          <section className="relative overflow-hidden bg-white/[0.02]">
            {center}
            {job?.counts && job.status === 'ready' && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-sm border border-white/10 bg-[#04101A]/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65 backdrop-blur">
                {job.counts.forms ?? 0} formulários · {job.counts.links ?? 0} links ·{' '}
                {job.counts.assets ?? 0} assets
              </div>
            )}
          </section>
          <section className="hidden overflow-hidden border-l border-white/[0.06] lg:block">
            {right}
          </section>
        </main>
      </div>

      {/* TODO: mobile fallback — slide-over drawers for forest + edit panels. */}
    </HubShell>
  );
}
