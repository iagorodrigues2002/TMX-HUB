import { CompanyMembers } from '@/components/admin/company-members';
import { HubShell } from '@/components/hub/hub-shell';

export default function CompanyMembersPage() {
  return (
    <HubShell breadcrumb={['Empresa', 'Membros']}>
      <CompanyMembers />
    </HubShell>
  );
}
