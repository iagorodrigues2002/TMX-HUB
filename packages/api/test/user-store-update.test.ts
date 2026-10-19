import type { ToolKey } from '@page-cloner/shared';
import type { Redis } from 'ioredis';
import { expect, it, vi } from 'vitest';
import { UserStore } from '../src/services/user-store.js';

const cases: {
  name: string;
  initial?: ToolKey[];
  patch: ToolKey[] | null | undefined;
  expected?: ToolKey[];
}[] = [
  { name: 'preserves restrictions', initial: ['ofertas'], patch: undefined, expected: ['ofertas'] },
  { name: 'keeps an absent field absent', patch: undefined },
  { name: 'removes restrictions', initial: ['ofertas'], patch: null },
  {
    name: 'replaces restrictions',
    initial: ['ofertas'],
    patch: ['tracking'],
    expected: ['tracking'],
  },
  { name: 'preserves an explicit empty array', initial: ['ofertas'], patch: [], expected: [] },
];

it.each(cases)('$name without losing user fields', async ({ initial, patch, expected }) => {
  const record = {
    id: 'fixture-user',
    email: 'fixture@example.test',
    name: 'Fixture',
    passwordHash: 'fixture-hash',
    role: 'user',
    createdAt: '2026-10-18T00:00:00.000Z',
    ...(initial ? { allowedTools: JSON.stringify(initial) } : {}),
  };
  const transaction = {
    del: vi.fn().mockReturnThis(),
    hset: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  const store = new UserStore({
    hgetall: vi.fn().mockResolvedValue(record),
    multi: () => transaction,
  } as unknown as Redis);

  const updated = await store.update(record.id, { name: ' Updated ', allowedTools: patch });

  const { allowedTools: _storedTools, ...identity } = record;
  expect(updated).toMatchObject({ ...identity, name: 'Updated' });
  expect(updated.allowedTools).toEqual(expected);
  expect(Object.hasOwn(updated, 'allowedTools')).toBe(expected !== undefined);
  expect(transaction.del).toHaveBeenCalledWith('user:fixture-user');
  const saved = transaction.hset.mock.calls[0]![1] as Record<string, string>;
  expect(saved.name).toBe('Updated');
  expect(saved.passwordHash).toBe(record.passwordHash);
  expect(saved.allowedTools).toBe(expected?.length ? JSON.stringify(expected) : undefined);
  expect(transaction.exec).toHaveBeenCalledOnce();
});
