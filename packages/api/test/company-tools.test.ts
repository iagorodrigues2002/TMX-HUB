import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import { effectiveCompanyTools } from '../src/lib/company-tools.js';

describe('effective company tools', () => {
  const db = (memberships: unknown[]) => vi.fn(async () => memberships) as unknown as Sql;
  it('preserves legacy without memberships and distinguishes empty member grants', async () => {
    expect(await effectiveCompanyTools(db([]), 'user', 'user')).toBeUndefined();
    expect(await effectiveCompanyTools(db([]), 'user', 'user', ['ofertas'])).toEqual(['ofertas']);
    expect(
      await effectiveCompanyTools(
        db([{ role: 'member', status: 'active', tools: [] }]),
        'user',
        'user',
      ),
    ).toEqual([]);
  });
  it('owners/admins get all tools but never exceed account cap', async () => {
    const sql = db([{ role: 'admin', status: 'active', tools: [] }]);
    expect(await effectiveCompanyTools(sql, 'user', 'user')).toEqual(ALL_TOOL_KEYS);
    const legacyCapped = await effectiveCompanyTools(sql, 'user', 'user', ['ofertas']);
    expect(legacyCapped?.filter((key) => !key.startsWith('nav:'))).toEqual(['ofertas']);
    expect(
      await effectiveCompanyTools(sql, 'user', 'user', ['nav:scoped', 'nav:offers-all', 'ofertas']),
    ).toEqual(['nav:scoped', 'nav:offers-all', 'ofertas']);
  });
  it('unions only active valid tools, including immediate changes', async () => {
    const rows = [
      { role: 'member', status: 'active', tools: ['ofertas', 'invalid'] },
      { role: 'owner', status: 'suspended', tools: [] },
    ];
    const sql = db(rows);
    expect(await effectiveCompanyTools(sql, 'user', 'user')).toEqual(['ofertas']);
    rows[0]!.tools = [];
    expect(await effectiveCompanyTools(sql, 'user', 'user')).toEqual([]);
    rows[0]!.status = 'suspended';
    await expect(effectiveCompanyTools(sql, 'user', 'user')).rejects.toMatchObject({ status: 401 });
  });
  it('global admin is explicit and does not query company grants', async () => {
    const sql = db([]);
    expect(await effectiveCompanyTools(sql, 'admin', 'admin')).toBeUndefined();
    expect(sql).not.toHaveBeenCalled();
  });
});
