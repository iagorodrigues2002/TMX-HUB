import { ALL_TOOL_KEYS, type ToolKey } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { HttpProblem } from './problem.js';

export type CompanyToolMembership = { role: string; status: string; tools: unknown };

/** Intersect one company's grants with the account ceiling; never borrow another company's role. */
export function membershipTools(membership: CompanyToolMembership, accountTools?: ToolKey[]) {
  if (membership.status !== 'active') return [];
  const cap = accountTools?.length ? accountTools : undefined;
  const keys = ['owner', 'admin'].includes(membership.role) ? ALL_TOOL_KEYS : membership.tools;
  return (Array.isArray(keys) ? keys : []).filter(
    (key): key is ToolKey =>
      ALL_TOOL_KEYS.includes(key) &&
      (!cap || cap.includes(key) || (key.startsWith('nav:') && !cap.includes('nav:scoped'))),
  );
}

/** undefined preserves unrestricted legacy accounts; [] explicitly grants no tools. */
export async function effectiveCompanyTools(
  db: Sql | null | undefined,
  userId: string,
  role: 'admin' | 'user',
  accountTools?: ToolKey[],
): Promise<ToolKey[] | undefined> {
  if (role === 'admin') return undefined;
  const cap = accountTools?.length ? accountTools : undefined;
  if (!db) return cap;
  // Never cache memberships: suspension and revocation take effect on the next request.
  const memberships =
    await db`SELECT role,status,tools FROM company_memberships WHERE user_id=${userId}`;
  if (!memberships.length) return cap;
  const active = memberships.filter((membership) => membership.status === 'active');
  if (!active.length)
    throw new HttpProblem({
      status: 401,
      title: 'Unauthorized',
      detail: 'Acesso empresarial suspenso.',
    });
  const granted = new Set<ToolKey>();
  for (const membership of active) {
    for (const key of membershipTools(membership as CompanyToolMembership, cap)) granted.add(key);
  }
  return [...granted];
}
