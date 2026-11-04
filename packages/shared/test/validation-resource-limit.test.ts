import { describe, expect, it } from 'vitest';
import { TaskCreateSchema } from '../src/task-management.js';

describe('bounded collection validation', () => {
  it('rejects an oversized invalid assignee list before collecting an issue per element', () => {
    const result = TaskCreateSchema.shape.assigneeIds.safeParse(Array(50_000).fill(null));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].code).toBe('too_big');
    }
  });

  it('retains accepted task fields, defaults and normalized values', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(
      TaskCreateSchema.parse({
        title: '  Revisar anúncio  ',
        sector: 'Tráfego',
        offer: null,
        assigneeIds: [id],
        priority: 'normal',
        dueAt: null,
      }),
    ).toEqual({
      title: 'Revisar anúncio',
      description: '',
      sector: 'Tráfego',
      offer: null,
      assigneeIds: [id],
      priority: 'normal',
      dueAt: null,
    });
  });
});
