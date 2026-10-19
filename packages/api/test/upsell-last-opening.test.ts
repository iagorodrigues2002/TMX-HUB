import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { encryptSecret } from '../src/lib/secret-box.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import trackingAdvancedRoutes from '../src/routes/tracking-advanced.js';

const secret = 'test-key-longer-than-thirty-two-characters';
vi.mock('../src/env.js', () => ({
  env: {
    PUBLIC_BASE_URL: 'https://tmx.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    TRACKING_ENCRYPTION_KEY: 'test-key-longer-than-thirty-two-characters',
    TRACKING_PUBLIC_BASE_URL: 'https://tmx.test',
  },
}));
const attempts = [
  {
    id: 'a',
    project_id: 'project-a',
    order_id: 'order-a',
    stage_id: 'stage-a',
    operator_id: 'member-a',
    opened_at: new Date('2026-10-16T12:00:00Z'),
  },
  {
    id: 'b',
    project_id: 'project-a',
    order_id: 'order-a',
    stage_id: 'stage-a',
    operator_id: 'member-b',
    opened_at: new Date('2026-10-16T12:00:00Z'),
  },
  {
    id: 'c',
    project_id: 'other-project',
    order_id: 'order-a',
    stage_id: 'stage-a',
    operator_id: 'foreign',
    opened_at: new Date('2026-10-16T13:00:00Z'),
  },
  {
    id: 'd',
    project_id: 'project-a',
    order_id: 'off-page',
    stage_id: 'stage-a',
    operator_id: 'foreign',
    opened_at: new Date('2026-10-16T13:00:00Z'),
  },
];

async function fixture({
  user = 'member-a',
  admin = false,
  provider = 'syzepay',
  deny = false,
  empty = false,
} = {}) {
  const app = Fastify();
  const statements: { sql: string; values: unknown[] }[] = [];
  const maybeGetById = vi.fn(async (id: string) => ({ name: `Name ${id}`, email: 'private@test' }));
  app.decorate('db', async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    statements.push({ sql, values });
    if (sql.includes('SELECT id, public_key')) return [{ id: 'project-a', public_key: 'public' }];
    if (sql.includes('SELECT o.id,o.visitor_id,o.external_id'))
      return empty
        ? []
        : ['order-a', 'historic'].map((id) => ({
            id,
            provider,
            external_id: id,
            paid_at: new Date(),
            connection_name: 'Gateway',
            syzepay_session_id: 'session',
            confirmed_vendid_encrypted: encryptSecret('vendid', secret),
            purchased_stage_keys: ['upsell_1'],
            has_upsell: true,
          }));
    if (sql.includes('FROM tracking_upsell_stages'))
      return [
        {
          id: 'stage-a',
          stage_key: 'upsell_1',
          name: 'Upsell',
          slug: 'slug',
          connection_destinations: { 'gateway:syzepay': 'https://checkout.test/upsell' },
        },
      ];
    if (sql.includes('FROM tracking_upsell_operator_attempts')) {
      expect(sql).toContain('SELECT DISTINCT ON (order_id,stage_id)');
      expect(sql).toContain('order_id=ANY(?::text[])');
      expect(sql).toContain('stage_id=ANY(?::text[])');
      expect(sql).toContain('AND (? OR operator_id=?)');
      expect(sql).toContain('ORDER BY order_id,stage_id,opened_at DESC,id DESC');
      expect(sql).not.toMatch(/paid_at|already_purchased/);
      const [project, orders, stages, all, operator] = values;
      return attempts
        .filter(
          (a) =>
            a.project_id === project &&
            orders.includes(a.order_id) &&
            stages.includes(a.stage_id) &&
            (all || a.operator_id === operator),
        )
        .sort((a, b) => b.opened_at.getTime() - a.opened_at.getTime() || b.id.localeCompare(a.id))
        .slice(0, 1);
    }
    if (sql.includes('count(*)')) return [{ total: 2 }];
    return [];
  });
  app.decorate('offerStore', {
    assertAccess: async () => {
      if (deny) throw new HttpProblem({ status: 404, title: 'Not found', code: 'offer_not_found' });
      return { id: 'offer-a' };
    },
  });
  app.decorate('userStore', { maybeGetById });
  app.addHook('preHandler', async (req) => {
    req.user = {
      sub: user,
      role: admin ? 'admin' : 'user',
      email: 'fixture@example.test',
      iat: 0,
      exp: 0,
    };
  });
  await app.register(errorHandlerPlugin);
  await app.register(trackingAdvancedRoutes);
  return { app, statements, maybeGetById };
}

describe('last upsell opening projection', () => {
  it.each(['syzepay', 'vendepay'])(
    'retains latest opening on a purchased %s stage with deterministic tie ordering',
    async (provider) => {
      const { app, statements, maybeGetById } = await fixture({ provider, admin: true });
      try {
        const response = await app.inject('/offers/offer-a/tracking/upsell-identities');
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.json().items[0].links[0]).toMatchObject({
          already_purchased: true,
          last_opening: {
            operator_id: 'member-b',
            operator_name: 'Name member-b',
            opened_at: '2026-10-16T12:00:00.000Z',
          },
        });
        expect(response.json().items[1].links[0].last_opening).toBeNull();
        expect(
          statements.filter((s) => s.sql.includes('FROM tracking_upsell_operator_attempts')),
        ).toHaveLength(1);
        expect(maybeGetById).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(response.json())).not.toContain('private@test');
      } finally {
        await app.close();
      }
    },
  );
  it.each(['member-a', 'member-b', 'owner-with-no-attempt'])(
    'exposes only %s own click, never another operator',
    async (user) => {
      const { app, maybeGetById } = await fixture({ user });
      try {
        const response = await app.inject('/offers/offer-a/tracking/upsell-identities');
        const opening = response.json().items[0].links[0].last_opening;
        if (user === 'owner-with-no-attempt') {
          expect(opening).toBeNull();
          expect(maybeGetById).not.toHaveBeenCalled();
        } else expect(opening.operator_id).toBe(user);
        expect(JSON.stringify(response.json())).not.toContain('foreign');
      } finally {
        await app.close();
      }
    },
  );
  it('denies other offers before querying audit history', async () => {
    const { app, statements } = await fixture({ deny: true });
    try {
      expect((await app.inject('/offers/offer-a/tracking/upsell-identities')).statusCode).toBe(404);
      expect(statements).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
  it('does not load history or names for an empty page', async () => {
    const { app, statements, maybeGetById } = await fixture({ empty: true });
    try {
      expect((await app.inject('/offers/offer-a/tracking/upsell-identities')).json().items).toEqual(
        [],
      );
      expect(statements.some((s) => s.sql.includes('operator_attempts'))).toBe(false);
      expect(maybeGetById).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
