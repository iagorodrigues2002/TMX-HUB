import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import { z } from 'zod';

const member = z
  .object({
    userId: z.string().min(1),
    role: z.enum(['owner', 'admin', 'member']),
    status: z.enum(['active', 'suspended']),
    tools: z.array(z.enum(ALL_TOOL_KEYS as [string, ...string[]])),
    allOffers: z.boolean(),
    offerIds: z.array(z.string().min(1)),
  })
  .strict();
export const companyTransitionSchema = z
  .object({
    globalAdmins: z.array(z.string().min(1)).min(1),
    // These accounts keep only their existing tool cap, not company data.
    standaloneUsers: z.array(z.string().min(1)),
    // Full-access invitees with no company yet must complete company onboarding.
    onboardingUsers: z.array(z.string().min(1)).optional(),
    // Stage company access before revoking the old global role, never the reverse.
    roleChanges: z
      .array(
        z
          .object({
            userId: z.string().min(1),
            from: z.literal('admin'),
            to: z.literal('user'),
          })
          .strict(),
      )
      .optional(),
    companies: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(120),
          createdBy: z.string().min(1),
          legacyCallIds: z.array(z.string().uuid()).optional(),
          offers: z.array(
            z.object({ id: z.string().min(1), ownerUserId: z.string().min(1) }).strict(),
          ),
          members: z.array(member),
        })
        .strict(),
    ),
  })
  .strict();
export type CompanyTransition = z.infer<typeof companyTransitionSchema>;
export type TransitionInventory = {
  users: { id: string; role: string; allowedTools?: readonly string[] }[];
  offers: { id: string; userId: string }[];
};

export function validateCompanyTransition(
  input: CompanyTransition,
  inventory: TransitionInventory,
) {
  const plan = companyTransitionSchema.parse(input);
  const users = new Map(inventory.users.map((u) => [u.id, u]));
  const offers = new Map(inventory.offers.map((o) => [o.id, o]));
  const covered = new Set<string>();
  const assigned = new Set<string>();
  const companyIds = new Set<string>();
  const callIds = new Set<string>();
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (users.size !== inventory.users.length || offers.size !== inventory.offers.length)
    fail('Duplicate identity in inventory');
  const onboarding = plan.onboardingUsers ?? [];
  for (const company of plan.companies)
    for (const id of company.legacyCallIds ?? []) {
      if (callIds.has(id)) fail(`Duplicate legacy call: ${id}`);
      callIds.add(id);
    }
  const changes = new Map((plan.roleChanges ?? []).map((change) => [change.userId, change]));
  if (changes.size !== (plan.roleChanges ?? []).length) fail('Duplicate role change');
  for (const id of [...plan.globalAdmins, ...plan.standaloneUsers, ...onboarding]) {
    if (!users.has(id) || covered.has(id)) fail(`Invalid/duplicate account: ${id}`);
    covered.add(id);
  }
  for (const change of changes.values()) {
    const user = users.get(change.userId);
    if (
      !user ||
      ![change.from, change.to].includes(user.role as 'admin' | 'user') ||
      plan.globalAdmins.includes(change.userId)
    )
      fail(`Invalid role change: ${change.userId}`);
    if (
      !plan.companies.some((c) =>
        c.members.some(
          (m) =>
            m.userId === change.userId &&
            m.status === 'active' &&
            m.allOffers &&
            ['owner', 'admin'].includes(m.role),
        ),
      )
    )
      fail(`Role change needs replacement company administration: ${change.userId}`);
  }
  for (const user of inventory.users) {
    if (!['admin', 'user'].includes(user.role)) fail(`Unknown account role: ${user.id}`);
    const targetRole = changes.get(user.id)?.to ?? user.role;
    if ((targetRole === 'admin') !== plan.globalAdmins.includes(user.id))
      fail(`Global role mismatch: ${user.id}; resolve account role before migration`);
  }
  for (const id of plan.standaloneUsers) {
    const tools = users.get(id)?.allowedTools;
    if (!tools?.length || tools.some((tool) => tool !== 'video-shield'))
      fail(`Standalone account must be Video Studio only: ${id}`);
    if (inventory.offers.some((offer) => offer.userId === id))
      fail(`Standalone account owns offers: ${id}`);
  }
  for (const id of onboarding) {
    const user = users.get(id)!;
    if (
      user.role !== 'user' ||
      user.allowedTools?.length ||
      inventory.offers.some((offer) => offer.userId === id)
    )
      fail(`Invalid company onboarding account: ${id}`);
  }
  for (const company of plan.companies) {
    if (companyIds.has(company.id)) fail(`Duplicate company: ${company.id}`);
    companyIds.add(company.id);
    if (
      !company.members.some(
        (m) => m.userId === company.createdBy && m.role === 'owner' && m.status === 'active',
      )
    )
      fail(`Company needs an active founding owner: ${company.id}`);
    const members = new Set<string>();
    for (const m of company.members) {
      if (
        !users.has(m.userId) ||
        members.has(m.userId) ||
        plan.standaloneUsers.includes(m.userId) ||
        onboarding.includes(m.userId)
      )
        fail(`Invalid/duplicate company member: ${m.userId}`);
      members.add(m.userId);
      covered.add(m.userId);
      if (
        new Set(m.offerIds).size !== m.offerIds.length ||
        m.offerIds.some((id) => !company.offers.some((o) => o.id === id))
      )
        fail(`Cross-company or duplicate grant: ${m.userId}`);
    }
    for (const offer of company.offers) {
      if (assigned.has(offer.id) || offers.get(offer.id)?.userId !== offer.ownerUserId)
        fail(`Offer ownership mismatch/duplicate: ${offer.id}`);
      if (
        !company.members.some(
          (m) =>
            m.userId === offer.ownerUserId &&
            ['owner', 'admin'].includes(m.role) &&
            m.status === 'active',
        )
      )
        fail(`Offer owner lacks company management: ${offer.id}`);
      assigned.add(offer.id);
    }
  }
  if (covered.size !== users.size) fail('Unclassified users remain');
  if (assigned.size !== offers.size) fail('Unclassified offers remain');
  return {
    pendingRoleChanges: [...changes.values()].filter(
      (change) => users.get(change.userId)!.role === change.from,
    ),
    onboardingUsers: onboarding,
  };
}

