import postgres from 'postgres';
import { expect, it } from 'vitest';
import { refundOriginFilter } from '../src/services/sale-origin.js';

const url = process.env.REFUNDS_TEST_DATABASE_URL;
it.skipIf(!url)(
  'refund views partition known origins, exclude later/view-only clicks and keep unknowns in general',
  async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
      throw new Error('Local database only');
    const db = postgres(url!, { max: 1 });
    try {
      await db.begin(async (sql) => {
        await sql`CREATE TEMP TABLE tracking_orders(id text,project_id text,order_kind text,paid_at timestamptz) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_upsell_operator_attempts(project_id text,order_id text,view_only boolean,opened_at timestamptz) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_upsell_operator_credits(project_id text,order_id text,operator_id text,reason text,front_order_id text) ON COMMIT DROP`;
        await sql`INSERT INTO tracking_orders VALUES
        ('natural','p','front','2026-10-01'),('assisted','p','front','2026-10-01'),
        ('later','p','front','2026-10-01'),('view','p','front','2026-10-01'),
        ('up-natural','p','upsell','2026-10-01'),('up-assisted','p','upsell_2','2026-10-01'),
        ('unknown','p','upsell','2026-10-01')`;
        await sql`INSERT INTO tracking_upsell_operator_attempts VALUES
        ('p','assisted',false,'2026-09-30'),('p','later',false,'2026-10-02'),('p','view',true,'2026-09-30'),
        ('other-project','natural',false,'2026-09-30')`;
        await sql`INSERT INTO tracking_upsell_operator_credits VALUES
        ('p','up-natural',NULL,'no_preapproval_click','natural'),('p','up-assisted','operator','last_click','assisted')`;
        const select = async (view: 'general' | 'natural' | 'assisted') =>
          (
            await sql`SELECT o.id FROM tracking_orders o WHERE ${refundOriginFilter(db, view)} ORDER BY o.id`
          ).map((r) => r.id);
        expect(await select('general')).toHaveLength(7);
        expect(await select('natural')).toEqual(['later', 'natural', 'up-natural', 'view']);
        expect(await select('assisted')).toEqual(['assisted', 'up-assisted']);
      });
    } finally {
      await db.end();
    }
  },
);
