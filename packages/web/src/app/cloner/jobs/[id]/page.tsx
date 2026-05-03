'use client';

import { use } from 'react';
import { EditorShell } from '@/components/editor/editor-shell';
import { EditPanel } from '@/components/editor/edit-panel';
import { ForestPanel } from '@/components/editor/forest-panel';
import { PreviewFrame } from '@/components/editor/preview-frame';
import { JobStatus } from '@/components/job-status';
import { useCloneForms } from '@/hooks/use-clone-forms';
import { useCloneJob } from '@/hooks/use-clone-job';
import { useCloneLinks } from '@/hooks/use-clone-links';

interface JobPageProps {
  params: Promise<{ id: string }>;
}

export default function JobPage({ params }: JobPageProps) {
  const { id } = use(params);
  const job = useCloneJob(id);
  const isReady = job.data?.status === 'ready';
  const forms = useCloneForms(id, isReady);
  const links = useCloneLinks(id, isReady);

  const showEmptyState = !isReady;

  return (
    <EditorShell
      jobId={id}
      job={job.data}
      left={
        <ForestPanel
          forms={forms.data ?? []}
          links={links.data ?? []}
          isLoading={forms.isLoading || links.isLoading}
        />
      }
      center={
        showEmptyState ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="w-full max-w-md">
              <JobStatus
                job={job.data}
                isLoading={job.isLoading}
                error={job.error as Error | null}
              />
            </div>
          </div>
        ) : (
          <PreviewFrame jobId={id} status={job.data?.status} />
        )
      }
      right={<EditPanel jobId={id} forms={forms.data ?? []} links={links.data ?? []} />}
    />
  );
}
