import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CompanyTransition,
  transitionCompanies,
  validateCompanyTransition,
} from '../src/services/company-transition.js';

const company = randomUUID();
const inventory = {
  users: [
    { id: 'global', role: 'admin' },
    { id: 'owner', role: 'user' },
    { id: 'member', role: 'user' },
  ],
  offers: [{ id: 'offer', userId: 'owner' }],
};
const plan: CompanyTransition = {
  globalAdmins: ['global'],
  standaloneUsers: [],
  companies: [
    {
      id: company,
      name: 'TMX fixture',
      createdBy: 'owner',
      offers: [{ id: 'offer', ownerUserId: 'owner' }],
      members: [
        {
          userId: 'owner',
          role: 'owner',
          status: 'active',
          tools: ['ofertas'],
          allOffers: true,
          offerIds: [],
        },
        {
          userId: 'member',
          role: 'member',
          status: 'active',
          tools: ['ofertas'],
          allOffers: false,
          offerIds: ['offer'],
        },
      ],
    },
  ],
};
it('requires complete, explicit identities and global administrator roles', () => {
  expect(() => validateCompanyTransition(plan, inventory)).not.toThrow();
  expect(() =>
    validateCompanyTransition(plan, {
      ...inventory,
      users: [...inventory.users, { id: 'forgotten', role: 'user' }],
    }),
  ).toThrow('Unclassified users');
  expect(() =>
    validateCompanyTransition(plan, {
      ...inventory,
      offers: [...inventory.offers, { id: 'forgotten', userId: 'owner' }],
    }),
  ).toThrow('Unclassified offers');
  expect(() =>
    validateCompanyTransition(plan, {
      ...inventory,
      users: inventory.users.map((u) => (u.id === 'member' ? { ...u, role: 'admin' } : u)),
    }),
  ).toThrow('Global role mismatch');
});
it('supports two companies owned by one account without merging by display name', () => {
  const multiple = structuredClone(plan);
  multiple.companies.push({
    ...structuredClone(plan.companies[0]!),
    id: randomUUID(),
    offers: [],
    members: [structuredClone(plan.companies[0]!.members[0]!)],
  });
  expect(() => validateCompanyTransition(multiple, inventory)).not.toThrow();
});
it('rejects guessed ownership and cross-company grants', () => {
  const wrong = structuredClone(plan);
  wrong.companies[0]!.offers[0]!.ownerUserId = 'member';
  expect(() => validateCompanyTransition(wrong, inventory)).toThrow('ownership');
  const grant = structuredClone(plan);
  grant.companies[0]!.members[1]!.offerIds = ['foreign'];
  expect(() => validateCompanyTransition(grant, inventory)).toThrow('Cross-company');
});
it('stages explicit global demotion only after replacement company access exists in the plan', () => {
  const staged = structuredClone(plan);
  staged.companies[0]!.members[1]!.role = 'admin';
  staged.companies[0]!.members[1]!.allOffers = true;
  staged.roleChanges = [{ userId: 'member', from: 'admin', to: 'user' }];
  const legacy = {
    ...inventory,
    users: inventory.users.map((u) => (u.id === 'member' ? { ...u, role: 'admin' } : u)),
  };
  expect(validateCompanyTransition(staged, legacy).pendingRoleChanges).toEqual(staged.roleChanges);
  expect(validateCompanyTransition(staged, inventory).pendingRoleChanges).toEqual([]);
  staged.companies[0]!.members[1]!.status = 'suspended';
  expect(() => validateCompanyTransition(staged, legacy)).toThrow(
    'replacement company administration',
  );
});
it('rejects unapproved promotion, inconsistent inventory and duplicate role changes', () => {
  expect(() =>
    validateCompanyTransition(plan, {
      ...inventory,
      users: [...inventory.users, inventory.users[0]!],
    }),
  ).toThrow('Duplicate identity');
  const promoted = structuredClone(plan);
  promoted.globalAdmins.push('member');
  expect(() => validateCompanyTransition(promoted, inventory)).toThrow('Global role mismatch');
  const duplicate = structuredClone(plan);
  duplicate.roleChanges = [
    { userId: 'member', from: 'admin', to: 'user' },
    { userId: 'member', from: 'admin', to: 'user' },
  ];
  expect(() => validateCompanyTransition(duplicate, inventory)).toThrow('Duplicate role change');
});
it('keeps full-access invitees separate from company members and tool-only accounts', () => {
  const onboarding = structuredClone(plan);
  onboarding.onboardingUsers = ['invitee'];
  onboarding.standaloneUsers = ['video'];
  const accounts = {
    ...inventory,
    users: [
      ...inventory.users,
      { id: 'invitee', role: 'user' },
      { id: 'video', role: 'user', allowedTools: ['video-shield'] },
    ],
  };
  expect(validateCompanyTransition(onboarding, accounts).onboardingUsers).toEqual(['invitee']);
  expect(() =>
    validateCompanyTransition(onboarding, {
      ...accounts,
      offers: [...inventory.offers, { id: 'hidden', userId: 'invitee' }],
    }),
  ).toThrow('Invalid company onboarding');
  expect(() =>
    validateCompanyTransition(onboarding, {
      ...accounts,
      users: accounts.users.map((u) =>
        u.id === 'video' ? { ...u, allowedTools: ['ofertas'] } : u,
      ),
    }),
  ).toThrow('Video Studio only');
  onboarding.companies[0]!.members.push({
    ...onboarding.companies[0]!.members[1]!,
    userId: 'invitee',
  });
  expect(() => validateCompanyTransition(onboarding, accounts)).toThrow(
    'Invalid/duplicate company member',
  );
});
describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('transition transaction', () => {
  const schema = `transition_${randomUUID().replaceAll('-', '')}`;
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.username !== 'tmx_tasks_test' ||
      url.pathname !== '/tmx_tasks_test'
    )
      throw Error('Only isolated test database');
    root = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await root.unsafe(`CREATE SCHEMA ${schema}`);
    db = postgres(url.toString(), {
      max: 1,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    await db.unsafe(
      readFileSync(new URL('../migrations/109_company_memberships.sql', import.meta.url), 'utf8'),
    );
    await db`CREATE TABLE managed_calls(id text PRIMARY KEY,body jsonb NOT NULL)`;
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  it('dry run writes nothing; applying twice preserves exact grants', async () => {
    await transitionCompanies(db, plan, inventory);
    expect(await db`SELECT * FROM companies`).toHaveLength(0);
    await transitionCompanies(db, plan, inventory, true);
    await transitionCompanies(db, plan, inventory, true);
    expect(await db`SELECT * FROM company_memberships`).toHaveLength(2);
    expect(await db`SELECT * FROM company_offer_grants`).toHaveLength(1);
  });
  it('conflicts abort without rewriting prior permissions', async () => {
    const changed = structuredClone(plan);
    changed.companies[0]!.members[1]!.allOffers = true;
    await expect(transitionCompanies(db, changed, inventory, true)).rejects.toThrow(
      'Membership conflict',
    );
    const [member] = await db`SELECT all_offers FROM company_memberships WHERE user_id='member'`;
    expect(member!.all_offers).toBe(false);
  });
  it('reports pending global roles without pretending SQL success changed Redis', async () => {
    const staged = structuredClone(plan);
    staged.roleChanges = [{ userId: 'owner', from: 'admin', to: 'user' }];
    const legacy = {
      ...inventory,
      users: inventory.users.map((u) => (u.id === 'owner' ? { ...u, role: 'admin' } : u)),
    };
    const result = await transitionCompanies(db, staged, legacy, true);
    expect(result.applied).toBe(true);
    expect(result.accountRolesReady).toBe(false);
    expect(result.pendingRoleChanges).toEqual(staged.roleChanges);
    expect(legacy.users.find((u) => u.id === 'owner')!.role).toBe('admin');
    const completed = await transitionCompanies(db, staged, inventory, true);
    expect(completed.accountRolesReady).toBe(true);
    expect(completed.pendingRoleChanges).toEqual([]);
    expect(await db`SELECT * FROM company_memberships`).toHaveLength(2);
    await expect(
      transitionCompanies(
        db,
        staged,
        {
          ...inventory,
          users: inventory.users.map((u) => (u.id === 'owner' ? { ...u, role: 'unexpected' } : u)),
        },
        true,
      ),
    ).rejects.toThrow('Invalid role change');
  });
  it('fails without partial additions when an existing company is omitted', async () => {
    const addition = structuredClone(plan);
    addition.companies[0]!.id = randomUUID();
    await expect(transitionCompanies(db, addition, inventory, true)).rejects.toThrow(
      'Existing companies absent',
    );
    expect(await db`SELECT * FROM companies`).toHaveLength(1);
  });
  it('binds explicitly reviewed legacy calls without changing revision, receipts or mode', async () => {
    const id = randomUUID();
    const body = {
      id,
      managementMode: 'clickup',
      revision: 3,
      participants: [{ userId: 'member' }],
      discordMessageId: '123',
      title: 'Existing call',
    };
    await db`INSERT INTO managed_calls VALUES(${id},${db.json(body)})`;
    const callsPlan = {
      ...structuredClone(plan),
      companies: plan.companies.map((c) => ({ ...c, legacyCallIds: [id] })),
    };
    await transitionCompanies(db, callsPlan, inventory);
    expect((await db`SELECT body FROM managed_calls WHERE id=${id}`)[0]!.body).toEqual(body);
    await transitionCompanies(db, callsPlan, inventory, true);
    await transitionCompanies(db, callsPlan, inventory, true);
    expect((await db`SELECT body FROM managed_calls WHERE id=${id}`)[0]!.body).toEqual({
      ...body,
      companyId: company,
    });
  });
  it('rejects calls with foreign participants or conflicting company without partial writes', async () => {
    for (const patch of [
      { participants: [{ userId: 'stranger' }] },
      { companyId: randomUUID(), participants: [{ userId: 'member' }] },
      { managementMode: 'native', participants: [{ userId: 'member' }] },
    ]) {
      const id = randomUUID();
      const body = { id, ...patch };
      await db`INSERT INTO managed_calls VALUES(${id},${db.json(body)})`;
      const callsPlan = {
        ...structuredClone(plan),
        companies: plan.companies.map((c) => ({ ...c, legacyCallIds: [id] })),
      };
      await expect(transitionCompanies(db, callsPlan, inventory, true)).rejects.toThrow(
        'Legacy call',
      );
      expect((await db`SELECT body FROM managed_calls WHERE id=${id}`)[0]!.body).toEqual(body);
    }
  });
});
