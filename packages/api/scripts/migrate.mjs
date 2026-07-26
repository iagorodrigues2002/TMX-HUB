import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL ausente; migrations de tracking ignoradas.');
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});
for (const name of [
  '001_tracking_foundation.sql',
  '002_meta_capi.sql',
  '003_tracking_advanced.sql',
]) {
  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await sql.unsafe(migration);
  console.log(`Migration ${name} aplicada.`);
}
await sql.end();
