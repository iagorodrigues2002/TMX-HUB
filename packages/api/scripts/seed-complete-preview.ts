/** Synthetic fixtures only. Run after migrations, never against an imported/live database. */
import { createHash } from 'node:crypto';
import { ALL_TOOL_KEYS } from '@page-cloner/shared';
import { Redis } from 'ioredis';
import postgres from 'postgres';

const databaseUrl =
  'postgres://tmx_tasks_test:synthetic-native-only@127.0.0.1:32768/tmx_live_preview_20261102';
const redisUrl = 'redis://127.0.0.1:32869';
if (
  process.env.NODE_ENV === 'production' ||
  process.env.DATABASE_URL !== databaseUrl ||
  process.env.REDIS_URL !== redisUrl ||
  !process.env.JWT_SECRET?.startsWith('synthetic-') ||
  !process.env.TRACKING_ENCRYPTION_KEY?.startsWith('synthetic-')
)
  throw new Error(
    'Synthetic seed requires the exact isolated local database, Redis and synthetic keys.',
  );

const { hashPassword } = await import('../src/lib/password.js');
const { encryptSecret } = await import('../src/lib/secret-box.js');
const { OfferStore } = await import('../src/services/offer-store.js');
const db = postgres(databaseUrl, { max: 1 });
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const encryptionKey = process.env.TRACKING_ENCRYPTION_KEY;
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const tmxCompanyId = 'c0000000-0000-4000-8000-000000000001';
const otherCompanyId = 'c0000000-0000-4000-8000-000000000002';

