import type { ManagedTask, TaskPerson } from '@page-cloner/shared';

export const taskStatusLabel = {
  pending: 'Pendente',
  progress: 'Em progresso',
  done: 'Concluída',
} as const;
export function summarizeTasks(tasks: ManagedTask[], people: TaskPerson[], now = Date.now()) {
  return people.map((person) => {
    const assigned = tasks.filter((task) => task.assignees.some(({ id }) => id === person.id));
    const open = assigned.filter((task) => task.status !== 'done');
    return {
      person,
      tasks: assigned,
      open: open.length,
      progress: assigned.filter((task) => task.status === 'progress').length,
      done: assigned.filter((task) => task.status === 'done').length,
      overdue: open.filter((task) => task.dueAt && Date.parse(task.dueAt) < now).length,
    };
  });
}
export function taskDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Não informada';
}
