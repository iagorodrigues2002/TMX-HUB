'use client';

import { money, percentage } from './tracking-live-console-support';
import type { useTrackingLiveConsoleState } from './tracking-live-console-use-tracking-live-console-state';

export function renderAttributionView({
  orders,
  attribution,
}: Pick<ReturnType<typeof useTrackingLiveConsoleState>, 'orders' | 'attribution'>) {
  return (
    <div className="p-5 md:p-6">
      <div className="mb-5">
        <p className="hud-label">Atribuição completa · first-party</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Campanhas e anúncios</h3>
        <p className="mt-2 text-sm text-white/45">
          Visitas, checkouts e vendas agrupados pelas UTMs e IDs preservados pelo TMX.
        </p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Campanhas',
            value: new Set(
              (attribution.data?.rows ?? [])
                .map((row) => row.campaign_id ?? row.campaign_name)
                .filter((value) => value !== 'não identificada'),
            ).size,
          },
          {
            label: 'Cliques TMX',
            value: (attribution.data?.rows ?? []).reduce(
              (total, row) => total + row.unique_ad_clicks,
              0,
            ),
          },
          {
            label: 'Conectados',
            value: (attribution.data?.rows ?? []).reduce((total, row) => total + row.visitors, 0),
          },
          {
            label: 'ICs únicos',
            value: (attribution.data?.rows ?? []).reduce(
              (total, row) => total + row.unique_checkouts,
              0,
            ),
          },
          {
            label: 'Vendas',
            value: (attribution.data?.rows ?? []).reduce(
              (total, row) => total + row.paid_orders,
              0,
            ),
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-white/[0.07] bg-black/10 px-4 py-3"
          >
            <p className="hud-label">{metric.label}</p>
            <p className="mt-2 font-mono text-2xl text-white">
              {metric.value.toLocaleString('pt-BR')}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="min-w-[1480px] w-full text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-black/20 text-white/35">
            <tr>
              {[
                'Campanha',
                'Página anunciante',
                'Conjunto',
                'Anúncio',
                'Origem',
                'Cliques',
                'Visitas',
                'Connect Rate',
                'IC',
                'Conv. IC',
                'Pedidos',
                'Vendas',
                'Receita',
              ].map((label) => (
                <th key={label} className="px-4 py-3 font-medium uppercase tracking-wider">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {(attribution.data?.rows ?? []).map((row, index) => (
              <tr
                key={`${row.campaign_id ?? row.campaign_name}-${row.ad_id ?? row.ad_name}-${index}`}
                className="bg-black/5"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-white/80">{row.campaign_name}</p>
                  <p className="mt-1 font-mono text-[10px] text-white/30">
                    {row.campaign_id ?? 'sem campaign_id'}
                  </p>
                </td>
                <td className="min-w-48 px-4 py-3">
                  <p className="text-white/65">{row.page_name || 'Não informada'}</p>
                  {row.page_id && (
                    <p className="mt-1 break-all font-mono text-[10px] text-white/30">
                      ID: {row.page_id}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="text-white/65">{row.adset_name}</p>
                  <p className="mt-1 font-mono text-[10px] text-white/30">
                    {row.adset_id ?? 'sem adset_id'}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-white/65">{row.ad_name}</p>
                  <p className="mt-1 font-mono text-[10px] text-white/30">
                    {row.ad_id ?? 'sem ad_id'} · {row.placement}
                  </p>
                </td>
                <td className="px-4 py-3 text-white/55">{row.source}</td>
                <td className="px-4 py-3">
                  <p className="font-mono text-white">{row.unique_ad_clicks}</p>
                  <p className="mt-1 text-[10px] text-white/30">{row.ad_clicks} totais</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-white">{row.visitors}</p>
                  <p className="mt-1 text-[10px] text-white/30">{row.page_views} pageviews</p>
                </td>
                <td className="px-4 py-3 font-mono text-emerald-200">
                  {percentage(row.visitors, row.unique_ad_clicks)}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-cyan-200">{row.unique_checkouts}</p>
                  <p className="mt-1 text-[10px] text-white/30">{row.checkouts} disparos</p>
                </td>
                <td className="px-4 py-3 font-mono text-cyan-200">
                  {percentage(row.unique_checkouts, row.visitors)}
                </td>
                <td className="px-4 py-3 font-mono text-white">{row.orders}</td>
                <td className="px-4 py-3 font-mono text-emerald-200">{row.paid_orders}</td>
                <td className="px-4 py-3 font-mono text-emerald-300">
                  {money(row.paid_revenue_minor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!attribution.isLoading && !attribution.data?.rows.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-white/35">
          Nenhuma visita, checkout ou venda com atribuição foi encontrada neste dia.
        </p>
      )}
    </div>
  );
}
