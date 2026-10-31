import type { ManagedTask, TaskPerson } from '@page-cloner/shared';

export const demoTaskPeople: TaskPerson[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Lucas Gomes',
    clickupId: '10001',
    discordId: '10001',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Dods',
    clickupId: '10002',
    discordId: '10002',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Iago Rodrigues',
    clickupId: '10003',
    discordId: '10003',
  },
];
export function demoTasks(): ManagedTask[] {
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3600000).toISOString();
  return [
    {
      title: 'Criar novo perfil de Spy',
      sector: 'Spy',
      offer: 'PJR_ENG',
      status: 'progress',
      assignees: [demoTaskPeople[0]!, demoTaskPeople[1]!],
      dueAt: ago(-5),
      completedAt: null,
    },
    {
      title: 'Revisar as copies da nova leva',
      sector: 'Copy',
      offer: 'PJR_ESP',
      status: 'pending',
      assignees: [demoTaskPeople[2]!],
      dueAt: ago(3),
      completedAt: null,
    },
    {
      title: 'Validar instalação do tracking',
      sector: 'Tecnologia',
      offer: 'SLM_DE',
      status: 'done',
      assignees: [demoTaskPeople[0]!],
      dueAt: ago(10),
      completedAt: ago(12),
    },
    {
      title: 'Editar criativos da leva 18',
      sector: 'Edição',
      offer: 'PJR_ENG',
      status: 'pending',
      assignees: [demoTaskPeople[1]!],
      dueAt: ago(-24),
      completedAt: null,
    },
  ].map(
    (item, index) =>
      ({
        id: `00000000-0000-4000-8000-00000000001${index}`,
        clickupId: null,
        description: 'Exemplo demonstrativo. Nenhuma tarefa real é alterada.',
        priority: 'normal',
        source: 'discord',
        receivedAt: ago(36),
        assignedAt: ago(35),
        assignmentReceivedAt: Object.fromEntries(item.assignees.map((p) => [p.id, ago(35)])),
        startedAt: item.status === 'pending' ? null : ago(24),
        updatedAt: ago(1),
        syncState: 'synced',
        discordState: 'synced',
        ...item,
      }) as ManagedTask,
  );
}
