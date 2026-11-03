import { HubShell } from '@/components/hub/hub-shell';
import { TaskManagementPage } from '@/components/tasks/task-management-page';

export default function TasksPage() {
  return (
    <HubShell breadcrumb={['Empresa', 'Tarefas e calls']}>
      <TaskManagementPage />
    </HubShell>
  );
}
