import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to purge tracking events.');
  process.exit(1);
}

const rawRetentionDays = process.env.TRACKING_EVENTS_RETENTION_DAYS ?? '180';
const retentionDays = Number(rawRetentionDays);
if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  console.error('TRACKING_EVENTS_RETENTION_DAYS must be an integer between 1 and 3650.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

try {
  const deleted = await sql`
    DELETE FROM tracking_events
    WHERE received_at < NOW() - (${retentionDays} * INTERVAL '1 day')
    RETURNING 1
  `;
  console.log(`Purged ${deleted.count} tracking_events older than ${retentionDays} days.`);
} finally {
  await sql.end();
}
