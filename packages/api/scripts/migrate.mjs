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
const migration = await readFile(new URL('../migrations/001_tracking_foundation.sql', import.meta.url), 'utf8');
await sql.unsafe(migration);
await sql.end();
console.log('Migration 001_tracking_foundation aplicada.');
