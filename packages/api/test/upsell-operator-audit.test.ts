import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import { encryptSecret } from '../src/lib/secret-box.js';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import {
  OperatorLogQuery,
  hasGatewayApproval,
  operatorAuditSummary,
  registerUpsellOperatorAudit,
} from '../src/routes/upsell-operator-audit.js';
import { validateSyzepayRecovery } from '../src/services/syzepay-upsell.js';

vi.mock('../src/env.js', () => ({
  env: {
    TRACKING_ENCRYPTION_KEY: 'test-key-longer-than-thirty-two-characters',
    TRACKING_PUBLIC_BASE_URL: 'https://tmx.test',
  },
}));
vi.mock('../src/services/syzepay-upsell.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/syzepay-upsell.js')>()),
  validateSyzepayRecovery: vi.fn(async () => ({
    compatible: true,
    url: 'https://checkout.test/upsell?s=session-secret&step=real-step',
  })),
}));

const now = new Date('2026-10-15T12:00:00Z');
const attempt = {
  id: 'attempt-1',
  operator_id: 'member-1',
  order_id: 'front-1',
  stage_id: 'stage-1',
  stage_key: 'upsell_1',
  provider: 'vendepay',
  opened_at: now,
};
const approval = {
  order_id: 'paid-upsell',
  stage_key: 'upsell_1',
  provider: 'vendepay',
  approved_at: now,
  amount_minor: 2500,
  currency: 'USD',
};

async function fixture(
  options: {
    user?: string;
    admin?: boolean;
    deny?: boolean;
    provider?: string;
    unsafe?: boolean;
    offers?: string[];
    foreign?: boolean;
  } = {},
) {
  const app = Fastify();
  const inserted: Record<string, unknown>[] = [];
  const statements: string[] = [];
  const parameters: unknown[][] = [];
  app.decorate('db', async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?');
    statements.push(sql);
    parameters.push(values);
    if (sql.includes('SELECT id,offer_id FROM tracking_projects'))
      return [
        { id: 'project-1', offer_id: options.offers?.[0] ?? 'offer-1' },
        { id: 'other-project', offer_id: 'not-authorized' },
      ];
    if (sql.includes('SELECT id FROM tracking_projects'))
      return sql.includes('ANY') && !(values[0] as string[]).length ? [] : [{ id: 'project-1' }];
    if (sql.includes('o.id AS order_id,s.id AS stage_id'))
      return [
        {
          order_id: values[1],
          stage_id: values[2],
          stage_key: 'upsell_1',
          provider: options.provider ?? 'vendepay',
          slug: 'slug-1',
          session_id: 'session-secret',
          syzepay_destination: 'https://checkout.test/upsell',
          vendid_encrypted: encryptSecret(
            'venda-secret',
            'test-key-longer-than-thirty-two-characters',
          ),
        },
      ];
    if (sql.includes('INSERT INTO tracking_upsell_operator_attempts')) {
      if (inserted.length) return [];
      const row = { ...attempt, id: values[0], operator_id: values[6] };
      inserted.push(row);
      return [row];
    }
    if (sql.includes('click_id=?')) return inserted;
    if (
      sql.includes(
        'SELECT id,operator_id,order_id,stage_id,stage_key,provider,opened_at FROM tracking_upsell_operator_attempts',
      ) &&
      sql.includes('ORDER BY')
    )
      return [{ ...attempt, operator_id: options.user ?? 'owner-1' }];
    if (sql.includes('FROM tracking_orders o')) {
      expect(sql).toContain("r.state='processed'");
      expect(sql).toContain("r.authenticity='signature_verified'");
      expect(sql).toContain('r.tracking_order_id=o.id');
      expect(sql).toContain('r.order_id=o.id');
      expect(sql).not.toContain('tracking_upsell_manual_test_results');
      const rows = [
        {
          ...approval,
          operator_id: options.admin ? null : (options.user ?? 'owner-1'),
          receipt_payloads: [{ transaction_id: 'real-transaction', status: 'paid' }],
        },
        {
          ...approval,
          order_id: 'syze-upsell',
          provider: 'syzepay',
          currency: 'BRL',
          amount_minor: 12417,
          receipt_payloads: null,
        },
      ];
      return options.admin ? rows : rows.slice(0, 1);
    }
    return [];
  });
  app.decorate('offerStore', {
    maybeGet: async (id: string) =>
      (options.offers ?? ['offer-1']).includes(id)
        ? { id, userId: options.user ?? 'owner-1' }
        : options.foreign
          ? { id, userId: 'other-owner', memberIds: [options.user ?? 'owner-1'] }
          : null,
    assertAccess: async () => {
      if (options.deny)
        throw new HttpProblem({ status: 404, title: 'Not found', code: 'offer_not_found' });
      return { userId: 'owner-1' };
    },
  });
  app.decorate('userStore', {
    maybeGetById: async () => ({ name: 'Operador TMX', email: 'do-not-expose@test' }),
  });
  app.addHook('preHandler', async (req) => {
    req.user = {
      sub: options.user ?? 'owner-1',
      role: options.admin ? 'admin' : 'user',
      email: 'fixture@example.test',
      iat: 0,
      exp: 0,
    };
  });
  await app.register(errorHandlerPlugin);
  registerUpsellOperatorAudit(app);
  return { app, inserted, statements, parameters };
}

