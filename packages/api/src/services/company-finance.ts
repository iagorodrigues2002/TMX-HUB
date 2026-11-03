import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { FinanceProviderError, financeBalances, financeHistory } from './finance-providers.js';
import type { FinanceProvider } from './finance-providers.js';

export async function runFinanceSync(sql: Sql) {
  if (!env.TRACKING_ENCRYPTION_KEY) return;
  const lease = randomUUID();
  const [connection] =
    await sql`UPDATE company_finance_connections SET lease_id=${lease},lease_until=now()+interval '10 minutes',status='syncing'
    WHERE id=(SELECT id FROM company_finance_connections WHERE key_encrypted IS NOT NULL AND next_sync_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_sync_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *`;
  if (!connection) return;
  const now = new Date();
  const initial = connection.history_cursor == null;
  const cursor = new Date(connection.history_cursor ?? connection.history_start);
  // Commit small historical windows so a restart resumes, never repeats the whole 90 days.
  const start = new Date(
    initial
      ? cursor.getTime()
      : Math.max(new Date(connection.history_start).getTime(), cursor.getTime() - 2 * 86400000),
  );
  const end = new Date(Math.min(now.getTime(), cursor.getTime() + 7 * 86400000));
  try {
    const key = decryptSecret(connection.key_encrypted, env.TRACKING_ENCRYPTION_KEY);
    const provider = connection.provider as FinanceProvider;
    const balances = await financeBalances(provider, key, connection.profile_id);
    let historySupported = connection.history_supported !== false;
    let entries: Awaited<ReturnType<typeof financeHistory>> = [];
    if (historySupported) {
      try {
        entries = await financeHistory(
          provider,
          key,
          connection.profile_id,
          start.toISOString(),
          end.toISOString(),
          balances,
        );
      } catch (error) {
        if (
          provider === 'wise' &&
          error instanceof FinanceProviderError &&
          error.code === 'permission_required'
        )
          historySupported = false;
        else throw error;
      }
    }
    await sql.begin(async (tx) => {
      const [current] =
        await tx`SELECT id FROM company_finance_connections WHERE id=${connection.id} AND lease_id=${lease} AND key_encrypted IS NOT NULL FOR UPDATE`;
      if (!current) return;
      for (const entry of entries) {
        await tx`INSERT INTO company_finance_entries(company_id,connection_id,external_id,operation_id,occurred_at,kind,status,description,sent,sent_currency,received,received_currency)
          VALUES(${connection.company_id},${connection.id},${entry.externalId},${entry.operationId},${entry.at},${entry.kind},${entry.status},${entry.description},${entry.sent},${entry.sentCurrency},${entry.received},${entry.receivedCurrency})
          ON CONFLICT(connection_id,external_id) DO UPDATE SET status=EXCLUDED.status,description=EXCLUDED.description,occurred_at=EXCLUDED.occurred_at,sent=EXCLUDED.sent,sent_currency=EXCLUDED.sent_currency,received=EXCLUDED.received,received_currency=EXCLUDED.received_currency,updated_at=now()`;
      }
      await tx`UPDATE company_finance_connections SET balances=${tx.json(balances)},history_supported=${historySupported},history_cursor=${historySupported ? end : connection.history_cursor},last_sync_at=now(),status=${historySupported ? 'ready' : 'balance_only'},error_code=NULL,lease_id=NULL,lease_until=NULL,
        next_sync_at=now()+${historySupported && end.getTime() < now.getTime() ? '15 seconds' : '15 minutes'}::interval WHERE id=${connection.id}`;
    });
  } catch (error) {
    const code = error instanceof FinanceProviderError ? error.code : 'invalid_provider_response';
    await sql`UPDATE company_finance_connections SET status='error',error_code=${code},lease_id=NULL,lease_until=NULL,next_sync_at=now()+interval '15 minutes' WHERE id=${connection.id} AND lease_id=${lease}`;
  }
}
