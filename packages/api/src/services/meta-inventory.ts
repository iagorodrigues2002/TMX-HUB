import { createHmac } from 'node:crypto';

export type MetaInventoryStatus = 'Ativo' | 'Desabilitado' | null;
export function inventoryAccountStatus(value: unknown): MetaInventoryStatus {
  if (value === 1) return 'Ativo';
  if ([2, 100, 101, 202].includes(Number(value))) return 'Desabilitado';
  return null;
}

export function trafficInventorySnapshot(
  rows: readonly Record<string, unknown>[],
  fetchedAt: string,
  previousBusinesses: readonly { id: string; relationship?: string }[] = [],
  fallback: 'unknown' | 'shared' = 'unknown',
) {
  const businesses = new Map<
    string,
    { id: string; name: string; status: null; relationship: string }
  >();
  const accounts = new Map<
    string,
    { id: string; name: string; businessId: string | null; status: MetaInventoryStatus }
  >();
  for (const row of rows) {
    if (typeof row.id !== 'string' || !/^act_\d+$/.test(row.id) || typeof row.name !== 'string')
      throw Error('Invalid account inventory');
    const b = row.business as { id?: unknown; name?: unknown } | null | undefined;
    const businessId = typeof b?.id === 'string' && /^\d+$/.test(b.id) ? b.id : null;
    if (businessId)
      businesses.set(businessId, {
        id: businessId,
        name: typeof b?.name === 'string' ? b.name : businessId,
        status: null,
        relationship:
          previousBusinesses.find((item) => item.id === businessId)?.relationship ?? fallback,
      });
    accounts.set(row.id, {
      id: row.id,
      name: row.name,
      businessId,
      status: inventoryAccountStatus(Number(row.account_status)),
    });
  }
  return {
    businesses: [...businesses.values()],
    accounts: [...accounts.values()],
    fetchedAt,
    coverage: 'businesses_from_assigned_accounts' as const,
  };
}

export async function readMetaInventory(
  input: { token: string; appSecret?: string; version: string },
  fetcher: typeof fetch = fetch,
) {
  if (!/^v\d+\.\d+$/.test(input.version)) throw new Error('Versão da API inválida.');
  const businesses = new Map<string, { id: string; name: string; status: MetaInventoryStatus }>();
  const accounts = new Map<
    string,
    { id: string; name: string; businessId: string | null; status: MetaInventoryStatus }
  >();
  const seen = new Set<string>();
  let after = '';
  const deadline = AbortSignal.timeout(60_000);
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://graph.facebook.com/${input.version}/me/adaccounts`);
    url.searchParams.set('fields', 'id,account_id,name,account_status,business{id,name}');
    url.searchParams.set('limit', '100');
    if (input.appSecret)
      url.searchParams.set(
        'appsecret_proof',
        createHmac('sha256', input.appSecret).update(input.token).digest('hex'),
      );
    if (after) url.searchParams.set('after', after);
    const response = await fetcher(url, {
      redirect: 'error',
      headers: { Authorization: `Bearer ${input.token}` },
      signal: AbortSignal.any([deadline, AbortSignal.timeout(15_000)]),
    });
    const body = await response.json();
    if (!response.ok || body?.error || !Array.isArray(body?.data))
      throw new Error('Não foi possível consultar o inventário da Meta.');
    for (const account of body.data) {
      const id = String(account.id ?? '');
      if (!/^act_\d+$/.test(id) || typeof account.name !== 'string')
        throw new Error('Resposta de inventário inválida.');
      const business = account.business;
      const businessId = business?.id ? String(business.id) : null;
      if (businessId) {
        if (!/^\d+$/.test(businessId) || typeof business.name !== 'string')
          throw new Error('Resposta de BM inválida.');
        businesses.set(businessId, { id: businessId, name: business.name, status: null });
      }
      accounts.set(id, {
        id,
        name: account.name,
        businessId,
        status: inventoryAccountStatus(account.account_status),
      });
    }
    if (!body.paging?.next)
      return {
        businesses: [...businesses.values()],
        accounts: [...accounts.values()],
        fetchedAt: new Date().toISOString(),
        coverage: 'businesses_from_assigned_accounts',
      };
    const cursor = body.paging?.cursors?.after;
    if (typeof cursor !== 'string' || !cursor || cursor.length > 4096 || seen.has(cursor))
      throw new Error('Paginação incompleta do inventário.');
    seen.add(cursor);
    after = cursor;
  }
  throw new Error(
    'Inventário excede o limite de leitura. Nenhuma importação parcial foi aplicada.',
  );
}
