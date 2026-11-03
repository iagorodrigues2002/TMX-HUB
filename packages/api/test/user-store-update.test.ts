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
  { name: 'clears an explicit empty array', initial: ['ofertas'], patch: [] },
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
  const evalCommand = vi.fn(async (_script, _count, _key, _op, fields, clearTools) => {
    const saved: Record<string, string> = { ...record, ...JSON.parse(fields) };
    return Object.entries(saved)
      .filter(([key]) => clearTools !== '1' || key !== 'allowedTools')
      .flat();
  });
  const store = new UserStore({
    eval: evalCommand,
  } as unknown as Redis);

  const updated = await store.update(record.id, { name: ' Updated ', allowedTools: patch });

  const { allowedTools: _storedTools, ...identity } = record;
  expect(updated).toMatchObject({ ...identity, name: 'Updated' });
  expect(updated.allowedTools).toEqual(expected);
  expect(Object.hasOwn(updated, 'allowedTools')).toBe(expected !== undefined);
  expect(evalCommand).toHaveBeenCalledOnce();
  expect(evalCommand.mock.calls[0]![2]).toBe('user:fixture-user');
  const fields = JSON.parse(evalCommand.mock.calls[0]![4]);
  expect(fields.name).toBe('Updated');
  expect(fields).not.toHaveProperty('passwordHash');
  expect(fields).not.toHaveProperty('role');
  expect(fields.allowedTools).toBe(patch?.length ? JSON.stringify(patch) : undefined);
});
