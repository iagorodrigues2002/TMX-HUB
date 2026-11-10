import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import { NotFoundError } from '../src/lib/problem.js';
import { encryptSecret } from '../src/lib/secret-box.js';
import { registerPushcutProfiles } from '../src/routes/pushcut-profiles.js';

const url = process.env.ATTRIBUTION_REPORT_TEST_DATABASE_URL;
describe.skipIf(!url)('Pushcut profiles on disposable PostgreSQL', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const schema = `pushcut_${randomUUID().replaceAll('-', '')}`;
  const app = Fastify();
  let userId = 'owner';
  const offers = [
    { id: 'one', name: 'Oferta 1' },
    { id: 'two', name: 'Oferta 2' },
  ];
  const path = '/offers/one/tracking/pushcut-profiles';
  const input = {
    name: 'Iago',
    secret: 'synthetic-pushcut-only',
    front_notification_name: 'Venda',
    upsell_notification_name: 'Upsell',
    devices: ['iPhone'],
    offer_ids: ['one', 'two'],
    order_kinds: ['front', 'upsell_4'],
    show_amount: false,
    enabled: true,
  };
  let profileId: string;

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname))
      throw Error('Disposable local database required');
    await db.unsafe(`CREATE SCHEMA "${schema}"`);
    await db.unsafe(`SET search_path TO "${schema}"`);
    await db.unsafe(`CREATE TABLE tracking_projects(id text PRIMARY KEY, offer_id text UNIQUE, enabled boolean DEFAULT true);
      CREATE TABLE company_offers(offer_id text,company_id text);
      CREATE TABLE company_memberships(company_id text,user_id text,role text,status text,tools text[]);
      CREATE TABLE tracking_pushcut_destinations(id text PRIMARY KEY,project_id text REFERENCES tracking_projects(id),name text,secret_encrypted text,front_notification_name text,upsell_notification_name text,devices jsonb DEFAULT '[]',enabled boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await db.unsafe(
      await readFile(new URL('../migrations/118_pushcut_profiles.sql', import.meta.url), 'utf8'),
    );
    await db`INSERT INTO tracking_projects(id,offer_id) VALUES ('project-one','one'),('project-two','two')`;
    app.decorate('db', db as never);
    app.decorate('offerStore', {
      assertManager: async (id: string) => {
        if (!offers.some((o) => o.id === id)) throw new NotFoundError('Unavailable');
      },
      listAccessible: async () => [...offers, { id: 'forbidden', name: 'Private' }],
    } as never);
    app.addHook('onRequest', async (req) => {
      req.user = {
        sub: userId,
        email: 'fixture@example.invalid',
        role: 'user',
        iat: 1,
        exp: 9999999999,
      };
    });
    registerPushcutProfiles(app);
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    if (url) await db.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  });

  it('creates one encrypted profile and links selected offers without revealing credentials', async () => {
    await db`UPDATE tracking_projects SET enabled=false WHERE offer_id='two'`;
    const response = await app.inject({ method: 'POST', url: path, payload: input });
    expect(response.statusCode, response.body).toBe(200);
    profileId = response.json().profile.id;
    const rows =
      await db`SELECT * FROM tracking_pushcut_destinations WHERE profile_id=${profileId}`;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.secret_encrypted !== input.secret && !r.show_amount)).toBe(true);
    const list = await app.inject(path);
    expect(list.json().offers).toHaveLength(2);
    expect(list.body).not.toContain(input.secret);
    expect(list.body).not.toContain('secret_encrypted');
    expect(list.json().profiles[0].offer_ids.sort()).toEqual(['one', 'two']);
  });

  it('keeps selections when paused and applies changes to every linked offer', async () => {
    const body = { ...input, secret: undefined, enabled: false, order_kinds: ['upsell_5'] };
    expect(
      (await app.inject({ method: 'PATCH', url: `${path}/${profileId}`, payload: body }))
        .statusCode,
    ).toBe(200);
    const rows =
      await db`SELECT * FROM tracking_pushcut_destinations WHERE profile_id=${profileId}`;
    expect(
      rows.every((r) => !r.enabled && r.profile_selected && r.order_kinds[0] === 'upsell_5'),
    ).toBe(true);
    expect((await app.inject(path)).json().profiles[0].offer_ids.sort()).toEqual(['one', 'two']);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${path}/${profileId}`,
          payload: { ...input, secret: undefined, offer_ids: ['two'] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await db`SELECT enabled FROM tracking_pushcut_destinations WHERE profile_id=${profileId} AND project_id='project-one'`
      )[0].enabled,
    ).toBe(false);
  });

  it('rejects another owner and unauthorized offers without partially updating configuration', async () => {
    userId = 'other';
    expect((await app.inject(path)).json().profiles).toEqual([]);
    expect(
      (await app.inject({ method: 'PATCH', url: `${path}/${profileId}`, payload: input }))
        .statusCode,
    ).toBe(404);
    userId = 'owner';
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `${path}/${profileId}`,
          payload: { ...input, offer_ids: ['two', 'forbidden'] },
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect((await db`SELECT count(*)::int AS n FROM tracking_pushcut_profiles`)[0].n).toBe(1);
  });

  it('reuses the stored credential and destination ID when converting a legacy destination', async () => {
    await db`INSERT INTO tracking_pushcut_destinations(id,project_id,name,secret_encrypted,front_notification_name) VALUES ('legacy','project-one','Saved',${encryptSecret(input.secret, env.TRACKING_ENCRYPTION_KEY!)},'Venda')`;
    await db`INSERT INTO tracking_pushcut_destinations(id,project_id,name,secret_encrypted,front_notification_name,devices) VALUES ('legacy-duplicate','project-one','Saved twice',${encryptSecret(input.secret, env.TRACKING_ENCRYPTION_KEY!)},'Venda',${db.json(input.devices)})`;
    const response = await app.inject({
      method: 'POST',
      url: path,
      payload: { ...input, secret: undefined, source_destination_id: 'legacy', offer_ids: ['one'] },
    });
    expect(response.statusCode, response.body).toBe(200);
    const id = response.json().profile.id;
    const rows = await db`SELECT id FROM tracking_pushcut_destinations WHERE profile_id=${id}`;
    expect(rows.map((r) => r.id)).toEqual(['legacy']);
    expect(
      (await db`SELECT enabled FROM tracking_pushcut_destinations WHERE id='legacy-duplicate'`)[0]
        .enabled,
    ).toBe(false);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          payload: { ...input, secret: undefined, source_destination_id: 'legacy' },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('does not create a partial profile if tracking or a first credential is missing', async () => {
    offers.push({ id: 'no-tracking', name: 'Missing' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          payload: { ...input, offer_ids: ['one', 'no-tracking'] },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'POST', url: path, payload: { ...input, secret: undefined } }))
        .statusCode,
    ).toBe(400);
    expect((await db`SELECT count(*)::int AS n FROM tracking_pushcut_profiles`)[0].n).toBe(2);
  });

  it('rejects an otherwise manageable offer when its company denies the Pushcut area', async () => {
    await db`INSERT INTO company_offers VALUES ('two','restricted')`;
    await db`INSERT INTO company_memberships VALUES ('restricted','owner','member','active',ARRAY['ofertas','nav:scoped','nav:tracking-overview'])`;
    expect((await app.inject(path)).json().offers.some((o: { id: string }) => o.id === 'two')).toBe(
      false,
    );
    const response = await app.inject({
      method: 'PATCH',
      url: `${path}/${profileId}`,
      payload: input,
    });
    expect(response.statusCode).toBe(403);
    expect(
      (
        await db`SELECT offer_ids FROM (SELECT ARRAY(SELECT tp.offer_id FROM tracking_pushcut_destinations d JOIN tracking_projects tp ON tp.id=d.project_id WHERE d.profile_id=${profileId} AND d.profile_selected) AS offer_ids) s`
      )[0].offer_ids,
    ).toEqual(['two']);
  });
});
