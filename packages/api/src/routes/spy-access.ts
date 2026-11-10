import { hasNavigationAccess } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { membershipTools } from '../lib/company-tools.js';
import { HttpProblem } from '../lib/problem.js';

export function spyMembershipAllowed(
  actor: { role: string; tools?: readonly string[] },
  binding: { role: string; status: string; tools: unknown },
  accountTools?: Parameters<typeof membershipTools>[1],
) {
  if (actor.role === 'admin') return true;
  const tools = membershipTools(binding, accountTools);
  return (
    binding.status === 'active' &&
    tools.includes('ofertas') &&
    ['spy-offers', 'spy-monitor', 'spy-cloning', 'spy-settings'].some((id) =>
      hasNavigationAccess(tools, id),
    )
  );
}

export async function spyAccessRoutes(app: FastifyInstance) {
  app.get('/spy/access', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!app.db || !req.user) throw new HttpProblem({ status: 503, title: 'Unavailable' });
    const query = z
      .object({ company: z.string().uuid().optional(), people: z.literal('1').optional() })
      .parse(req.query);
    const account = await app.userStore.getById(req.user.sub);
    const rows = await app.db`SELECT c.id::text,c.name,m.role,m.status,m.tools
      FROM companies c LEFT JOIN company_memberships m ON m.company_id=c.id AND m.user_id=${req.user.sub}
      ORDER BY c.name,c.id`;
    const companies = rows.filter((r) =>
      spyMembershipAllowed(req.user!, r as never, account.allowedTools),
    );
    const selected = query.company
      ? companies.find((c) => c.id === query.company)
      : (companies.find((c) => c.role === 'owner' && c.status === 'active') ?? companies[0]);
    if (!selected)
      throw new HttpProblem({
        status: 403,
        title: 'Forbidden',
        detail: 'Spy não liberado nesta empresa.',
      });
    const members = query.people
      ? await app.db`SELECT user_id FROM company_memberships WHERE company_id::text=${selected.id} AND status='active'`
      : [];
    const users = (
      await Promise.all(
        members.map(async (m) => {
          const u = await app.userStore.maybeGetById(m.user_id);
          return u ? { id: u.id, name: u.name } : null;
        }),
      )
    ).filter((u) => u !== null);
    const scoped =
      req.user.role === 'admin'
        ? undefined
        : membershipTools(selected as never, account.allowedTools);
    return {
      owner: `company:${selected.id}`,
      companyId: selected.id,
      companyName: selected.name,
      userId: req.user.sub,
      canConfigure: req.user.role === 'admin' || hasNavigationAccess(scoped, 'spy-settings'),
      canEdit: req.user.role === 'admin' || hasNavigationAccess(scoped, 'spy-offers'),
      canMonitor: req.user.role === 'admin' || hasNavigationAccess(scoped, 'spy-monitor'),
      owners: companies.map((c) => `company:${c.id}`),
      companies: companies.map((c) => ({ id: c.id as string, name: c.name as string })),
      users,
    };
  });
}
