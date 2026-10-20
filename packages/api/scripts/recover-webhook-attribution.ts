import postgres from 'postgres';
import { recoverWebhookAttribution } from '../src/services/webhook-attribution-recovery.js';

const url = process.env.ATTRIBUTION_RECOVERY_DATABASE_URL;
if (!url) throw new Error('Explicit ATTRIBUTION_RECOVERY_DATABASE_URL required');
const apply = process.argv.includes('--apply');
const db = postgres(url, {
  max: 1,
  connect_timeout: 10,
  connection: { default_transaction_read_only: apply ? 'off' : 'on', statement_timeout: 20000 },
  onnotice: () => {},
});
try {
  console.log(JSON.stringify(await recoverWebhookAttribution(db, apply)));
} finally {
  await db.end();
}
