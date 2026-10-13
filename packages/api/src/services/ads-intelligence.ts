import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { authenticate, detectDashboardCurrency, fetchAds } from './utmify-sync.js';

export const ADS_START = '2026-08-01';
export function adsTokens(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
export function logicalAd(name: string, adset = '') {
  const text = `${name} ${adset}`;
  const batches = [
    ...text.matchAll(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*(\d+)(?=$|[^0-9])/gi),
  ].map((m) => Number(m[1]));
  const unique = [...new Set(batches)];
  const ad = name.match(/(?:^|[^A-Z0-9])AD[\s_-]*0*(\d+)(?=$|[^0-9])/i);
  if (unique.length !== 1 || !ad) return null;
  const variant = adsTokens(
    name
      .replace(ad[0], ' ')
      .replace(/(?:^|[^A-Z0-9])(?:LEVA\s*|L)[\s_-]*0*\d+(?=$|[^0-9])/gi, ' ')
      .replace(/(?:copia|copy)(?:\s*\d+)?/gi, ''),
  );
  return { batch: `L${unique[0]}`, ad: `AD${String(Number(ad[1])).padStart(2, '0')}`, variant };
}
export function matchCampaign(campaign: string, offers: Array<{ id: string; name: string }>) {
  const token = `_${adsTokens(campaign)}_`;
  const matches = offers.filter((o) => token.includes(`_${adsTokens(o.name)}_`));
  const longest = Math.max(0, ...matches.map((o) => adsTokens(o.name).length));
  const winners = matches.filter((o) => adsTokens(o.name).length === longest);
  return winners.length === 1 ? winners[0]!.id : null;
}
export function stringField(raw: Record<string, unknown>, key: string): string {
  return typeof raw[key] === 'string' ? (raw[key] as string) : '';
}
export function physicalKey(raw: Record<string, unknown>) {
  // Raw provider rows are retained. Never consolidate costs merely by visible ad name.
  const identity = [
    raw.adAccountId,
    raw.campaignId ?? raw.campaignName,
    raw.adsetId ?? raw.adsetName,
    raw.adId ?? raw.id,
    raw.name,
  ];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
export function nextImportRange(lastSync: string | null, today: string) {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = lastSync ? new Date(`${today}T12:00:00Z`) : new Date(`${ADS_START}T12:00:00Z`);
  if (lastSync) {
    start.setUTCDate(start.getUTCDate() - 35);
    const last = new Date(lastSync);
    if (last < start) start.setTime(last.getTime());
  }
  return {
    from:
      start.toISOString().slice(0, 10) < ADS_START ? ADS_START : start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
/** One authenticated import per week. Durable cursor; failures pause, never retry login automatically. */
export async function runAdsImport(app: Pick<FastifyInstance, 'db'>) {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return;
  const db = app.db;
  const [connection] = await db`
    UPDATE ads_intelligence_connections SET lease_until=now()+interval '30 minutes',state='importing',next_sync_at=now()+interval '7 days'
    WHERE owner_id=(SELECT owner_id FROM ads_intelligence_connections
      WHERE state IN ('ready','importing') AND next_sync_at<=now()
        AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_sync_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING *`;
  if (!connection) return;
  try {
    const credentials = JSON.parse(
      decryptSecret(connection.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
    );
    const session = await authenticate(credentials.login, credentials.password);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const range = connection.range_end
      ? {
          from: String(connection.cursor_date).slice(0, 10),
          to: String(connection.range_end).slice(0, 10),
        }
      : nextImportRange(connection.last_sync_at, today);
    await db`UPDATE ads_intelligence_connections SET state='importing',range_end=${range.to},cursor_date=${range.from},next_sync_at=now()+interval '7 days' WHERE owner_id=${connection.owner_id}`;
    const date = new Date(`${range.from}T12:00:00Z`);
    // All daily calls belong to a single weekly import, sequential and bounded.
    for (let count = 0; date.toISOString().slice(0, 10) <= range.to && count < 400; count++) {
      const day = date.toISOString().slice(0, 10);
      const response = await fetchAds(session.token, connection.dashboard_id, day);
      const currency =
        response.currency ??
        detectDashboardCurrency(session.payload, connection.dashboard_id) ??
        null;
      const keys = response.results.map((row) => physicalKey(row));
      if (new Set(keys).size !== keys.length)
        throw new Error(
          'UTMify retornou anúncios sem identidade física distinguível. Importação pausada.',
        );
      await db.begin(async (sql) => {
        await sql`DELETE FROM ads_intelligence_daily WHERE owner_id=${connection.owner_id} AND day=${day}`;
        for (const row of response.results)
          await sql`INSERT INTO ads_intelligence_daily(owner_id,day,physical_key,raw,currency) VALUES(${connection.owner_id},${day},${physicalKey(row)},${sql.json(row as never)},${currency})`;
        date.setUTCDate(date.getUTCDate() + 1);
        await sql`UPDATE ads_intelligence_connections SET cursor_date=${date.toISOString().slice(0, 10)},lease_until=now()+interval '30 minutes' WHERE owner_id=${connection.owner_id}`;
      });
    }
    if (date.toISOString().slice(0, 10) <= range.to)
      throw new Error('Importação excedeu limite seguro de dias.');
    await db`UPDATE ads_intelligence_connections SET state='ready',last_sync_at=now(),coverage_from=COALESCE(coverage_from,${ADS_START}::date),coverage_to=${range.to}::date,range_end=NULL,lease_until=NULL,error=NULL WHERE owner_id=${connection.owner_id}`;
  } catch {
    // Never expose upstream bodies, account identities or credentials in logs/UI.
    await db`UPDATE ads_intelligence_connections SET state='paused',lease_until=NULL,error='Importação pausada: falha de autenticação, contrato ou consulta UTMify. Atualize a conexão para retomar.' WHERE owner_id=${connection.owner_id}`;
  }
}
