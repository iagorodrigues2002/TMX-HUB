'use client';

import { use } from 'react';
import { HubShell } from '@/components/hub/hub-shell';
import { AuditDetail } from '@/components/digi/audit-detail';

export const dynamic = 'force-dynamic';

export default function DigiApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <HubShell breadcrumb={['TOOLS', 'DIGI APPROVAL', id.slice(-6).toUpperCase()]}>
      <div className="mx-auto max-w-6xl">
        <AuditDetail id={id} />
      </div>
    </HubShell>
  );
}
