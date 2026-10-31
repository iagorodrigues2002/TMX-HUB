import { HubShell } from '@/components/hub/hub-shell';
import { TaskManagementPage } from '@/components/tasks/task-management-page';

export default function TasksPage() {
  return (
    <HubShell breadcrumb={['ADMIN', 'Gestão de tarefas']}>
      <TaskManagementPage />
    </HubShell>
  );
}
