import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { HubShell } from '@/components/hub/hub-shell';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <HubShell breadcrumb={['ADMIN']}>
      <AdminDashboard />
    </HubShell>
  );
}
