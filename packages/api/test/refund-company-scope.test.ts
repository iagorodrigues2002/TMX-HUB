import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Offer } from '@page-cloner/shared';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveRefundCompanyScope } from '../src/services/refund-company-scope.js';

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('refund company scope', () => {
  const schema = `refund_scope_${randomUUID().replaceAll('-', '')}`;
  const tmx = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  const offer = (id: string, userId: string, companyName = 'TMX'): Offer => ({
    id,
    userId,
    companyName,
    name: id,
    status: 'testando',
    createdAt: new Date().toISOString(),
  });
  const accessible = [offer('mine', 'owner'), offer('foreign', 'yola'), offer('second', 'yola')];
  beforeAll(async () => {
    const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.username !== 'tmx_tasks_test' ||
      url.pathname !== '/tmx_tasks_test'
    )
      throw new Error('Only isolated test database');
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
    await db`INSERT INTO companies(id,name,created_by) VALUES(${tmx},'TMX','owner'),(${first},'TMX','yola'),(${second},'Second','yola')`;
    await db`INSERT INTO company_memberships(company_id,user_id,role,status,all_offers) VALUES
      (${tmx},'owner','owner','active',true),(${tmx},'douglas','admin','active',true),
      (${tmx},'lucas','admin','active',true),(${first},'yola','owner','active',true),
      (${second},'yola','owner','active',true),(${tmx},'revoked','member','suspended',false)`;
    await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${tmx},'mine','owner'),(${first},'foreign','yola'),(${second},'second','yola')`;
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  it('company administrators use the same bound scope as the owner, not their own empty offers', async () => {
    for (const user of [
      { sub: 'owner', role: 'admin' },
      { sub: 'lucas', role: 'admin' },
      { sub: 'douglas', role: 'user' },
    ]) {
      const result = await resolveRefundCompanyScope(db, user, accessible, {});
      expect(result.offers.map((o) => o.id)).toEqual(['mine']);
      expect(result.company_scope.id).toBe(tmx);
    }
  });
  it('requires explicit choice for two companies and never conflates duplicate display names', async () => {
    const result = await resolveRefundCompanyScope(
      db,
      { sub: 'yola', role: 'user' },
      accessible,
      {},
    );
    expect(result.offers).toEqual([]);
    expect(result.company_scope.selection_required).toBe(true);
    const selected = await resolveRefundCompanyScope(
      db,
      { sub: 'yola', role: 'user' },
      accessible,
      { companyId: first },
    );
    expect(selected.offers.map((o) => o.id)).toEqual(['foreign']);
  });
  it('intersects the selected company with authorized offers', async () => {
    const result = await resolveRefundCompanyScope(db, { sub: 'douglas', role: 'user' }, [], {
      companyId: tmx,
    });
    expect(result.offers).toEqual([]);
    expect(result.company_scope.offer_ids).toEqual([]);
  });
  it('preserves company selector offers while the report filters a single offer', async () => {
    await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id) VALUES(${tmx},'extra','owner')`;
    const result = await resolveRefundCompanyScope(
      db,
      { sub: 'douglas', role: 'user' },
      [...accessible, offer('extra', 'owner')],
      { companyId: tmx, offerId: 'mine' },
    );
    expect(result.offers.map((o) => o.id)).toEqual(['mine']);
    expect(result.company_scope.offer_ids).toEqual(['mine', 'extra']);
  });
  it('rejects foreign companies and an offer outside the selected company', async () => {
    await expect(
      resolveRefundCompanyScope(db, { sub: 'yola', role: 'user' }, accessible, { companyId: tmx }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      resolveRefundCompanyScope(db, { sub: 'owner', role: 'admin' }, accessible, {
        companyId: tmx,
        offerId: 'foreign',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('preserves explicit authorized offer summaries without forcing a company', async () => {
    const result = await resolveRefundCompanyScope(db, { sub: 'yola', role: 'user' }, accessible, {
      offerId: 'foreign',
    });
    expect(result.offers.map((o) => o.id)).toEqual(['foreign']);
    await expect(
      resolveRefundCompanyScope(db, { sub: 'yola', role: 'user' }, [], { offerId: 'mine' }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('does not reopen legacy access after suspension or for unlinked bound owners', async () => {
    const fake = [offer('legacy', 'revoked'), offer('mine', 'owner')];
    expect(
      (await resolveRefundCompanyScope(db, { sub: 'revoked', role: 'user' }, fake, {})).offers,
    ).toEqual([]);
    await db`DELETE FROM company_memberships WHERE user_id='owner'`;
    expect(
      (await resolveRefundCompanyScope(db, { sub: 'owner', role: 'admin' }, accessible, {})).offers,
    ).toEqual([]);
  });
  it('keeps legacy owner TMX scope only before binding and empty onboarding accounts empty', async () => {
    const list = [
      offer('legacy', 'old'),
      offer('other', 'else'),
      offer('non-tmx', 'old', 'Different'),
    ];
    expect(
      (await resolveRefundCompanyScope(db, { sub: 'old', role: 'admin' }, list, {})).offers.map(
        (o) => o.id,
      ),
    ).toEqual(['legacy']);
    expect(
      (await resolveRefundCompanyScope(db, { sub: 'onboarding', role: 'user' }, accessible, {}))
        .offers,
    ).toEqual([]);
  });
});
