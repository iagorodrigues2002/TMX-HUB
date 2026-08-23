import { createHmac } from 'node:crypto';
import { ulid } from 'ulid';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';

type JsonObject = Record<string, unknown>;

interface MetaConnectionRow {
  id: string;
  app_id: string;
  app_secret_encrypted: string;
  access_token_encrypted: string;
}

function minorFromDecimal(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function asInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function actionValue(rows: unknown, names: string[]): number {
  if (!Array.isArray(rows)) return 0;
  let value = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    if (names.includes(String(item.action_type ?? ''))) {
      value = Math.max(value, Number(item.value ?? 0) || 0);
    }
  }
  return value;
}

async function graphGet(
  path: string,
  token: string,
  appSecret: string,
  params: Record<string, string> = {},
): Promise<JsonObject> {
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${path}`);
  url.searchParams.set('access_token', token);
  url.searchParams.set(
    'appsecret_proof',
    createHmac('sha256', appSecret).update(token).digest('hex'),
  );
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { 'user-agent': 'TMX-Meta-Control/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await response.json().catch(() => ({}))) as JsonObject;
  if (!response.ok || body.error) {
    const error = body.error as Record<string, unknown> | undefined;
    throw new Error(String(error?.message ?? `Meta HTTP ${response.status}`));
  }
  return body;
}

async function graphAll(
  path: string,
  token: string,
  appSecret: string,
  params: Record<string, string>,
): Promise<JsonObject[]> {
  const out: JsonObject[] = [];
  let next: string | null = null;
  let page = await graphGet(path, token, appSecret, params);
  for (let guard = 0; guard < 20; guard += 1) {
    if (Array.isArray(page.data)) out.push(...(page.data as JsonObject[]));
    next = String((page.paging as Record<string, unknown> | undefined)?.next ?? '') || null;
    if (!next) break;
    const response = await fetch(next, { signal: AbortSignal.timeout(30_000) });
    page = (await response.json()) as JsonObject;
  }
  return out;
}

export async function validateMetaMarketingCredentials(
  token: string,
  appSecret: string,
): Promise<{ id: string; name: string | null }> {
  const profile = await graphGet('me', token, appSecret, { fields: 'id,name' });
  if (!profile.id) throw new Error('A Meta não retornou o usuário associado ao token.');
  return {
    id: String(profile.id),
    name: profile.name ? String(profile.name) : null,
  };
}

export async function syncMetaMarketingConnection(
  app: FastifyInstance,
  connection: MetaConnectionRow,
): Promise<{ accounts: number; campaigns: number }> {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY) throw new Error('Banco ou criptografia indisponível.');
  const token = decryptSecret(connection.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
  const secret = decryptSecret(connection.app_secret_encrypted, env.TRACKING_ENCRYPTION_KEY);
  try {
    const accounts = await graphAll('me/adaccounts', token, secret, {
      fields:
        'id,account_id,name,account_status,disable_reason,amount_spent,balance,spend_cap,currency,timezone_name,business{id,name},created_time',
      limit: '500',
    });
    let campaignCount = 0;
    for (const account of accounts) {
      const externalId = String(account.account_id ?? String(account.id ?? '').replace(/^act_/, ''));
      const business = (account.business ?? {}) as Record<string, unknown>;
      const [storedAccount] = await app.db<{ id: string }[]>`
        INSERT INTO meta_ad_accounts
          (id, connection_id, external_id, name, business_id, business_name,
           account_status, disable_reason, currency, timezone_name, amount_spent_minor,
           balance_minor, spend_cap_minor, created_time, last_synced_at, updated_at)
        VALUES
          (${ulid()}, ${connection.id}, ${externalId}, ${String(account.name ?? externalId)},
           ${business.id ? String(business.id) : null}, ${business.name ? String(business.name) : null},
           ${asInt(account.account_status)}, ${asInt(account.disable_reason)},
           ${String(account.currency ?? 'BRL')}, ${account.timezone_name ? String(account.timezone_name) : null},
           ${asInt(account.amount_spent)}, ${asInt(account.balance)}, ${asInt(account.spend_cap)},
           ${account.created_time ? new Date(String(account.created_time)) : null}, now(), now())
        ON CONFLICT (connection_id, external_id) DO UPDATE SET
          name=EXCLUDED.name, business_id=EXCLUDED.business_id, business_name=EXCLUDED.business_name,
          account_status=EXCLUDED.account_status, disable_reason=EXCLUDED.disable_reason,
          currency=EXCLUDED.currency, timezone_name=EXCLUDED.timezone_name,
          amount_spent_minor=EXCLUDED.amount_spent_minor, balance_minor=EXCLUDED.balance_minor,
          spend_cap_minor=EXCLUDED.spend_cap_minor, last_synced_at=now(), updated_at=now()
        RETURNING id
      `;
      if (!storedAccount) continue;
      const accountNode = `act_${externalId}`;
      const [campaigns, insightPage] = await Promise.all([
        graphAll(`${accountNode}/campaigns`, token, secret, {
          fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
          limit: '500',
        }),
        graphGet(`${accountNode}/insights`, token, secret, {
          fields: 'spend,impressions,reach,clicks,inline_link_clicks,actions,action_values',
          date_preset: 'last_30d',
          level: 'account',
          limit: '10',
        }),
      ]);
      campaignCount += campaigns.length;
      for (const campaign of campaigns) {
        await app.db`
          INSERT INTO meta_ad_campaigns
            (id, account_id, external_id, name, configured_status, effective_status,
             objective, daily_budget_minor, lifetime_budget_minor, last_synced_at, updated_at)
          VALUES
            (${ulid()}, ${storedAccount.id}, ${String(campaign.id)}, ${String(campaign.name ?? campaign.id)},
             ${campaign.status ? String(campaign.status) : null},
             ${campaign.effective_status ? String(campaign.effective_status) : null},
             ${campaign.objective ? String(campaign.objective) : null},
             ${campaign.daily_budget ? asInt(campaign.daily_budget) : null},
             ${campaign.lifetime_budget ? asInt(campaign.lifetime_budget) : null}, now(), now())
          ON CONFLICT (account_id, external_id) DO UPDATE SET
            name=EXCLUDED.name, configured_status=EXCLUDED.configured_status,
            effective_status=EXCLUDED.effective_status, objective=EXCLUDED.objective,
            daily_budget_minor=EXCLUDED.daily_budget_minor,
            lifetime_budget_minor=EXCLUDED.lifetime_budget_minor,
            last_synced_at=now(), updated_at=now()
        `;
      }
      const insight = Array.isArray(insightPage.data) ? (insightPage.data[0] as JsonObject | undefined) : undefined;
      const purchases = actionValue(insight?.actions, [
        'purchase',
        'omni_purchase',
        'offsite_conversion.fb_pixel_purchase',
      ]);
      const purchaseValue = actionValue(insight?.action_values, [
        'purchase',
        'omni_purchase',
        'offsite_conversion.fb_pixel_purchase',
      ]);
      await app.db`
        INSERT INTO meta_ad_account_snapshots
          (id, account_id, snapshot_date, amount_spent_minor, balance_minor, spend_30d_minor,
           impressions_30d, reach_30d, clicks_30d, link_clicks_30d, purchases_30d,
           purchase_value_30d, campaigns_total, campaigns_active, captured_at)
        VALUES
          (${ulid()}, ${storedAccount.id}, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
           ${asInt(account.amount_spent)}, ${asInt(account.balance)}, ${minorFromDecimal(insight?.spend)},
           ${asInt(insight?.impressions)}, ${asInt(insight?.reach)}, ${asInt(insight?.clicks)},
           ${asInt(insight?.inline_link_clicks)}, ${purchases}, ${purchaseValue},
           ${campaigns.length}, ${campaigns.filter((item) => item.effective_status === 'ACTIVE').length}, now())
        ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
          amount_spent_minor=EXCLUDED.amount_spent_minor, balance_minor=EXCLUDED.balance_minor,
          spend_30d_minor=EXCLUDED.spend_30d_minor, impressions_30d=EXCLUDED.impressions_30d,
          reach_30d=EXCLUDED.reach_30d, clicks_30d=EXCLUDED.clicks_30d,
          link_clicks_30d=EXCLUDED.link_clicks_30d, purchases_30d=EXCLUDED.purchases_30d,
          purchase_value_30d=EXCLUDED.purchase_value_30d,
          campaigns_total=EXCLUDED.campaigns_total, campaigns_active=EXCLUDED.campaigns_active,
          captured_at=now()
      `;
    }
    await app.db`
      UPDATE meta_marketing_connections
      SET last_sync_at=now(), last_sync_error=NULL, updated_at=now()
      WHERE id=${connection.id}
    `;
    return { accounts: accounts.length, campaigns: campaignCount };
  } catch (error) {
    await app.db`
      UPDATE meta_marketing_connections
      SET last_sync_error=${error instanceof Error ? error.message : String(error)}, updated_at=now()
      WHERE id=${connection.id}
    `;
    throw error;
  }
}
