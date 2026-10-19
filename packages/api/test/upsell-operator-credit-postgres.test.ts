import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.ATTRIBUTION_TEST_DATABASE_URL;
describe.skipIf(!url)('immutable last operator credit (PostgreSQL)', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const schema = `operator_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    await db.unsafe(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE tracking_projects(id text PRIMARY KEY);
      INSERT INTO tracking_projects VALUES('p'),('other');
      CREATE TABLE tracking_orders(id text PRIMARY KEY,project_id text,provider text,order_kind text,
        paid_at timestamptz,visitor_id text,buyer jsonb DEFAULT '{}',attribution_source jsonb DEFAULT '{}',
        vendepay_connection_id text,syzepay_connection_id text);
    `);
    await db.unsafe(
      await readFile(
        new URL('../migrations/098_upsell_operator_audit.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.unsafe(`INSERT INTO tracking_orders(id,project_id,provider,order_kind,paid_at,visitor_id,vendepay_connection_id)
      VALUES('history-front','p','vendepay','front','2026-10-16 10:00Z','history-v','main');
      INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at)
      VALUES('history-click','p','history-front','s','upsell_1','vendepay','history-user','hc','2026-10-16 11:00Z');
      INSERT INTO tracking_orders(id,project_id,provider,order_kind,paid_at,visitor_id,vendepay_connection_id)
      VALUES('history-up','p','vendepay','upsell','2026-10-16 12:00Z','history-v','main');`);
    await db.unsafe(
      await readFile(
        new URL('../migrations/100_upsell_operator_last_click.sql', import.meta.url),
        'utf8',
      ),
    );
  });
  afterAll(async () => {
    await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  });
  const order = async (
    id: string,
    kind = 'front',
    provider = 'vendepay',
    conn = 'main',
    visitor: string | null = id,
    session: string | null = null,
    project = 'p',
  ) => {
    await db`INSERT INTO tracking_orders(id,project_id,provider,order_kind,paid_at,visitor_id,buyer,attribution_source,vendepay_connection_id,syzepay_connection_id)
      VALUES(${id},${project},${provider},${kind},${kind === 'front' ? '2026-10-16 10:00Z' : '2026-10-16 12:00Z'},${visitor},'{"email":"same@example.test"}',${db.json(session ? { syzepay_session_id: session } : {})},${provider === 'vendepay' ? conn : null},${provider === 'syzepay' ? conn : null})`;
  };
  const click = async (
    id: string,
    front: string,
    operator: string,
    time = '2026-10-16 11:00Z',
    stage = 'upsell_1',
    provider = 'vendepay',
    view = false,
    project = 'p',
  ) => {
    await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,opened_at,view_only)
      VALUES(${id},${project},${front},'s',${stage},${provider},${operator},${id},${time},${view})`;
  };
  it('reconciles existing audit history without modifying any order', async () => {
    const [r] =
      await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='history-up'`;
    expect(r!.operator_id).toBe('history-user');
    expect(r!.attempt_id).toBe('history-click');
  });
  it('credits only the last operator before approval, never a later click', async () => {
    await order('front-1');
    await click('first', 'front-1', 'first-user');
    await click('winner', 'front-1', 'winner-user', '2026-10-16 11:30Z');
    await click('future', 'front-1', 'future-user', '2026-10-16 13:00Z');
    await order('up-1', 'upsell', 'vendepay', 'main', 'front-1');
    const [r] = await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='up-1'`;
    expect(r!.operator_id).toBe('winner-user');
    expect(r!.attempt_id).toBe('winner');
    await click('later', 'front-1', 'later-user', '2026-10-16 14:00Z');
    await db`UPDATE tracking_orders SET buyer='{"email":"changed@example.test"}' WHERE id='up-1'`;
    const [after] = await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='up-1'`;
    expect(after!.operator_id).toBe('winner-user');
  });
  it('freezes no click as unassigned even if a later opening arrives', async () => {
    await order('front-empty');
    await order('up-empty', 'upsell', 'vendepay', 'main', 'front-empty');
    await click('late-empty', 'front-empty', 'late-user', '2026-10-16 13:00Z');
    await db`SELECT record_upsell_operator_credit('up-empty')`;
    const [r] = await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='up-empty'`;
    expect(r!.operator_id).toBeNull();
    expect(r!.reason).toBe('no_preapproval_click');
  });
  it('rejects a different stage, provider, project, or view-only opening', async () => {
    await order('front-scope');
    await click('wrong-stage', 'front-scope', 'bad', '2026-10-16 11:00Z', 'upsell_2');
    await click('wrong-provider', 'front-scope', 'bad', '2026-10-16 11:00Z', 'upsell_1', 'syzepay');
    await click(
      'wrong-project',
      'front-scope',
      'bad',
      '2026-10-16 11:00Z',
      'upsell_1',
      'vendepay',
      false,
      'other',
    );
    await click(
      'view-only',
      'front-scope',
      'bad',
      '2026-10-16 11:00Z',
      'upsell_1',
      'vendepay',
      true,
    );
    await order('up-scope', 'upsell', 'vendepay', 'main', 'front-scope');
    const [r] =
      await db`SELECT operator_id FROM tracking_upsell_operator_credits WHERE order_id='up-scope'`;
    expect(r!.operator_id).toBeNull();
  });
  it('does not cross gateway accounts for the same buyer', async () => {
    await order('front-other-conn', 'front', 'vendepay', 'cobrak', 'conn-v');
    await click('conn-click', 'front-other-conn', 'wrong-account');
    await order('up-conn', 'upsell', 'vendepay', 'isolated', 'conn-v');
    const [r] =
      await db`SELECT operator_id FROM tracking_upsell_operator_credits WHERE order_id='up-conn'`;
    expect(r!.operator_id).toBeNull();
  });
  it('uses an exact SyzePay session to disambiguate the same buyer', async () => {
    await order('syze-front', 'front', 'syzepay', 'syze', null, 'session-a');
    await order('syze-other', 'front', 'syzepay', 'syze', null, 'session-b');
    await click(
      'syze-click',
      'syze-front',
      'syze-user',
      '2026-10-16 11:00Z',
      'upsell_1',
      'syzepay',
    );
    await order('syze-up', 'upsell', 'syzepay', 'syze', null, 'session-a');
    const [r] = await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='syze-up'`;
    expect(r!.operator_id).toBe('syze-user');
    expect(r!.front_order_id).toBe('syze-front');
  });
  it('leaves ambiguous origin orders unassigned instead of guessing by time', async () => {
    await order('amb-front-a', 'front', 'vendepay', 'amb', 'amb-v');
    await order('amb-front-b', 'front', 'vendepay', 'amb', 'amb-v');
    await click('amb-click', 'amb-front-a', 'must-not-win');
    await order('amb-up', 'upsell', 'vendepay', 'amb', 'amb-v');
    const [r] = await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id='amb-up'`;
    expect(r!.operator_id).toBeNull();
    expect(r!.reason).toBe('ambiguous_front');
  });
});
