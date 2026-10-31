import { TaskDashboard } from '@/components/tasks/task-dashboard';
import { notFound } from 'next/navigation';

export default function TasksPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <main className="min-h-dvh bg-background p-5 text-foreground sm:p-8">
      <TaskDashboard preview />
    </main>
  );
}
