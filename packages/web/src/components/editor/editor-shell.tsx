'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CloneJob } from '@/lib/api-client';
import { truncate } from '@/lib/utils';
import { ExternalLink, PanelLeft, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { BuildButton } from './build-button';
import { StatusPill } from './status-pill';

interface EditorShellProps {
  jobId: string;
  job: CloneJob | undefined;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

const DESKTOP_EDITOR_QUERY = '(min-width: 1024px)';

function subscribeToDesktopLayout(callback: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_EDITOR_QUERY);
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function getDesktopLayoutSnapshot() {
  return window.matchMedia(DESKTOP_EDITOR_QUERY).matches;
}

function getServerLayoutSnapshot() {
  return false;
}

export function EditorShell({ jobId, job, left, center, right }: EditorShellProps) {
  const breadcrumb = ['CLONER', `JOB ${jobId.slice(0, 6).toUpperCase()}`];
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopLayout,
    getDesktopLayoutSnapshot,
    getServerLayoutSnapshot,
  );

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
          <span className="font-semibold uppercase tracking-[0.18em] text-white/40">Source</span>
          <span className="min-w-0 flex-1 truncate font-mono text-white/70">
            {truncate(job?.url ?? jobId, 110)}
          </span>
          {job?.finalUrl && job.finalUrl !== job.url && (
            <span className="hidden truncate font-mono text-white/45 md:inline">
              → {truncate(job.finalUrl, 80)}
            </span>
          )}
        </div>

        {isDesktop ? (
          <main className="grid flex-1 grid-cols-[280px_1fr_360px] overflow-hidden">
            <section className="overflow-hidden border-r border-white/[0.06]">{left}</section>
            <EditorCanvas job={job}>{center}</EditorCanvas>
            <section className="overflow-hidden border-l border-white/[0.06]">{right}</section>
          </main>
        ) : (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 gap-2 border-b border-white/[0.06] bg-white/[0.02] p-2">
              <MobilePanelDialog
                triggerLabel="Estrutura"
                title="Estrutura da página"
                description="Navegue pelos formulários e links encontrados."
                icon={<PanelLeft className="h-4 w-4" />}
              >
                {left}
              </MobilePanelDialog>
              <MobilePanelDialog
                triggerLabel="Edição"
                title="Editar elemento"
                description="Ajuste o formulário ou link selecionado."
                icon={<SlidersHorizontal className="h-4 w-4" />}
              >
                {right}
              </MobilePanelDialog>
            </div>
            <EditorCanvas job={job}>{center}</EditorCanvas>
          </main>
        )}
      </div>
    </HubShell>
  );
}

function EditorCanvas({ job, children }: { job: CloneJob | undefined; children: ReactNode }) {
  return (
    <section className="relative min-h-0 overflow-hidden bg-white/[0.02]">
      {children}
      {job?.counts && job.status === 'ready' && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-sm border border-white/10 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65 backdrop-blur">
          {job.counts.forms ?? 0} formulários · {job.counts.links ?? 0} links ·{' '}
          {job.counts.assets ?? 0} assets
        </div>
      )}
    </section>
  );
}

interface MobilePanelDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}

function MobilePanelDialog({
  triggerLabel,
  title,
  description,
  icon,
  children,
}: MobilePanelDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-10 flex-1">
          {icon}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(82dvh,720px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-white/[0.06] p-4 pr-14">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
