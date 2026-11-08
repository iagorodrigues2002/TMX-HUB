// biome-ignore lint/suspicious/noExplicitAny: Graph objects are polymorphic; delivery measurements are validated before publication.
type Row = Record<string, any>;
export function validTrafficRange(from: string, to: string) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
  try {
    return (
      valid(from) && valid(to) && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 < 366
    );
  } catch {
    return false;
  }
}

export async function readMetaTraffic(
  token: string,
  from: string,
  to: string,
  fetcher: typeof fetch = fetch,
) {
  if (!validTrafficRange(from, to)) throw Error('Selecione um período válido de até 366 dias.');
  async function graph(path: string, parameters: Record<string, string>) {
    if (!/^(me\/adaccounts|act_\d+\/insights|\d+)$/.test(path))
      throw Error('Consulta Meta inválida.');
    const url = new URL(`https://graph.facebook.com/v25.0/${path}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.json();
    if (body.error?.code === 200 && /API access blocked/i.test(body.error?.message ?? ''))
      throw Error(
        'A Meta bloqueou o acesso da integração (código 200: API access blocked). Verifique as restrições do app e do System User no Business Manager. O relatório anterior foi preservado.',
      );
    if (body.error?.code === 190)
      throw Error(
        'A credencial da Meta expirou ou foi revogada (código 190). Reconecte o System User. O relatório anterior foi preservado.',
      );
    if ([4, 17, 32, 613].includes(body.error?.code))
      throw Error(
        'A Meta limitou temporariamente as consultas. Aguarde antes de atualizar novamente. O relatório anterior foi preservado.',
      );
    if (!response.ok || body.error)
      throw Error('A Meta não permitiu concluir a leitura. O relatório anterior foi preservado.');
    return body;
  }
  async function all(path: string, parameters: Record<string, string>) {
    const rows: Row[] = [];
    const seen = new Set<string>();
    let after = '';
    for (let page = 0; page < 100; page++) {
      const body = await graph(path, { ...parameters, limit: '500', ...(after ? { after } : {}) });
      if (!Array.isArray(body.data)) throw Error('Resposta incompleta da Meta.');
      rows.push(...body.data);
      if (!body.paging?.next) return rows;
      after = body.paging?.cursors?.after;
      if (typeof after !== 'string' || !after || seen.has(after))
        throw Error('Paginação incompleta da Meta.');
      seen.add(after);
    }
    throw Error('Limite de leitura atingido; nenhuma importação parcial foi aplicada.');
  }
  const inventory = await all('me/adaccounts', {
    fields: 'id,name,account_status,currency,timezone_name,business{id,name}',
  });
  if (inventory.some((a) => !/^act_\d+$/.test(a.id))) throw Error('Identidade da conta inválida.');
  const validAmount = (value: unknown) =>
    typeof value === 'string' &&
    /^\d+(\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) <= Number.MAX_SAFE_INTEGER / 100;
  const validActions = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (action) => typeof action?.action_type === 'string' && validAmount(action.value),
      ));
  function validateRows(rows: Row[], hourly = false) {
    if (
      rows.some(
        (row) =>
          ![row.campaign_id, row.adset_id, row.ad_id].every(
            (id) => typeof id === 'string' && /^\d+$/.test(id),
          ) ||
          ![row.campaign_name, row.adset_name, row.ad_name].every(
            (name) => typeof name === 'string',
          ) ||
          typeof row.date_start !== 'string' ||
          row.date_start < from ||
          row.date_start > to ||
          !/^[A-Z]{3}$/.test(row.account_currency) ||
          !validAmount(row.spend) ||
          !validActions(row.actions) ||
          !validActions(row.action_values) ||
          (row.impressions != null && !validAmount(row.impressions)) ||
          (row.inline_link_clicks != null && !validAmount(row.inline_link_clicks)) ||
          (hourly &&
            !/^\d{2}:\d{2}:\d{2} - \d{2}:\d{2}:\d{2}$/.test(
              row.hourly_stats_aggregated_by_advertiser_time_zone,
            )),
      )
    )
      throw Error('A Meta retornou métricas incompletas. A consulta anterior foi preservada.');
  }
  const daily: Row[] = [];
  const hourly: Row[] = [];
  const hourlyFailures: string[] = [];
  let offset = 0;
  const parameters = {
    fields:
      'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,actions,action_values,account_currency,date_start',
    level: 'ad',
    time_increment: '1',
    use_unified_attribution_setting: 'true',
    time_range: JSON.stringify({ since: from, until: to }),
  };
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (offset < inventory.length) {
        const account = inventory[offset++]!;
        const rows = await all(`${account.id}/insights`, parameters);
        validateRows(rows);
        daily.push(...rows.map((row) => ({ ...row, accountId: account.id })));
        if (
          (Date.parse(to) - Date.parse(from)) / 86400000 < 60 &&
          rows.some((row) => Number(row.spend) > 0)
        )
          try {
            const hours = await all(`${account.id}/insights`, {
              ...parameters,
              breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
            });
            validateRows(hours, true);
            hourly.push(...hours.map((row) => ({ ...row, accountId: account.id })));
          } catch {
            hourlyFailures.push(account.id);
          }
      }
    }),
  );
  const active = new Set(
    daily.filter((row) => Number(row.spend) > 0).map((row) => row.campaign_id),
  );
  const activeRows = daily.filter((row) => active.has(row.campaign_id));
  const ids = [
    ...new Set(
      activeRows.flatMap((row) => [row.campaign_id, row.adset_id, row.ad_id]).filter(Boolean),
    ),
  ];
  const metadata = new Map<string, Row>();
  const adIds = [...new Set(activeRows.map((row) => row.ad_id))];
  const video = new Map<string, boolean | null>();
  let metadataOffset = 0;
  // Multi-ID GET was removed by Meta's upgraded API; read each object explicitly.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (metadataOffset < ids.length) {
        const id = ids[metadataOffset++]!;
        try {
          const row = await graph(id, {
            fields: adIds.includes(id)
              ? 'id,name,effective_status,creative{video_id,object_type}'
              : 'id,name,effective_status',
          });
          metadata.set(id, row);
          if (adIds.includes(id))
            video.set(
              id,
              row.creative?.video_id || row.creative?.object_type === 'VIDEO'
                ? true
                : ['PHOTO', 'IMAGE'].includes(row.creative?.object_type)
                  ? false
                  : null,
            );
        } catch {
          /* Unavailable metadata stays unknown; delivery measurements remain valid. */
        }
      }
    }),
  );
  const normalize = (row: Row) => ({
    campaignId: String(row.campaign_id),
    accountId: row.accountId,
    adsetId: String(row.adset_id),
    adsetName: String(row.adset_name ?? ''),
    adId: String(row.ad_id),
    adName: String(row.ad_name ?? ''),
    date: row.date_start,
    currency: row.account_currency,
    spend: String(row.spend ?? '0'),
    impressions: row.impressions ?? null,
    linkClicks: row.inline_link_clicks ?? null,
    actions: row.actions ?? [],
    actionValues: row.action_values ?? [],
    video: video.get(row.ad_id) ?? null,
    ...(row.hourly_stats_aggregated_by_advertiser_time_zone
      ? { hour: Number(String(row.hourly_stats_aggregated_by_advertiser_time_zone).slice(0, 2)) }
      : {}),
  });
  const symbols = [
    ...new Set([
      'BRL',
      ...inventory
        .map((a) => String(a.currency))
        .filter((c) => c !== 'USD' && /^[A-Z]{3}$/.test(c)),
    ]),
  ];
  const fxFrom = new Date(Date.parse(from) - 7 * 86400000).toISOString().slice(0, 10);
  const fxUrl = new URL(`https://api.frankfurter.dev/v1/${fxFrom}..${to}`);
  fxUrl.searchParams.set('base', 'USD');
  fxUrl.searchParams.set('symbols', symbols.join(','));
  const fxResponse = await fetcher(fxUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const fx = await fxResponse.json();
  if (!fxResponse.ok || fx.base !== 'USD' || !fx.rates || !Object.keys(fx.rates).length)
    throw Error('Cotação indisponível; relatório anterior preservado.');
  if (
    Object.entries(fx.rates).some(
      ([date, rates]) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !rates ||
        typeof rates !== 'object' ||
        Object.values(rates).some(
          (rate) => typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0,
        ),
    )
  )
    throw Error('Cotação inválida; relatório anterior preservado.');
  const campaigns = [
    ...new Map(
      activeRows.map((row) => [
        row.campaign_id,
        {
          id: String(row.campaign_id),
          name: String(row.campaign_name),
          accountId: row.accountId,
          status: String(metadata.get(row.campaign_id)?.effective_status ?? 'UNKNOWN'),
          effectiveStatus: String(metadata.get(row.campaign_id)?.effective_status ?? 'UNKNOWN'),
          objective: '',
          createdAt: null,
          updatedAt: null,
        },
      ]),
    ).values(),
  ];
  const snapshot = {
    attribution: 'adset' as const,
    fetchedAt: new Date().toISOString(),
    from,
    to,
    purchaseClassification: 'front_only_user_confirmed' as const,
    accounts: inventory.map((a) => ({
      id: a.id,
      name: a.name,
      businessId: a.business?.id ?? null,
      businessName: a.business?.name ?? null,
      currency: a.currency ?? null,
      timezone: a.timezone_name ?? null,
    })),
    campaigns,
    insights: activeRows.map(normalize),
    hourly: hourly.filter((row) => active.has(row.campaign_id)).map(normalize),
    hourlyFailures,
    ads: adIds.map((id) => ({
      id,
      status: String(metadata.get(id)?.effective_status ?? 'UNKNOWN'),
    })),
    fx: {
      base: 'USD' as const,
      provider: 'Frankfurter / ECB',
      rates: fx.rates,
      fetchedAt: new Date().toISOString(),
    },
    failures: [],
  };
  return { snapshot, inventory };
}
