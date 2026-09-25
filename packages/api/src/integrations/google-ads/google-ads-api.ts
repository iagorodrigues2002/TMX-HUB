import { z } from 'zod';
import { GOOGLE_ADS_SCOPE, type GoogleOAuthConfig } from './oauth.js';

const TokenResponse = z.object({ access_token: z.string().min(1), token_type: z.string().min(1) });
const AccountsResponse = z.object({ resourceNames: z.array(z.string()).default([]) });

export type GoogleAdsAccount = {
  customer_id: string;
  name: string;
  manager: boolean;
};

export async function refreshGoogleAccessToken(config: GoogleOAuthConfig, refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: config.clientId,
      client_secret: config.clientSecret, refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const parsed = TokenResponse.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || parsed.data.token_type.toLowerCase() !== 'bearer') {
    throw new Error('google_oauth_refresh_failed');
  }
  return parsed.data.access_token;
}

function googleAdsHeaders(accessToken: string, loginCustomerId?: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  };
}

/**
 * Lists directly accessible accounts and the enabled children of accessible
 * manager accounts. Google Ads now manages API access through Google Cloud,
 * so no developer token is required for this discovery request.
 */
export async function listGoogleAdsAccounts(input: {
  accessToken: string;
}) {
  const rootsResponse = await fetch('https://googleads.googleapis.com/v22/customers:listAccessibleCustomers', {
    headers: googleAdsHeaders(input.accessToken), signal: AbortSignal.timeout(20_000),
  });
  const roots = AccountsResponse.safeParse(await rootsResponse.json().catch(() => null));
  if (!rootsResponse.ok || !roots.success) throw new Error('google_ads_accounts_unavailable');
  const rootIds = roots.data.resourceNames.map(v => v.match(/^customers\/(\d{10})$/)?.[1]).filter((v): v is string => Boolean(v));
  const accounts = new Map<string, GoogleAdsAccount>();

  async function searchCustomer(customerId: string, loginCustomerId?: string) {
    const response = await fetch(`https://googleads.googleapis.com/v22/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST', headers: googleAdsHeaders(input.accessToken, loginCustomerId),
      body: JSON.stringify({
        query: 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.status = \'ENABLED\'',
      }), signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null) as Array<{ results?: Array<{ customerClient?: { id?: string; descriptiveName?: string; manager?: boolean } }> }> | null;
    return { ok: response.ok && Array.isArray(payload), payload };
  }

  for (const rootId of rootIds) {
    // A direct Google Ads account must be queried without login-customer-id.
    // An MCC requires it. Supporting both paths prevents valid direct accounts
    // from disappearing merely because they are also reachable through an MCC.
    let result = await searchCustomer(rootId);
    if (!result.ok) result = await searchCustomer(rootId, rootId);
    if (!result.ok) {
      // listAccessibleCustomers itself is authoritative for direct access.
      // Preserve the selectable account when the optional enrichment query is
      // unavailable (for example an MCC policy/API propagation delay).
      accounts.set(rootId, { customer_id: rootId, name: `Conta ${rootId}`, manager: false });
      continue;
    }
    for (const batch of result.payload ?? []) for (const row of batch.results ?? []) {
      const account = row.customerClient;
      if (!account?.id || !/^\d{10}$/.test(account.id)) continue;
      accounts.set(account.id, { customer_id: account.id, name: account.descriptiveName?.trim() || `Conta ${account.id}`, manager: Boolean(account.manager) });
    }
  }
  return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function hasGoogleAdsScope(scope: string) {
  return scope.split(' ').includes(GOOGLE_ADS_SCOPE);
}