try {
  // Same IDs as the task harness: existing call participant references remain intact.
  for (const id of ['admin', 'member', 'other']) {
    const email = `${id}@native.tmx.test`;
    const currentEmail = await redis.hget(`user:${id}`, 'email');
    if (currentEmail && currentEmail !== email) throw new Error('Unexpected non-fixture user.');
    const indexedId = await redis.get(`user-email:${email}`);
    if (indexedId && indexedId !== id)
      throw new Error('Synthetic email already belongs to another ID.');
    if (!currentEmail) {
      await redis
        .multi()
        .hset(`user:${id}`, {
          id,
          email,
          name: `QA ${id}`,
          role: id === 'admin' ? 'admin' : 'user',
          passwordHash: await hashPassword('Synthetic-preview-2026!'),
          createdAt: day(0),
        })
        .set(`user-email:${email}`, id)
        .exec();
    }
  }
  // Explicit synthetic identities, never infer authorization from a display name.
  for (const company of [
    { id: tmxCompanyId, name: 'TMX', owner: 'admin' },
    { id: otherCompanyId, name: 'Empresa sintética', owner: 'other' },
  ]) {
    await db.begin(async (sql) => {
      const [existing] = await sql`SELECT name,created_by FROM companies WHERE id=${company.id}`;
      if (existing && (existing.name !== company.name || existing.created_by !== company.owner))
        throw new Error('Unexpected non-fixture company.');
      await sql`INSERT INTO companies(id,name,created_by) VALUES(${company.id},${company.name},${company.owner}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO company_memberships(company_id,user_id,role,tools,all_offers)
        VALUES(${company.id},${company.owner},'owner',${sql.array(ALL_TOOL_KEYS)}::text[],true) ON CONFLICT DO NOTHING`;
    });
  }
  await db`INSERT INTO company_memberships(company_id,user_id,role,tools,all_offers)
    VALUES(${tmxCompanyId},'member','member',ARRAY['ofertas','nav:scoped','nav:offers-all','nav:tracking-upsell-intelligence'],false) ON CONFLICT DO NOTHING`;
  const offers = new OfferStore(redis, process.env.JWT_SECRET, db);
  const specifications = [
    { name: 'DEMO_PJR_ENG', userId: 'admin', companyId: tmxCompanyId, companyName: 'TMX' },
    { name: 'DEMO_SLM_DE', userId: 'admin', companyId: tmxCompanyId, companyName: 'TMX' },
    {
      name: 'DEMO_OUTRA_EMPRESA',
      userId: 'other',
      companyId: otherCompanyId,
      companyName: 'Empresa sintética',
    },
  ];
  for (const [index, specification] of specifications.entries()) {
    const existing = (await offers.listByUser(specification.userId)).find(
      (o) => o.name === specification.name,
    );
    const offer =
      existing ?? (await offers.create({ ...specification, utmifyAccessEnabled: false }));
    const [binding] = await db`SELECT company_id FROM company_offers WHERE offer_id=${offer.id}`;
    if (binding && binding.company_id !== specification.companyId)
      throw new Error('Synthetic offer already belongs to another company; refusing reassignment.');
    await db`INSERT INTO company_offers(company_id,offer_id,owner_user_id)
      VALUES(${specification.companyId},${offer.id},${specification.userId}) ON CONFLICT DO NOTHING`;
    if (index === 0)
      await db`INSERT INTO company_offer_grants(company_id,user_id,offer_id)
      VALUES(${tmxCompanyId},'member',${offer.id}) ON CONFLICT DO NOTHING`;
    const projectId = `synthetic-project-${index}`;
    const connectionId = `synthetic-vendepay-${index}`;
    await db`INSERT INTO tracking_projects(id,offer_id,public_key,enabled)
      VALUES(${projectId},${offer.id},${`synthetic-public-${index}`},false) ON CONFLICT DO NOTHING`;
    await db`INSERT INTO vendepay_connections(id,project_id,token_hash,name,enabled)
      VALUES(${connectionId},${projectId},${hash(connectionId)},'VendePay sintética',false) ON CONFLICT DO NOTHING`;
    // BRL avoids any FX lookup. No queue, outbox, pixel, webhook destination or notification is created.
    for (let n = 0; n < 6; n++) {
      const orderId = `synthetic-order-${index}-${n}`;
      const status = n === 4 ? 'refunded' : n === 5 ? 'chargeback' : 'paid';
      const paidAt = day(n >= 4 ? 20 + n : n / 8);
      const reversalAt = n >= 4 ? day(0) : null;
      const amount = n % 2 === 0 ? 12900 : 7900;
      await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,
        occurred_at,paid_at,refunded_at,chargeback_at,amount_minor,amount_brl_minor,currency,vendepay_connection_id,buyer)
        VALUES(${orderId},${projectId},'vendepay',${orderId},${status},${n % 2 === 0 ? 'front' : 'upsell'},
        ${paidAt},${paidAt},${status === 'refunded' ? reversalAt : null},${status === 'chargeback' ? reversalAt : null},
        ${amount},${amount},'BRL',${connectionId},${db.json({ name: `Cliente sintético ${n}`, email: `buyer-${index}-${n}@example.test` })})
        ON CONFLICT DO NOTHING`;
      for (const kind of n >= 4 ? ['paid', status] : ['paid']) {
        const payload = {
          checkoutId: orderId,
          event:
            kind === 'paid' ? 'compra.aprovada' : kind === 'refunded' ? 'refund' : 'chargeback',
          createdAt: paidAt,
        };
        await db`INSERT INTO webhook_receipts(id,connection_id,dedupe_key,payload,state,received_at,order_id)
          VALUES(${`${orderId}-${kind}`},${connectionId},${`${orderId}-${kind}`},${db.json(payload)},'processed',${kind === 'paid' ? paidAt : reversalAt},${orderId})
          ON CONFLICT DO NOTHING`;
      }
    }
  }
  const syzeId = 'synthetic-syzepay-tmx';
  await db`INSERT INTO syzepay_company_connections(id,owner_id,company_key,company_name,name,token_hash,token_encrypted,enabled)
    VALUES(${syzeId},'admin',${hash('admin\0tmx')},'TMX','SyzePay sintética',${hash(syzeId)},${encryptSecret(syzeId, encryptionKey)},false)
    ON CONFLICT(id) DO UPDATE SET company_key=EXCLUDED.company_key`;
  const payload = JSON.stringify({
    id: 'synthetic-event-1',
    type: 'order.paid',
    data: {
      object: {
        id: 'synthetic-syze-order-1',
        store_id: 'synthetic-store',
        status: 'succeeded',
        kind: 'sale',
        amount: 12900,
        currency: 'BRL',
        product_id: 'synthetic-product-front',
        product_name: 'Front sintético',
      },
    },
  });
  await db`INSERT INTO syzepay_inbox_receipts(id,connection_id,dedupe_key,body_hash,body_encrypted,headers_encrypted,content_type,body_bytes,state,authenticity)
    VALUES('synthetic-syze-receipt-1',${syzeId},'synthetic-event-1',${hash(payload)},${encryptSecret(payload, encryptionKey)},${encryptSecret('{}', encryptionKey)},
      'application/json',${Buffer.byteLength(payload)},'awaiting_mapping','token_only') ON CONFLICT DO NOTHING`;
  const [counts] = await db`SELECT count(*)::int AS orders,
    count(*) FILTER (WHERE status IN ('refunded','chargeback'))::int AS reversals
    FROM tracking_orders WHERE id LIKE 'synthetic-order-%'`;
  const [receipts] =
    await db`SELECT count(*)::int AS receipts FROM webhook_receipts WHERE id LIKE 'synthetic-order-%'`;
  const [inbox] =
    await db`SELECT count(*)::int AS inbox FROM syzepay_inbox_receipts WHERE id='synthetic-syze-receipt-1'`;
  if (
    counts?.orders !== 18 ||
    counts?.reversals !== 6 ||
    receipts?.receipts !== 24 ||
    inbox?.inbox !== 1
  )
    throw new Error('Synthetic fixture counts did not match the expected dataset.');
  console.log('Synthetic local fixtures verified:', { ...counts, ...receipts, ...inbox });
  console.log('3 users / 3 offers; all gateway connections disabled. Ads not seeded.');
} finally {
  await redis.quit();
  await db.end();
}
