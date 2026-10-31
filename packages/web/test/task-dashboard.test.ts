import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskCreateSchema } from '@page-cloner/shared';
import { demoTaskPeople, demoTasks } from '../src/components/tasks/task-fixtures';
import { summarizeTasks, taskDate } from '../src/lib/task-dashboard';

test('multi-assignee tasks count once per person without duplicating the task', () => {
  const tasks = demoTasks();
  const people = summarizeTasks(tasks, demoTaskPeople);
  assert.equal(tasks.length, 4);
  assert.equal(people[0]!.tasks.length, 2);
  assert.equal(people[1]!.tasks.length, 2);
  assert.equal(people[2]!.overdue, 1);
  assert.equal(people[0]!.done, 1);
  assert.equal(taskDate(null), 'Não informada');
});
test('task form rejects missing or duplicate assignees and undeclared fields', () => {
  const input = {
    title: 'QA task',
    sector: 'Spy',
    offer: null,
    priority: 'normal',
    dueAt: null,
    assigneeIds: [demoTaskPeople[0]!.id],
  };
  assert.equal(TaskCreateSchema.safeParse(input).success, true);
  assert.equal(TaskCreateSchema.safeParse({ ...input, assigneeIds: [] }).success, false);
  assert.equal(
    TaskCreateSchema.safeParse({
      ...input,
      assigneeIds: [...input.assigneeIds, ...input.assigneeIds],
    }).success,
    false,
  );
  assert.equal(TaskCreateSchema.safeParse({ ...input, role: 'admin' }).success, false);
});
