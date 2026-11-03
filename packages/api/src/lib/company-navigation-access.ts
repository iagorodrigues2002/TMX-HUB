import type { ToolKey } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { type CompanyToolMembership, membershipTools } from './company-tools.js';
import { assertNavigationAccess, navigationRequirements } from './navigation-access.js';
import { HttpProblem } from './problem.js';

type User = { sub: string; role: 'admin' | 'user'; tools?: ToolKey[] };
type Binding = CompanyToolMembership & { company_id: string; offer_id?: string };
const denied = () =>
  new HttpProblem({ status: 403, title: 'Forbidden', code: 'company_section_forbidden' });

function scopedUser<T extends User>(user: T, binding: Binding): T {
  if (binding.status !== 'active') throw denied();
  return { ...user, tools: membershipTools(binding, user.tools) };
}

/** The account-wide union is for discovering navigation, not authorizing another company's data. */
export async function scopeCompanyNavigationUser<T extends User>(
  db: Sql | null | undefined,
  user: T,
  rawPath: string,
  params: Record<string, string>,
): Promise<T> {
  if (!db || user.role === 'admin') return user;
  const path = rawPath.replace(/^\/v1/, '');
  if (/^\/companies\/:id(?:\/|$)/.test(path) && params.id) {
    const bindings = await db<Binding[]>`
      SELECT company_id::text,role,status,tools FROM company_memberships
      WHERE company_id::text=${params.id} AND user_id=${user.sub}`;
    const binding = bindings.find((row) => row.company_id === params.id);
    if (!binding) throw denied();
    return scopedUser(user, binding);
  }
  if (/^\/offers\/:id(?:\/|$)/.test(path) && params.id) {
    const bindings = await db<Binding[]>`
      SELECT c.offer_id,c.company_id::text,m.role,m.status,m.tools FROM company_offers c
      LEFT JOIN company_memberships m ON m.company_id=c.company_id AND m.user_id=${user.sub}
      WHERE c.offer_id=${params.id}`;
    const binding = bindings.find((row) => row.offer_id === params.id);
    if (binding) return scopedUser(user, binding);
  }
  return user;
}

export async function filterCompanyNavigationOffers<T extends { id: string }>(
  db: Sql | null | undefined,
  user: User,
  offers: T[],
  path: string,
): Promise<T[]> {
  if (!db || user.role === 'admin' || !offers.length) return offers;
  const ids = offers.map((offer) => offer.id);
  const bindings = await db<Binding[]>`
    SELECT c.offer_id,c.company_id::text,m.role,m.status,m.tools FROM company_offers c
    LEFT JOIN company_memberships m ON m.company_id=c.company_id AND m.user_id=${user.sub}
    WHERE c.offer_id=ANY(${ids}::text[])`;
  const byOffer = new Map(bindings.map((binding) => [binding.offer_id, binding]));
  return offers.filter((offer) => {
    try {
      const binding = byOffer.get(offer.id);
      const scoped = binding ? scopedUser(user, binding) : user;
      if (scoped.tools !== undefined && !scoped.tools.includes('ofertas')) return false;
      // Even shared offer pickers must respect company-local base tool grants.
      if (navigationRequirements(path, 'GET') !== null) assertNavigationAccess(scoped, path, 'GET');
      return true;
    } catch (error) {
      if (error instanceof HttpProblem && error.status === 403) return false;
      throw error;
    }
  });
}
