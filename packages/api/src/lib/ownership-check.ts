import type { Redis } from 'ioredis';
import { HttpProblem, NotFoundError } from './problem.js';

export type OwnedResourceTable = 'clone' | 'vsl' | 'funnel';

const OWNER_FIELD = 'userId';

function resourceKey(table: OwnedResourceTable, id: string): string {
  return `${table}:${id}`;
}

export async function assignOwnership(
  redis: Redis,
  table: OwnedResourceTable,
  id: string,
  userId: string,
): Promise<void> {
  await redis.hset(resourceKey(table, id), OWNER_FIELD, userId);
}

export async function requireOwnership(
  redis: Redis,
  table: OwnedResourceTable,
  id: string,
  userId: string,
): Promise<void> {
  const ownerId = await redis.hget(resourceKey(table, id), OWNER_FIELD);
  if (!ownerId) {
    throw new NotFoundError(`${table} resource not found.`);
  }
  if (ownerId !== userId) {
    throw new HttpProblem({
      status: 403,
      title: 'Forbidden',
      detail: 'You do not have access to this resource.',
      code: 'forbidden',
    });
  }
}