/** A reviewed, complete manifest is required; never infer tenancy from display names. */
export async function transitionCompanies(
  db: Sql,
  plan: CompanyTransition,
  inventory: TransitionInventory,
  apply = false,
) {
  const accountReview = validateCompanyTransition(plan, inventory);
  return db.begin(async (sql) => {
    await sql`LOCK TABLE companies,company_memberships,company_offers,company_offer_grants IN SHARE ROW EXCLUSIVE MODE`;
    if (plan.companies.some((c) => c.legacyCallIds?.length))
      await sql`LOCK TABLE managed_calls IN SHARE ROW EXCLUSIVE MODE`;
    const existing = await sql`SELECT id FROM companies`;
    if (existing.some((row) => !plan.companies.some((c) => c.id === row.id)))
      throw new Error('Existing companies absent from manifest');
    for (const c of plan.companies) {
      for (const id of c.legacyCallIds ?? []) {
        const [call] = await sql`SELECT body FROM managed_calls WHERE id=${id}`;
        const participants = z
          .array(z.object({ userId: z.string().min(1) }))
          .min(1)
          .safeParse(call?.body.participants);
        if (
          !call ||
          (call.body.managementMode ?? 'clickup') !== 'clickup' ||
          (call.body.companyId && call.body.companyId !== c.id) ||
          !participants.success ||
          participants.data.some(
            (p) =>
              !plan.globalAdmins.includes(p.userId) &&
              !c.members.some((m) => m.userId === p.userId && m.status === 'active'),
          )
        )
          throw new Error(`Legacy call requires explicit company and participant review: ${id}`);
      }
      const [current] = await sql`SELECT name,created_by FROM companies WHERE id=${c.id}`;
      if (current && (current.name !== c.name || current.created_by !== c.createdBy))
        throw new Error(`Company conflict: ${c.id}`);
      const memberships = await sql`SELECT * FROM company_memberships WHERE company_id=${c.id}`;
      for (const row of memberships) {
        const m = c.members.find((item) => item.userId === row.user_id);
        if (
          !m ||
          m.role !== row.role ||
          m.status !== row.status ||
          m.allOffers !== row.all_offers ||
          [...m.tools].sort().join('|') !== [...row.tools].sort().join('|')
        )
          throw new Error(`Membership conflict: ${row.user_id}`);
      }
      const bound = await sql`SELECT * FROM company_offers WHERE company_id=${c.id}`;
      if (
        bound.some(
          (row) =>
            !c.offers.some((o) => o.id === row.offer_id && o.ownerUserId === row.owner_user_id),
        )
      )
        throw new Error(`Offer binding conflict: ${c.id}`);
      const grants = await sql`SELECT * FROM company_offer_grants WHERE company_id=${c.id}`;
      if (
        grants.some(
          (row) =>
            !c.members.some((m) => m.userId === row.user_id && m.offerIds.includes(row.offer_id)),
        )
      )
        throw new Error(`Existing grant absent from manifest: ${c.id}`);
    }
    if (apply)
      for (const c of plan.companies) {
        await sql`INSERT INTO companies(id,name,created_by) VALUES(${c.id},${c.name},${c.createdBy}) ON CONFLICT DO NOTHING`;
        for (const m of c.members) {
          await sql`INSERT INTO company_memberships(company_id,user_id,role,status,tools,all_offers)
          VALUES(${c.id},${m.userId},${m.role},${m.status},${m.tools},${m.allOffers}) ON CONFLICT DO NOTHING`;
        }
        for (const o of c.offers) {
          await sql`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${c.id},${o.id},${o.ownerUserId}) ON CONFLICT DO NOTHING`;
        }
        for (const m of c.members)
          for (const id of m.offerIds) {
            await sql`INSERT INTO company_offer_grants(company_id,user_id,offer_id) VALUES(${c.id},${m.userId},${id}) ON CONFLICT DO NOTHING`;
          }
        for (const id of c.legacyCallIds ?? [])
          await sql`UPDATE managed_calls SET body=jsonb_set(body,'{companyId}',${sql.json(c.id)}) WHERE id=${id}`;
      }
    return {
      applied: apply,
      companies: plan.companies.length,
      users: inventory.users.length,
      offers: inventory.offers.length,
      legacyCalls: plan.companies.reduce((total, c) => total + (c.legacyCallIds?.length ?? 0), 0),
      ...accountReview,
      // SQL success alone is not a completed role cutover.
      accountRolesReady: accountReview.pendingRoleChanges.length === 0,
    };
  });
}
