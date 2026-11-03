/** Local synthetic Ads Intelligence fixtures. No provider sync, queues or sales are created. */
import { Redis } from 'ioredis';
import postgres from 'postgres';
import { encryptSecret } from '../src/lib/secret-box.js';
import { physicalKey } from '../src/services/ads-import-policy.js';
import { OfferStore } from '../src/services/offer-store.js';

export async function seedAdsIntelligence() {
  const databaseUrl =
    'postgres://tmx_tasks_test:synthetic-native-only@127.0.0.1:32779/tmx_live_preview_20261102';
  const redisUrl = 'redis://127.0.0.1:32869';
  const jwt = process.env.JWT_SECRET;
  const key = process.env.TRACKING_ENCRYPTION_KEY;
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DATABASE_URL !== databaseUrl ||
    process.env.REDIS_URL !== redisUrl ||
    !jwt?.startsWith('synthetic-') ||
    !key?.startsWith('synthetic-')
  )
    throw new Error('Exact isolated synthetic environment required.');
  const db = postgres(databaseUrl, { max: 1 });
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  try {
    if ((await redis.hget('user:admin', 'email')) !== 'admin@native.tmx.test')
      throw new Error('Synthetic admin seed required.');
    const offers = await new OfferStore(redis, jwt, db).listByUser('admin');
    const matches = offers.filter((offer) => offer.name === 'DEMO_PJR_ENG');
    if (matches.length !== 1) throw new Error('Exactly one seeded DEMO_PJR_ENG required.');
    const offer = matches[0]!;
    const day = '2026-11-02';
    const dashboard = 'synthetic-ads-preview';
    const campaignId = 'synthetic-campaign-pjr-eng';
    const campaignName = `${offer.name} | Demonstração local`;
    const account = 'synthetic-meta-account';
    const campaignKey = JSON.stringify(['meta', account, campaignId, campaignName]);
    await db.begin(async (sql) => {
      const [existing] =
        await sql`SELECT dashboard_id FROM ads_intelligence_connections WHERE owner_id='admin' FOR UPDATE`;
      if (existing && existing.dashboard_id !== dashboard)
        throw new Error('Refusing to overwrite another connection.');
      const encrypted = encryptSecret(
        JSON.stringify({
          login: 'ads@example.test',
          password: 'synthetic-not-a-provider-credential',
        }),
        key,
      );
      await sql`INSERT INTO ads_intelligence_connections(owner_id,dashboard_id,credentials_encrypted,state,next_sync_at,last_sync_at,coverage_from,coverage_to,coverage_complete)
        VALUES('admin',${dashboard},${encrypted},'ready','2099-01-01',now(),${day},${day},true)
        ON CONFLICT(owner_id) DO UPDATE SET next_sync_at='2099-01-01',state='ready',last_sync_at=now(),coverage_from=EXCLUDED.coverage_from,coverage_to=EXCLUDED.coverage_to,coverage_complete=true`;
      await sql`INSERT INTO ads_intelligence_mappings(owner_id,campaign_key,offer_id)
        VALUES('admin',${campaignKey},${offer.id}) ON CONFLICT(owner_id,campaign_key) DO UPDATE SET offer_id=EXCLUDED.offer_id`;
      for (const batch of [1, 2])
        for (const ad of [1, 2, 3]) {
          // Same shape as the route fixtures; spend is integer BRL cents, not reais.
          const raw = {
            platform: 'meta',
            adAccountId: account,
            campaignId,
            campaignName,
            adsetId: `synthetic-adset-${batch}`,
            adsetName: `L${batch}`,
            adId: `synthetic-ad-${batch}-${ad}`,
            name: `${offer.name}_AD0${ad}_L${batch}`,
            spend: 2500 + batch * ad * 500,
            impressions: 1000 * batch * ad,
            inlineLinkClicks: 40 * batch * ad,
            videoViews3Seconds: 350 * batch * ad,
            pageName: 'Página sintética TMX',
            pageId: 'synthetic-page',
          };
          await sql`INSERT INTO ads_intelligence_daily(owner_id,day,physical_key,raw,currency)
          VALUES('admin',${day},${physicalKey(raw)},${sql.json(raw)},'BRL')
          ON CONFLICT(owner_id,day,physical_key) DO UPDATE SET raw=EXCLUDED.raw,currency='BRL'`;
        }
    });
    console.log(
      'Synthetic Ads Intelligence: 2 batches / 6 ads, BRL, no external sync or new sales.',
    );
  } finally {
    await redis.quit();
    await db.end();
  }
}

await seedAdsIntelligence();
