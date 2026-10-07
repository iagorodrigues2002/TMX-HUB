import postgres from 'postgres';

const DEFAULT_LOCAL_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/tmx_hub_dev';
const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const execute = process.argv.includes('--execute');
const parsedUrl = new URL(databaseUrl);
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

if (!localHosts.has(parsedUrl.hostname) || parsedUrl.pathname !== '/tmx_hub_dev') {
  console.error(
    'Refusing to purge: DATABASE_URL must target local database tmx_hub_dev on localhost.',
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, ssl: false });

try {
  const candidates = await sql`
    SELECT
      count(*) FILTER (WHERE state = 'dead')::int AS dead,
      count(*) FILTER (WHERE state = 'processing')::int AS stuck
    FROM tracking_delivery_outbox
    WHERE (state IN ('dead', 'processing') AND created_at < NOW() - INTERVAL '7 days')
       OR (state = 'processing' AND attempts >= 10)
  `;
  const counts = candidates[0] ?? { dead: 0, stuck: 0 };

  if (!execute) {
    console.log(
      `Dry run: would purge ${counts.dead} dead and ${counts.stuck} stuck outbox deliveries.`,
    );
    console.log('Re-run with --execute to delete these local rows.');
  } else {
    const deleted = await sql`
      DELETE FROM tracking_delivery_outbox
      WHERE (state IN ('dead', 'processing') AND created_at < NOW() - INTERVAL '7 days')
         OR (state = 'processing' AND attempts >= 10)
      RETURNING state
    `;
    const deletedCounts = deleted.reduce(
      (acc, row) => {
        if (row.state === 'dead') acc.dead += 1;
        if (row.state === 'processing') acc.stuck += 1;
        return acc;
      },
      { dead: 0, stuck: 0 },
    );
    console.log(
      `Purged ${deletedCounts.dead} dead and ${deletedCounts.stuck} stuck outbox deliveries from local tmx_hub_dev.`,
    );
  }
} finally {
  await sql.end();
}
