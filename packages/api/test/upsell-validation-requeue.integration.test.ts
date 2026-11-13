import postgres from 'postgres';
import { expect, it } from 'vitest';
import { requeueConfiguredUpsells } from '../src/services/upsell-validation-requeue.js';

it.skipIf(!process.env.TEST_TRAFFIC_DATABASE_URL)('requeues missing destinations only after the matching account is configured', async () => {
  const db = postgres(process.env.TEST_TRAFFIC_DATABASE_URL!, { max: 1 });
  try {
    await db`CREATE TEMP TABLE tracking_orders(id text,project_id text,vendepay_connection_id text,status text,order_kind text,provider text)`;
    await db`CREATE TEMP TABLE vendepay_connections(id text,enabled boolean,payload_adapter text)`;
    await db`CREATE TEMP TABLE tracking_upsell_stages(id text,project_id text,enabled boolean,destination_url text,connection_destinations jsonb)`;
    await db`CREATE TEMP TABLE tracking_upsell_identities(project_id text,source_order_id text)`;
    await db`CREATE TEMP TABLE tracking_upsell_identity_validation(order_id text,state text,attempts int,last_error text,next_attempt_at timestamptz,lease_until timestamptz,lease_token text,updated_at timestamptz)`;
    await db`INSERT INTO vendepay_connections VALUES ('a',true,'vendepay'),('b',true,'vendepay')`;
    for (const id of ['matching','other-account','other-offer','confirmed','rejected','identity','refunded']) {
      await db`INSERT INTO tracking_orders VALUES (${id},${id === 'other-offer' ? 'p2' : 'p'},${id === 'other-account' ? 'b' : 'a'},${id === 'refunded' ? 'refunded' : 'paid'},'front','vendepay')`;
      await db`INSERT INTO tracking_upsell_identity_validation(order_id,state,attempts,last_error) VALUES (${id},${['confirmed','rejected'].includes(id) ? id : 'failed'},2,${id === 'rejected' ? 'vendepay_not_eligible' : 'account_destination_not_configured'})`;
    }
    await db`INSERT INTO tracking_upsell_identities VALUES ('p','identity')`;
    expect(await requeueConfiguredUpsells(db)).toHaveLength(0);
    await db`INSERT INTO tracking_upsell_stages VALUES ('s','p',true,'https://example.test', '{"a":"https://example.test"}'::jsonb)`;
    expect((await requeueConfiguredUpsells(db)).map(r => r.order_id)).toEqual(['matching']);
    expect(await requeueConfiguredUpsells(db)).toHaveLength(0);
    const [row] = await db`SELECT state,attempts,last_error FROM tracking_upsell_identity_validation WHERE order_id='matching'`;
    expect(row).toEqual({state:'pending',attempts:0,last_error:null});
    await db`UPDATE tracking_upsell_stages SET connection_destinations='{}'::jsonb`;
    expect((await requeueConfiguredUpsells(db)).map(r => r.order_id)).toEqual(['other-account']);
  } finally { await db.end(); }
});
