import type { Sql } from 'postgres';
import type { readMetaTraffic } from './meta-traffic-reader.js';

type Snapshot = Awaited<ReturnType<typeof readMetaTraffic>>['snapshot'];

export function closedTrafficDay(accounts: Snapshot['accounts'], now = new Date()) {
  const zones = ['America/Sao_Paulo', ...accounts.map((account) => account.timezone || 'Etc/GMT+12')];
  const dates = zones.map((timeZone) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    } catch {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Etc/GMT+12', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }
  });
  return new Date(Date.parse(dates.sort()[0]!) - 86400000).toISOString().slice(0, 10);
}

export function trafficDays(from: string, to: string) {
  const days: string[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000)
    days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}

export async function nextTrafficCollectionDay(db: Sql, company: string, from: string, to: string, now = new Date()) {
  const [pending] = await db<{ day: string | null }[]>`
    SELECT min(days.day)::date::text AS day
    FROM generate_series(${from}::date,${to}::date,'1 day') AS days(day)
    WHERE NOT EXISTS (SELECT 1 FROM traffic_daily_archive a
      WHERE a.company_id=${company}::uuid AND a.day=days.day::date AND a.finalized
        AND (a.day < ${to}::date - 28 OR a.captured_at > ${now}::timestamptz - interval '24 hours'))
  `;
  return pending?.day ?? to;
}

export async function saveTrafficDays(
  db: Sql,
  company: string,
  snapshot: Snapshot,
  finalized: boolean,
  seed = false,
) {
  if (snapshot.failures.length) throw Error('Incomplete daily report');
  await db.begin(async (tx) => {
    for (const day of trafficDays(snapshot.from, snapshot.to)) {
      const insights = snapshot.insights.filter((row) => row.date === day);
      const campaigns = new Set(insights.map((row) => row.campaignId));
      const ads = new Set(insights.map((row) => row.adId));
      const daily = {
        ...snapshot, from: day, to: day, insights,
        campaigns: snapshot.campaigns.filter((row) => campaigns.has(row.id)),
        ads: snapshot.ads.filter((row) => ads.has(row.id)),
        hourly: snapshot.hourly?.filter((row) => row.date === day) ?? [],
      };
      await tx`
        INSERT INTO traffic_daily_archive (company_id,day,snapshot,finalized,captured_at)
        VALUES (${company}::uuid,${day}::date,${tx.json(daily)},${finalized},${snapshot.fetchedAt})
        ON CONFLICT (company_id,day) DO UPDATE SET
          snapshot=EXCLUDED.snapshot,finalized=traffic_daily_archive.finalized OR EXCLUDED.finalized,captured_at=EXCLUDED.captured_at
        WHERE NOT ${seed}
          AND traffic_daily_archive.captured_at <= EXCLUDED.captured_at
      `;
    }
  });
}

export async function archivedTraffic(db: Sql, company: string, from: string, to: string) {
  const rows = await db<{ day: string; snapshot: Snapshot }[]>`
    SELECT day::text,snapshot FROM traffic_daily_archive
    WHERE company_id=${company}::uuid AND day BETWEEN ${from}::date AND ${to}::date
    ORDER BY day
  `;
  if (rows.length !== trafficDays(from, to).length) return null;
  const latest = rows.at(-1)?.snapshot;
  if (!latest) return null;
  const campaigns = new Map<string, Snapshot['campaigns'][number]>();
  const ads = new Map<string, Snapshot['ads'][number]>();
  const accounts = new Map<string, Snapshot['accounts'][number]>();
  const rates: Snapshot['fx']['rates'] = {};
  for (const { snapshot } of rows) {
    for (const row of snapshot.accounts) accounts.set(row.id, row);
    for (const row of snapshot.campaigns) campaigns.set(row.id, row);
    for (const row of snapshot.ads) ads.set(row.id, row);
    Object.assign(rates, snapshot.fx.rates);
  }
  return {
    ...latest, from, to,
    accounts: [...accounts.values()], campaigns: [...campaigns.values()], ads: [...ads.values()],
    insights: rows.flatMap(({ snapshot }) => snapshot.insights),
    hourly: rows.flatMap(({ snapshot }) => snapshot.hourly ?? []),
    fx: { ...latest.fx, rates },
  };
}
