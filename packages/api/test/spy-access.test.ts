import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { spyAccessRoutes, spyMembershipAllowed } from '../src/routes/spy-access.js';
it('Spy access scopes workspaces, avoids people reads for images and rechecks suspension', async () => {
  const app = Fastify();
  const id = '69706e9a-95ad-493e-b4ab-4a6de7541adc';
  let active = true;
  let admin = false;
  let peopleReads = 0;
  app.decorate('db', (async (strings: TemplateStringsArray) => {
    if (strings.join('').includes('SELECT user_id')) {
      peopleReads++;
      return [{ user_id: 'member' }];
    }
    return [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Alphabetically first',
        role: null,
        status: null,
        tools: [],
      },
      {
        id,
        name: 'Company A',
        role: admin ? 'owner' : 'member',
        tools: ['ofertas', 'nav:scoped', 'nav:spy-offers'],
        status: active ? 'active' : 'suspended',
      },
    ];
  }) as never);
  app.decorate('userStore', {
    getById: async () => ({ allowedTools: undefined }),
    maybeGetById: async () => ({ id: 'member', name: 'Member' }),
  } as never);
  app.addHook('preHandler', async (req) => {
    req.user = { sub: 'member', role: admin ? 'admin' : 'user' } as never;
  });
  await app.register(spyAccessRoutes);
  try {
    const check = await app.inject(`/spy/access?company=${id}`);
    expect(check.statusCode).toBe(200);
    expect(check.json().owner).toBe(`company:${id}`);
    expect(check.json().canConfigure).toBe(false);
    expect(check.json().canEdit).toBe(true);
    expect(check.json().users).toEqual([]);
    expect(peopleReads).toBe(0);
    expect((await app.inject(`/spy/access?company=${id}&people=1`)).json().users).toEqual([
      { id: 'member', name: 'Member' },
    ]);
    expect(
      (await app.inject('/spy/access?company=11111111-1111-4111-8111-111111111111')).statusCode,
    ).toBe(403);
    active = false;
    expect((await app.inject(`/spy/access?company=${id}`)).statusCode).toBe(403);
    active = true;
    admin = true;
    expect((await app.inject('/spy/access')).json().companyId).toBe(id);
  } finally {
    await app.close();
  }
});
describe('Spy company access', () => {
  const member = { role: 'user' };
  const binding = {
    role: 'member',
    status: 'active',
    tools: ['ofertas', 'nav:scoped', 'nav:spy-offers'],
  };
  it('uses company-local grants and refuses suspension or another company grant', () => {
    expect(spyMembershipAllowed(member, binding)).toBe(true);
    expect(spyMembershipAllowed(member, { ...binding, status: 'suspended' })).toBe(false);
    expect(
      spyMembershipAllowed(
        { role: 'user', tools: binding.tools },
        { ...binding, tools: ['ofertas', 'nav:scoped', 'nav:offers-all'] },
      ),
    ).toBe(false);
    expect(spyMembershipAllowed(member, binding, ['ofertas', 'nav:scoped', 'nav:offers-all'])).toBe(
      false,
    );
    expect(
      spyMembershipAllowed(member, { ...binding, tools: ['nav:spy-offers', 'nav:scoped'] }),
    ).toBe(false);
  });
  it('allows global admin and company owner while respecting account ceiling', () => {
    expect(spyMembershipAllowed({ role: 'admin' }, { role: '', status: '', tools: [] })).toBe(true);
    expect(spyMembershipAllowed(member, { ...binding, role: 'owner' })).toBe(true);
    expect(
      spyMembershipAllowed(member, { ...binding, role: 'owner' }, [
        'ofertas',
        'nav:scoped',
        'nav:offers-all',
      ]),
    ).toBe(false);
  });
});
