import { randomUUID } from 'node:crypto';

export interface TrafficHealth {
  observedAt: string;
  accounts: {
    id: string;
    name: string;
    status: number;
    rejected: { id: string; name: string; campaignId: string; campaignName: string }[];
    adsComplete: boolean;
  }[];
}
export interface TrafficAlert {
  id: string;
  kind: 'traffic';
  unread: true;
  createdAt: string;
  title: string;
  traffic: {
    type: 'ad_rejected' | 'account_disabled';
    ownerId: string;
    companyId?: string;
    accountId: string;
    accountName: string;
    campaignId?: string;
    campaignName?: string;
    adId?: string;
    adName?: string;
  };
}
export const trafficAlertPrefix = (ownerId: string) =>
  `traffic-alerts:v1:${encodeURIComponent(ownerId)}:`;

/** Health is independent of spend/date filters, so rejected ads without delivery are included. */
export async function readMetaTrafficHealth(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<TrafficHealth> {
  async function pages<T>(
    path: string,
    fields: string,
    parameters: Record<string, string> = {},
  ): Promise<T[]> {
    if (!/^(me\/adaccounts|act_\d+\/ads)$/.test(path)) throw Error('Invalid health path');
    const rows: T[] = [];
    const seen = new Set<string>();
    let after = '';
    for (let page = 0; page < 100; page++) {
      const url = new URL(`https://graph.facebook.com/v25.0/${path}`);
      url.search = new URLSearchParams({
        fields,
        limit: '500',
        ...parameters,
        ...(after ? { after } : {}),
      }).toString();
      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok || body.error || !Array.isArray(body.data))
        throw Error('Meta health unavailable');
      rows.push(...body.data);
      if (!body.paging?.next) return rows;
      after = body.paging?.cursors?.after;
      if (typeof after !== 'string' || !after || after.length > 4096 || seen.has(after))
        throw Error('Incomplete health pagination');
      seen.add(after);
    }
    throw Error('Health pagination limit');
  }
  const accounts = await pages<{ id: string; name: string; account_status: number }>(
    'me/adaccounts',
    'id,name,account_status',
  );
  if (
    accounts.some(
      (a) =>
        !/^act_\d+$/.test(a.id) ||
        typeof a.name !== 'string' ||
        !Number.isInteger(a.account_status),
    )
  )
    throw Error('Invalid account health');
  const result: TrafficHealth = { observedAt: new Date().toISOString(), accounts: [] };
  let offset = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (offset < accounts.length) {
        const a = accounts[offset++]!;
        const account: TrafficHealth['accounts'][number] = {
          id: a.id,
          name: a.name,
          status: a.account_status,
          rejected: [],
          adsComplete: false,
        };
        try {
          const ads = await pages<{
            id: string;
            name: string;
            effective_status: string;
            campaign?: { id: string; name: string };
          }>(`${a.id}/ads`, 'id,name,effective_status,campaign{id,name}', {
            effective_status: JSON.stringify(['DISAPPROVED']),
          });
          if (
            ads.some(
              (ad) =>
                typeof ad.id !== 'string' ||
                !/^\d+$/.test(ad.id) ||
                typeof ad.name !== 'string' ||
                ad.effective_status !== 'DISAPPROVED' ||
                typeof ad.campaign?.id !== 'string' ||
                !/^\d+$/.test(ad.campaign.id) ||
                typeof ad.campaign?.name !== 'string',
            )
          )
            throw Error('Invalid ad health');
          account.rejected = ads.map((ad) => ({
            id: ad.id,
            name: ad.name,
            campaignId: ad.campaign!.id,
            campaignName: ad.campaign!.name,
          }));
          account.adsComplete = true;
        } catch {
          /* A failed account scan must not imply approval or reset the previous baseline. */
        }
        result.accounts.push(account);
      }
    }),
  );
  return result;
}

export function trafficHealthChanges(
  previous: TrafficHealth | null,
  current: TrafficHealth,
  ownerId: string,
  companyId?: string,
) {
  const old = new Map(previous?.accounts.map((a) => [a.id, a]) ?? []);
  const merged = new Map(old);
  const events: TrafficAlert[] = [];
  for (const account of current.accounts) {
    const before = old.get(account.id);
    const base = {
      ownerId,
      ...(companyId ? { companyId } : {}),
      accountId: account.id,
      accountName: account.name,
    };
    if (
      before &&
      [1, 3, 7, 8, 9, 100].includes(before.status) &&
      [2, 101, 202].includes(account.status)
    )
      events.push({
        id: `traffic:${randomUUID()}`,
        kind: 'traffic',
        unread: true,
        createdAt: current.observedAt,
        title: 'Conta de anúncios desabilitada',
        traffic: { ...base, type: 'account_disabled' },
      });
    if (before?.adsComplete && account.adsComplete) {
      const rejected = new Set(before.rejected.map((ad) => ad.id));
      for (const ad of account.rejected)
        if (!rejected.has(ad.id))
          events.push({
            id: `traffic:${randomUUID()}`,
            kind: 'traffic',
            unread: true,
            createdAt: current.observedAt,
            title: 'Anúncio reprovado',
            traffic: {
              ...base,
              type: 'ad_rejected',
              campaignId: ad.campaignId,
              campaignName: ad.campaignName,
              adId: ad.id,
              adName: ad.name,
            },
          });
    }
    merged.set(
      account.id,
      account.adsComplete
        ? account
        : {
            ...account,
            rejected: before?.rejected ?? [],
            adsComplete: before?.adsComplete ?? false,
          },
    );
  }
  return {
    state: {
      observedAt: current.observedAt,
      accounts: [...merged.values()],
      incompleteAccounts: current.accounts.filter((a) => !a.adsComplete).length,
    },
    events,
  };
}

// State and outbox commit together; concurrent workers cannot notify the same transition twice.
export async function recordTrafficHealth(
  redis: {
    get: (key: string) => Promise<string | null>;
    eval: (script: string, keys: number, ...args: (string | number)[]) => Promise<unknown>;
  },
  ownerId: string,
  current: TrafficHealth,
) {
  const prefix = trafficAlertPrefix(ownerId);
  const previous = await redis.get(`${prefix}state`);
  const before = previous ? JSON.parse(previous) : null;
  if (before && Date.parse(current.observedAt) <= Date.parse(before.observedAt)) return [];
  const companyId = await redis.get(`${prefix}company`);
  const { state, events } = trafficHealthChanges(before, current, ownerId, companyId ?? undefined);
  const committed = await redis.eval(
    "if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); for i=3,#ARGV do redis.call('LPUSH',KEYS[2],ARGV[i]) end; redis.call('LTRIM',KEYS[2],0,999); redis.call('EXPIRE',KEYS[2],2592000); return 1",
    2,
    `${prefix}state`,
    `${prefix}events`,
    previous ?? '',
    JSON.stringify(state),
    ...events.map((e) => JSON.stringify(e)),
  );
  return committed === 1 ? events : [];
}
