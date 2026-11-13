import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { expect, it } from 'vitest';
import { archivedTraffic, saveTrafficDays, closedTrafficDay, nextTrafficCollectionDay } from '../src/services/traffic-daily-store.js';

it('closes a day only after the ad account timezone has ended it', () => {
  const accounts = [{ timezone: 'America/New_York' }] as Parameters<typeof closedTrafficDay>[0];
  expect(closedTrafficDay(accounts, new Date('2026-11-12T03:20:00Z'))).toBe('2026-11-10');
  expect(closedTrafficDay(accounts, new Date('2026-11-12T06:20:00Z'))).toBe('2026-11-11');
});

it.skipIf(!process.env.TEST_TRAFFIC_DATABASE_URL)('persists daily coverage, replaces open days, freezes closed days and isolates companies', async () => {
  const db = postgres(process.env.TEST_TRAFFIC_DATABASE_URL!, { max: 1 });
  const company = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  try {
    await db`CREATE TEMP TABLE companies (id uuid PRIMARY KEY)`;
    await db`INSERT INTO companies VALUES (${company}),(${other})`;
    const migration = await readFile(new URL('../migrations/120_traffic_daily_archive.sql', import.meta.url), 'utf8');
    await db.unsafe(migration.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE'));
    const snapshot = {
      from: '2026-11-09', to: '2026-11-10', fetchedAt: '2026-11-10T20:00:00Z',
      accounts: [], campaigns: [], ads: [], hourly: [], failures: [],
      fx: { base: 'USD', provider: 'test', fetchedAt: '2026-11-10T20:00:00Z', rates: {} },
      insights: [{ date: '2026-11-09', adId: 'ad', campaignId: 'campaign', spend: 100 }],
    } as unknown as Parameters<typeof saveTrafficDays>[2];
    await saveTrafficDays(db, company, snapshot, false);
    expect((await archivedTraffic(db, company, snapshot.from, snapshot.to))?.insights).toHaveLength(1);
    expect((await archivedTraffic(db, company, '2026-11-10', '2026-11-10'))?.insights).toEqual([]);
    expect(await archivedTraffic(db, company, snapshot.from, '2026-11-11')).toBeNull();
    expect(await archivedTraffic(db, other, snapshot.from, snapshot.to)).toBeNull();
    const corrected = { ...snapshot, fetchedAt: '2026-11-11T03:20:00Z', insights: [] };
    await saveTrafficDays(db, company, corrected, true);
    expect(await nextTrafficCollectionDay(db, company, snapshot.from, '2026-11-11', new Date('2026-11-11T04:00:00Z'))).toBe('2026-11-11');
    expect(await nextTrafficCollectionDay(db, company, snapshot.from, '2026-11-12', new Date('2026-11-12T04:00:00Z'))).toBe('2026-11-09');
    await saveTrafficDays(db, company, { ...snapshot, fetchedAt: '2026-11-11T03:00:00Z' }, false);
    expect((await archivedTraffic(db, company, snapshot.from, snapshot.to))?.insights).toEqual([]);
    await saveTrafficDays(db, company, snapshot, true, true);
    expect((await archivedTraffic(db, company, snapshot.from, snapshot.to))?.insights).toEqual([]);
    await saveTrafficDays(db, other, snapshot, true);
    expect((await archivedTraffic(db, other, snapshot.from, snapshot.to))?.insights).toHaveLength(1);
  } finally {
    await db.end();
  }
});