const openUrl = '/offers/offer-1/tracking/upsell-identities/front-1/stages/stage-1/open';
const logUrl = '/offers/offer-1/tracking/upsell-operator-logs';
const globalUrl = '/tracking/upsell-operator-logs';
describe('upsell operator audit', () => {
  it('requires authentication for the global report', async () => {
    const app = Fastify();
    registerUpsellOperatorAudit(app);
    try {
      expect((await app.inject(globalUrl)).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it('builds the global project list only from server-authorized offers', async () => {
    const { app, statements, parameters } = await fixture({
      admin: true,
      offers: ['allowed-offer'],
    });
    try {
      const r = await app.inject(globalUrl);
      expect(r.statusCode).toBe(200);
      expect(r.json().scope).toBe('all_offers');
      expect(statements[0]).toBe('SELECT id,offer_id FROM tracking_projects');
      const index = statements.findIndex((s) => s.includes('ORDER BY opened_at'));
      expect(parameters[index][0]).toEqual(['project-1']);
    } finally {
      await app.close();
    }
  });
  it('passes an empty authorized project set rather than falling back to every project', async () => {
    const { app, statements, parameters } = await fixture({ offers: [] });
    try {
      expect((await app.inject(globalUrl)).statusCode).toBe(200);
      const index = statements.findIndex((s) => s.includes('ORDER BY opened_at'));
      expect(parameters[index][0]).toEqual([]);
      expect(statements[index]).toContain('project_id=ANY');
    } finally {
      await app.close();
    }
  });
  it('does not treat a legacy sharing entry as global authorization', async () => {
    const { app, statements, parameters } = await fixture({ user: 'member-1', foreign: true });
    try {
      expect((await app.inject(globalUrl)).statusCode).toBe(200);
      const index = statements.findIndex((s) => s.includes('ORDER BY opened_at'));
      expect(parameters[index][0]).toEqual(['project-1']);
    } finally {
      await app.close();
    }
  });
  it('filters by the immutable winning click in Brasília, not the approval date', async () => {
    const { app, statements } = await fixture({ admin: true });
    try {
      const r = await app.inject(`${globalUrl}?from=2026-10-15&to=2026-10-16`);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({
        date_basis: 'click',
        summary_scope: 'click_period',
        period: { from: '2026-10-15', to: '2026-10-16', time_zone: 'America/Sao_Paulo' },
      });
      const sql = statements.find((s) => s.includes('FROM tracking_orders o'))!;
      expect(sql).toContain('credited_click.id=credit.attempt_id');
      expect(sql).toContain('credited_click.opened_at >=');
      expect(sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
      expect(sql).not.toContain('o.paid_at >= (?');
    } finally {
      await app.close();
    }
  });
  it.each([
    'from=2026-02-30&to=2026-03-01',
    'from=2026-10-16&to=2026-10-15',
    'from=2026-10-15',
    'from=no&to=2026-10-16',
    'from=0000-01-01&to=2026-10-16',
  ])('rejects an invalid period: %s', async (query) => {
    const { app, statements } = await fixture();
    try {
      expect((await app.inject(`${globalUrl}?${query}`)).statusCode).toBe(400);
      expect(statements).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
  it('accepts real leap days but rejects invalid leap dates', () => {
    expect(OperatorLogQuery.safeParse({ from: '2024-02-29', to: '2024-03-01' }).success).toBe(true);
    expect(OperatorLogQuery.safeParse({ from: '2026-02-29', to: '2026-03-01' }).success).toBe(
      false,
    );
  });
  it.each(['GET', 'POST'] as const)('requires an authenticated session for %s', async (method) => {
    const app = Fastify();
    registerUpsellOperatorAudit(app);
    try {
      const response = await app.inject({ method, url: method === 'GET' ? logUrl : openUrl });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it('durably registers an opening before returning the existing VendePay URL, without URL/PII in storage', async () => {
    const { app, inserted, statements } = await fixture();
    try {
      const response = await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe('https://tmx.test/v1/u/slug-1?vendaId=venda-secret');
      expect(inserted).toHaveLength(1);
      expect(statements.find((s) => s.includes('INSERT'))).not.toMatch(
        /url|buyer|email|session_id|vendid/,
      );
      expect(response.headers['cache-control']).toContain('no-store');
    } finally {
      await app.close();
    }
  });
  it('retries the same click idempotently, with conflict guarded by operator, project and target', async () => {
    const { app, inserted, statements } = await fixture();
    try {
      const request = {
        method: 'POST' as const,
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      };
      const first = await app.inject(request);
      const second = await app.inject(request);
      expect(second.json().attempt_id).toBe(first.json().attempt_id);
      expect(inserted).toHaveLength(1);
      expect(statements.find((s) => s.includes('INSERT'))).toContain(
        'ON CONFLICT(project_id,operator_id,click_id) DO NOTHING',
      );
    } finally {
      await app.close();
    }
  });
  it('records the authenticated guest, never a client-supplied operator', async () => {
    const { app, inserted } = await fixture({ user: 'member-1' });
    try {
      const invalid = await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456', operator_id: 'owner-1' },
      });
      expect(invalid.statusCode).toBe(422);
      expect(inserted).toHaveLength(0);
      await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      });
      expect(inserted[0].operator_id).toBe('member-1');
    } finally {
      await app.close();
    }
  });
  it('keeps the validated SyzePay session and step', async () => {
    const { app } = await fixture({ provider: 'syzepay' });
    try {
      const response = await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe(
        'https://checkout.test/upsell?s=session-secret&step=real-step',
      );
    } finally {
      await app.close();
    }
  });
  it('preserves the prior already-purchased SyzePay view-only action', async () => {
    const { app } = await fixture({ provider: 'syzepay' });
    try {
      const response = await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456', view_only: true },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().url).toBe('https://checkout.test/upsell?s=session-secret&force=1');
    } finally {
      await app.close();
    }
  });
  it('rejects reusing a click key for a different target', async () => {
    const { app, inserted } = await fixture();
    try {
      await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      });
      const response = await app.inject({
        method: 'POST',
        url: openUrl.replace('front-1', 'front-2'),
        payload: { click_id: 'click_1234567890123456' },
      });
      expect(response.statusCode).toBe(409);
      expect(inserted).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
  it('refuses an unsafe checkout URL without writing an attempt', async () => {
    vi.mocked(validateSyzepayRecovery).mockResolvedValueOnce({
      compatible: true,
      reason: 'fixture',
      url: 'http://checkout.test/upsell',
    });
    const { app, inserted } = await fixture({ provider: 'syzepay' });
    try {
      const response = await app.inject({
        method: 'POST',
        url: openUrl,
        payload: { click_id: 'click_1234567890123456' },
      });
      expect(response.statusCode).toBe(409);
      expect(inserted).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
  it.each(['GET', 'POST'] as const)(
    'denies cross-offer %s before querying or inserting audit data',
    async (method) => {
      const { app, statements } = await fixture({ deny: true });
      try {
        const response = await app.inject({
          method,
          url: method === 'GET' ? logUrl : openUrl,
          ...(method === 'POST' ? { payload: { click_id: 'click_1234567890123456' } } : {}),
        });
        expect(response.statusCode).toBe(404);
        expect(statements).toHaveLength(0);
      } finally {
        await app.close();
      }
    },
  );
  it.each(['member-1', 'owner-1'])(
    'exposes only %s own openings and credited approvals, including normal owners',
    async (user) => {
      const { app, statements } = await fixture({ user });
      try {
        const response = await app.inject({ method: 'GET', url: logUrl });
        expect(response.json()).toMatchObject({
          scope: 'self',
          summary_scope: 'all_recorded_history',
        });
        expect(response.json().approvals).toHaveLength(1);
        expect(response.json().approvals[0].operator_id).toBe(user);
        expect(response.json().summary[0].confirmed_purchases).toBe(1);
        expect(response.json().attempts[0]).toMatchObject({
          operator_id: user,
          operator_name: 'Operador TMX',
        });
        expect(JSON.stringify(response.json())).not.toContain('do-not-expose');
        expect(statements.find((s) => s.includes('FROM tracking_orders o'))).toContain(
          'OR credit.operator_id=?',
        );
        expect(statements.some((s) => s.includes('OR operator_id=?'))).toBe(true);
      } finally {
        await app.close();
      }
    },
  );
  it('keeps gateway-paid purchases with no immutable credit unassigned', async () => {
    const { app } = await fixture({ admin: true });
    try {
      const response = await app.inject({ method: 'GET', url: logUrl });
      expect(response.statusCode).toBe(200);
      expect(
        response
          .json()
          .approvals.every((r: { operator_id: string | null }) => r.operator_id === null),
      ).toBe(true);
      expect(response.json().unattributed_totals).toEqual([
        { currency: 'USD', count: 1, amount_minor: 2500 },
        { currency: 'BRL', count: 1, amount_minor: 12417 },
      ]);
      expect(response.json().summary[0].confirmed_purchases).toBe(0);
    } finally {
      await app.close();
    }
  });
  it('never credits multiple operators or adds different currencies together', () => {
    const summary = operatorAuditSummary(
      [attempt, { ...attempt, id: 'attempt-2', operator_id: 'member-2' }],
      [approval, { ...approval, order_id: 'other', currency: 'EUR', amount_minor: 3500 }],
    );
    expect(summary.summary.every((s) => s.confirmed_purchases === 0)).toBe(true);
    expect(summary.unattributed_totals).toEqual([
      { currency: 'USD', count: 1, amount_minor: 2500 },
      { currency: 'EUR', count: 1, amount_minor: 3500 },
    ]);
  });
  it('does not invent a zero amount when payment value or currency is unknown', () => {
    expect(
      operatorAuditSummary([], [{ ...approval, amount_minor: null, currency: null }])
        .unattributed_totals,
    ).toEqual([{ currency: null, count: 1, amount_minor: null }]);
  });
  it('groups credited purchases once per person/order and uses saved BRL conversions', () => {
    const rows = [
      { ...approval, operator_id: 'member-1', amount_brl_minor: 13000 },
      { ...approval, operator_id: 'member-1', amount_brl_minor: 13000 },
      {
        ...approval,
        order_id: 'second',
        operator_id: 'member-1',
        currency: 'EUR',
        amount_brl_minor: 15000,
      },
      { ...approval, order_id: 'third', operator_id: 'member-2', amount_minor: 900 },
    ];
    const result = operatorAuditSummary(
      [attempt, { ...attempt, id: 'second-attempt', operator_id: 'member-2' }],
      rows,
    );
    expect(result.summary).toHaveLength(2);
    expect(result.summary[0]).toMatchObject({
      operator_id: 'member-1',
      confirmed_purchases: 2,
      amounts: [{ currency: 'BRL', amount_minor: 28000, count: 2 }],
    });
    expect(result.summary[1]).toMatchObject({
      operator_id: 'member-2',
      confirmed_purchases: 1,
      amounts: [{ currency: 'USD', amount_minor: 900, count: 1 }],
    });
    expect(result.unattributed_totals).toEqual([]);
  });
  it('summarizes beyond fifty openings rather than truncating totals', () => {
    const attempts = Array.from({ length: 75 }, (_, i) => ({ ...attempt, id: `click-${i}` }));
    const approvals = Array.from({ length: 75 }, (_, i) => ({
      ...approval,
      order_id: `sale-${i}`,
      operator_id: 'member-1',
      amount_brl_minor: 100,
    }));
    expect(operatorAuditSummary(attempts, approvals).summary[0]).toMatchObject({
      openings: 75,
      confirmed_purchases: 75,
      amounts: [{ currency: 'BRL', amount_minor: 7500, count: 75 }],
    });
  });
  it('rejects manual imports without paid receipts and a refund receipt retaining generic completed status', () => {
    expect(hasGatewayApproval({ ...approval, receipt_payloads: [] })).toBe(false);
    expect(
      hasGatewayApproval({
        ...approval,
        receipt_payloads: [{ transaction_id: 'real', status: 'completed', event: 'Reembolso' }],
      }),
    ).toBe(false);
    expect(
      hasGatewayApproval({
        ...approval,
        receipt_payloads: [{ transaction_id: 'real', status: 'completed', event: 'Charge' }],
      }),
    ).toBe(false);
    expect(
      hasGatewayApproval({
        ...approval,
        receipt_payloads: [
          { transaction_id: 'real', status: 'completed', event: 'compra.aprovada' },
        ],
      }),
    ).toBe(true);
  });
});
