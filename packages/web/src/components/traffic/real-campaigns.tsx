'use client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DateRange } from '@/lib/date-range';
import { supportsIntradayRange } from '@/lib/intraday-range';
import { usePrivacy } from '@/lib/privacy-context';
import { Search } from 'lucide-react';
import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import {
  type RealCampaignSnapshot,
  campaignOffer,
  nativeTrafficFinance,
  realCampaignRows,
  tmxGeneralRoas,
  trafficTotals,
} from './real-campaigns-model';
import { attributeTrafficRows, tmxAttributionColumns } from './traffic-attribution-model';
import { MetricColumnPicker, type MetricFormat, MetricsTable } from './traffic-metrics-table';
import type { TrafficTab } from './traffic-model';
import styles from './traffic-preview.module.css';
import {
  type ReportMetricKey,
  type ReportRow,
  reportColumns,
  reportMetrics,
} from './traffic-reports-model';
import { Panel } from './traffic-ui';
import type { LiveTraffic } from './use-live-traffic';
import { useTrafficAttribution } from './use-traffic-attribution';

export interface TrafficFilters {
  currency: 'BRL' | 'USD';
  offer: string;
  account: string;
  business: string;
  status: string;
  query: string;
}
const defaultColumns: ReportMetricKey[] = [
  'spend',
  'frontSales',
  'cpa',
  'checkouts',
  'costCheckout',
  'connectRate',
  'metaGrossRoi',
  'cpm',
  'cpc',
  'hookRate',
  'metaRoas',
];

export function RealCampaigns({
  range,
  view,
  live,
  filters,
  setFilters,
  codes,
}: {
  range: DateRange;
  view: TrafficTab;
  live: LiveTraffic;
  filters: TrafficFilters;
  setFilters: Dispatch<SetStateAction<TrafficFilters>>;
  codes: string[];
}) {
  const { isPrivate } = usePrivacy();
  const [columns, setColumns] = useState<ReportMetricKey[]>(defaultColumns);
  const [reportMode, setReportMode] = useState<'meta' | 'tmx'>('meta');
  const attribution = useTrafficAttribution(
    range,
    reportMode === 'tmx' && ['overview', 'campaigns'].includes(view),
  );
  function changeReportMode(mode: 'meta' | 'tmx') {
    setReportMode(mode);
    setColumns((current) => {
      const base = current.filter(
        (key) => !tmxAttributionColumns.includes(key as (typeof tmxAttributionColumns)[number]),
      );
      return mode === 'tmx'
        ? [...base.slice(0, 5), ...tmxAttributionColumns, ...base.slice(5)]
        : base;
    });
  }
  const [level, setLevel] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [newOffer, setNewOffer] = useState('');
  const [left, setLeft] = useState(4);
  const [right, setRight] = useState(5);
  const [windowView, setWindowView] = useState('overview');
  const [comparisonCampaign, setComparisonCampaign] = useState('');
  const format: MetricFormat = (value, kind) =>
    isPrivate
      ? '••••'
      : value === null || !Number.isFinite(value)
        ? '—'
        : kind === 'money'
          ? value.toLocaleString('pt-BR', { style: 'currency', currency: filters.currency })
          : kind === 'percent'
            ? value.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 2 })
            : `${value.toLocaleString('pt-BR', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 })}${kind === 'ratio' ? '×' : ''}`;
  const data = live.data.data;
  const scope = useMemo(
    () => ({ ...filters, mappings: live.mappings, deliveryOnly: true }),
    [filters, live.mappings],
  );
  const campaignRows = useMemo(
    () => (data ? realCampaignRows(data, range, { ...scope, level: 'campaigns' }) : []),
    [data, range, scope],
  );
  const rows = useMemo(
    () =>
      level === 'campaigns'
        ? campaignRows
        : data
          ? realCampaignRows(data, range, { ...scope, level })
          : [],
    [data, range, scope, level, campaignRows],
  );
  const totals = useMemo(() => trafficTotals(campaignRows), [campaignRows]);
  const attributedCampaigns = useMemo(
    () =>
      data
        ? attributeTrafficRows(campaignRows, data, attribution.data, filters.currency)
        : { rows: campaignRows, unmatchedUpsells: 0 },
    [data, campaignRows, attribution.data, filters.currency],
  );
  const attributedRows = useMemo(
    () =>
      data
        ? attributeTrafficRows(rows, data, attribution.data, filters.currency, level).rows
        : rows,
    [data, rows, attribution.data, filters.currency, level],
  );
  const metaColumns = columns.filter(
    (key) => !tmxAttributionColumns.includes(key as (typeof tmxAttributionColumns)[number]),
  );
  if (!data)
    return (
      <Panel title="Dados do tráfego">
        <output className={styles.subtle}>
          {live.data.isPending
            ? 'Carregando dados reais…'
            : 'Consulta indisponível. Nenhum valor demonstrativo foi utilizado.'}
        </output>
      </Panel>
    );
  const missingSummaryKeys = new Set(campaignRows.flatMap((row) => row.missingMetrics ?? []));
  const comparisonId =
    view === 'windows' && campaignRows.some((row) => row.id === comparisonCampaign)
      ? comparisonCampaign
      : '';
  const scopedCampaignIds = new Set(
    campaignRows.filter((row) => !comparisonId || row.id === comparisonId).map((row) => row.id),
  );
  const scopedAdIds = new Set(
    data.insights
      .filter(
        (row) =>
          scopedCampaignIds.has(row.campaignId) &&
          row.date >= range.from &&
          row.date <= range.to &&
          Number(row.spend) > 0,
      )
      .map((row) => row.adId),
  );
  const scopedAds = data.ads?.filter((ad) => scopedAdIds.has(ad.id)) ?? [];
  const incomplete =
    campaignRows.some((row) => row.unavailable) || range.from < data.from || range.to > data.to;
  const noNarrowScope =
    !comparisonId && !filters.account && !filters.business && !filters.status && !filters.query;
  const general = noNarrowScope
    ? nativeTrafficFinance(
        live.general.data?.offers,
        live.userId,
        filters.offer,
        live.links,
        filters.currency,
        live.finance.data?.authorizedOffers === true,
      )
    : null;
  const selectedCampaign = selected
    ? data.campaigns.find((c) => c.id === selected.id) ||
      data.campaigns.find((c) =>
        data.insights.some(
          (row) =>
            row.campaignId === c.id && (row.adId === selected.id || row.adsetId === selected.id),
        ),
      )
    : undefined;
  const businesses = [
    ...new Map(
      data.accounts
        .filter((account) => account.businessId)
        .map((account) => [account.businessId!, account.businessName ?? account.businessId!]),
    ).entries(),
  ];
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const daily = (snapshot = data) =>
    [
      ...new Set(
        snapshot.insights
          .filter((row) => row.date >= range.from && row.date <= range.to)
          .map((row) => row.date),
      ),
    ]
      .sort()
      .flatMap((date) => {
        const group = realCampaignRows(
          {
            ...snapshot,
            campaigns: snapshot.campaigns.filter((c) => !comparisonId || c.id === comparisonId),
            insights: snapshot.insights.filter((row) => row.date === date),
          },
          range,
          { ...scope, level: 'campaigns' },
        );
        return group.length
          ? [
              {
                id: date,
                name: date.split('-').reverse().join('/'),
                subtitle: 'Meta · dia da conta',
                metrics: trafficTotals(group),
                unavailable: group.some((row) => row.unavailable),
                missingMetrics: [...new Set(group.flatMap((row) => row.missingMetrics ?? []))],
              },
            ]
          : [];
      });
  const windowRows = (index: number, adLevel = false) =>
    realCampaignRows(
      {
        ...data,
        campaigns: data.campaigns.filter((campaign) => scopedCampaignIds.has(campaign.id)),
        insights: (data.hourly ?? []).filter(
          (row) => row.hour !== undefined && Math.floor(row.hour / 2) === index,
        ),
      },
      range,
      { ...scope, level: adLevel ? 'ads' : 'campaigns', includeAttributedZeroSpend: true },
    );
  const hours = (index: number) =>
    `${String(index * 2).padStart(2, '0')}:00–${String(index * 2 + 2).padStart(2, '0')}:00`;
  const hourlyAvailable =
    !incomplete &&
    !!data.hourly &&
    !(data.hourlyFailures ?? []).some((id) =>
      data.campaigns.some((c) => scopedCampaignIds.has(c.id) && c.accountId === id),
    ) &&
    supportsIntradayRange(range);
  const a = view === 'windows' ? windowRows(left, windowView === 'ads') : [];
  const b = view === 'windows' ? windowRows(right, windowView === 'ads') : [];
  const am = trafficTotals(a);
  const bm = trafficTotals(b);
  const aAvailable = a.length > 0 && !a.some((row) => row.unavailable);
  const bAvailable = b.length > 0 && !b.some((row) => row.unavailable);
  return (
    <div className={styles.pageStack}>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>
            Meta + TMX ·{' '}
            {filters.offer === '__unclassified'
              ? 'Não classificado'
              : filters.offer || 'Todas as ofertas'}
          </p>
          <h2>
            {view === 'overview'
              ? 'Visão geral do tráfego'
              : view === 'windows'
                ? 'Janelas e comparações'
                : 'Campanhas e anúncios'}
          </h2>
          <p>
            {data.campaigns.length} campanhas com gasto na consulta · dados em{' '}
            {new Date(data.fetchedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <span className={styles.localBadge}>Todas as moedas → {filters.currency}</span>
      </div>
      {(live.status.data?.busy || live.refresh.isPending) && (
        <output className={styles.subtle}>Atualizando dados…</output>
      )}
      {(live.status.data?.error || live.refresh.isError) && (
        <p className={styles.warning}>
          {live.status.data?.error || 'Não foi possível atualizar. Dados anteriores preservados.'}
        </p>
      )}
      {incomplete && (
        <p className={styles.warning}>
          {live.status.data?.blocked
            ? 'Sem resultados Meta para este período: o acesso da integração está bloqueado. Os dados anteriores não são usados para calcular o investimento ou ROI deste período.'
            : 'O período não está totalmente coberto pela consulta atual ou há cotação indisponível. Atualize a Meta; dados ausentes não são gasto zero.'}
        </p>
      )}
      {view !== 'windows' && (
        <div className={styles.toolbar}>
          <div className={styles.segmented} aria-label="Fonte das métricas de campanha">
            <Button
              variant={reportMode === 'meta' ? 'secondary' : 'ghost'}
              aria-pressed={reportMode === 'meta'}
              onClick={() => changeReportMode('meta')}
            >
              Meta
            </Button>
            <Button
              variant={reportMode === 'tmx' ? 'secondary' : 'ghost'}
              aria-pressed={reportMode === 'tmx'}
              onClick={() => changeReportMode('tmx')}
            >
              Atribuição TMX
            </Button>
          </div>
          {reportMode === 'tmx' && (
            <output className={styles.subtle}>
              {attribution.isFetching
                ? 'Consultando atribuição TMX…'
                : attribution.isError
                  ? 'Atribuição indisponível. Dados da Meta preservados.'
                  : 'Cruzamento por IDs e vínculo da compra de entrada. Nenhum evento enviado à Meta.'}
            </output>
          )}
        </div>
      )}
      {reportMode === 'tmx' &&
        view !== 'windows' &&
        !filters.offer &&
        attributedCampaigns.unmatchedUpsells > 0 && (
          <p className={styles.subtle}>
            {attributedCampaigns.unmatchedUpsells} upsells do relatório TMX sem correspondência
            confirmada nas campanhas desta consulta.
          </p>
        )}
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={15} aria-hidden />
          <input
            aria-label="Buscar campanha real"
            value={filters.query}
            placeholder="Nome, ID ou conta"
            onChange={(event) => {
              setFilters({ ...filters, query: event.target.value });
              setPage(0);
            }}
          />
        </label>
        <select
          className={styles.control}
          aria-label="Conta do tráfego"
          value={filters.account}
          onChange={(event) => {
            setFilters({ ...filters, account: event.target.value });
            setPage(0);
          }}
        >
          <option value="">Todas as contas · todas as moedas</option>
          {data.accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
        <select
          className={styles.control}
          aria-label="BM do tráfego"
          value={filters.business}
          onChange={(event) => {
            setFilters({ ...filters, business: event.target.value, account: '' });
            setPage(0);
          }}
        >
          <option value="">Todas as BMs</option>
          {businesses.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          className={styles.control}
          aria-label="Status do tráfego"
          value={filters.status}
          onChange={(event) => {
            setFilters({ ...filters, status: event.target.value });
            setPage(0);
          }}
        >
          <option value="">Todos os status</option>
          {[...new Set(data.campaigns.map((c) => c.effectiveStatus))].sort().map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </div>
      {view !== 'windows' && (
        <>
          <section className={styles.performanceBoard} aria-label="Indicadores reais do tráfego">
            <div className={styles.boardHeading}>
              <strong>Aquisição · {campaignRows.length} campanhas com gasto no recorte</strong>
              <span title="Purchase enviado à Meta">Vendas de front</span>
            </div>
            <div className={styles.metricStrip}>
              {(
                ['spend', 'frontSales', 'cpa', 'checkouts', 'costCheckout', 'metaRoas'] as const
              ).map((key) => {
                const column = reportColumns.find((c) => c.key === key)!;
                return (
                  <div key={key} className={styles.metricCell} title={column.hint}>
                    <span>{column.label}</span>
                    <strong>{format(incomplete ? null : totals[key], column.kind)}</strong>
                  </div>
                );
              })}
            </div>
            <div className={styles.secondaryStrip}>
              {(
                [
                  'cpm',
                  'cpc',
                  'impressions',
                  'clicks',
                  'checkoutConversion',
                  'metaPurchaseValue',
                ] as const
              ).map((key) => {
                const column = reportColumns.find((c) => c.key === key)!;
                return (
                  <div key={key}>
                    <span>{column.label}</span>
                    <strong>
                      {format(
                        incomplete || missingSummaryKeys.has(key) ? null : totals[key],
                        column.kind,
                      )}
                    </strong>
                  </div>
                );
              })}
            </div>
          </section>
          <Panel title="Resultado e retorno">
            <div className={`${styles.metricStrip} ${styles.returnStrip}`}>
              <div
                className={styles.metricCell}
                title="Resultado final da Visão geral, após taxas e reserva."
              >
                <span>Resultado final TMX</span>
                <strong>{format(general?.final ?? null, 'money')}</strong>
              </div>
              <div
                className={styles.metricCell}
                title="Resultado final TMX ÷ investimento em mídia. Consolidado por oferta e período."
              >
                <span>ROAS TMX Geral</span>
                <strong>
                  {format(tmxGeneralRoas(general?.final, totals.spend, incomplete), 'ratio')}
                </strong>
              </div>
              <div
                className={styles.metricCell}
                title="Valor Purchase informado à Meta ÷ investimento."
              >
                <span>ROAS Meta</span>
                <strong>{format(incomplete ? null : totals.metaRoas, 'ratio')}</strong>
              </div>
            </div>
            {live.finance.isError && (
              <p className={styles.warning}>Financeiro indisponível. Tente atualizar.</p>
            )}
            {!noNarrowScope && (
              <p className={styles.subtle}>
                Resultado TMX disponível no total da oferta. Retire os filtros específicos para
                consultar.
              </p>
            )}
          </Panel>
        </>
      )}
      <details className={styles.scopeNote}>
        <summary>Fonte e critérios</summary>
        Câmbio diário: {data.fx?.provider ?? 'indisponível'}. Horários no fuso da conta Meta.
        Resultado TMX após taxas e reserva, sem rateio por campanha. Última leitura:{' '}
        {new Date(data.fetchedAt).toLocaleString('pt-BR')}.
        {live.finance.data &&
          ` Financeiro: ${new Date(live.finance.data.fetchedAt).toLocaleString('pt-BR')}.`}
      </details>
      {view === 'overview' && (
        <Panel
          title="Situação da operação"
          subtitle="Status retornados pela Meta na sincronização."
        >
          <div className={styles.toolbar}>
            <span className={styles.subtle}>{data.accounts.length} contas acessíveis</span>
            <span className={styles.subtle}>
              {scopedAds.filter((ad) => ['DISAPPROVED', 'WITH_ISSUES'].includes(ad.status)).length}{' '}
              anúncios com reprovação ou problemas
            </span>
            <span className={styles.subtle}>{scopedAds.length} anúncios no recorte</span>
          </div>
          {scopedAds.some((ad) => ad.status === 'UNKNOWN') && (
            <p className={styles.warning}>
              Há anúncios sem status disponível nesta consulta. Ausência de status não significa
              aprovação.
            </p>
          )}
          <MetricsTable
            rows={(reportMode === 'tmx' ? attributedCampaigns.rows : campaignRows).slice(0, 5)}
            format={format}
            caption="Campanhas em acompanhamento"
            columns={columns}
            onOpen={setSelected}
          />
        </Panel>
      )}
      {view === 'campaigns' && (
        <Panel
          title="Campanhas, conjuntos e anúncios"
          subtitle="Somente campanhas com gasto no período. Nos anúncios e janelas, conversões atribuídas sem gasto são preservadas para reconciliar o total."
        >
          <div className={styles.toolbar}>
            <div className={styles.segmented}>
              {(
                [
                  ['campaigns', 'Campanhas'],
                  ['adsets', 'Conjuntos'],
                  ['ads', 'Anúncios'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  aria-pressed={level === key}
                  variant={level === key ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setLevel(key);
                    setPage(0);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <MetricColumnPicker
              selected={columns}
              onChange={setColumns}
              allowed={[
                ...defaultColumns,
                ...(reportMode === 'tmx' ? tmxAttributionColumns : []),
                'impressions',
                'clicks',
                'ctr',
                'checkoutConversion',
                'metaPurchaseValue',
                'metaLandingViews',
                'metaLandingConversion',
              ]}
            />
          </div>
          <MetricsTable
            rows={(reportMode === 'tmx' ? attributedRows : rows).slice(
              currentPage * 50,
              currentPage * 50 + 50,
            )}
            format={format}
            caption="Campanhas reais da Meta"
            columns={columns}
            onOpen={setSelected}
          />
          <div className={styles.toolbar}>
            <span className={styles.subtle}>
              {rows.length} itens · página {currentPage + 1} de {pages}
            </span>
            <div className={styles.actions}>
              <Button
                variant="ghost"
                size="sm"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {view === 'windows' && (
        <>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              Campanha para comparação
              <select
                className={styles.control}
                value={comparisonId}
                onChange={(event) => setComparisonCampaign(event.target.value)}
              >
                <option value="">Todas as campanhas</option>
                {campaignRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Panel title="Série diária">
            <MetricsTable
              rows={daily()}
              format={format}
              caption="Série diária"
              columns={metaColumns}
            />
          </Panel>

          <Panel title="Janelas reais da Meta" subtitle="Comparação em faixas de duas horas.">
            {!hourlyAvailable ? (
              <p className={styles.warning}>
                Janelas indisponíveis nesta consulta. Atualize a Meta e selecione até 60 dias;
                falhas horárias não são preenchidas com exemplos.
              </p>
            ) : (
              <>
                <div className={styles.comparisonToolbar}>
                  <div className={styles.segmented}>
                    <Button
                      variant={windowView === 'overview' ? 'secondary' : 'ghost'}
                      onClick={() => setWindowView('overview')}
                    >
                      Visão geral
                    </Button>
                    <Button
                      variant={windowView === 'ads' ? 'secondary' : 'ghost'}
                      onClick={() => setWindowView('ads')}
                    >
                      Por anúncios
                    </Button>
                  </div>
                  <div className={styles.actions}>
                    {[
                      ['A', left, setLeft],
                      ['B', right, setRight],
                    ].map(([label, index, setter]) => (
                      <label className={styles.field} key={String(label)}>
                        Janela {String(label)}
                        <select
                          aria-label={`Janela ${label}`}
                          className={styles.control}
                          value={index as number}
                          onChange={(event) =>
                            (setter as Dispatch<SetStateAction<number>>)(Number(event.target.value))
                          }
                        >
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={hours(i)} value={i}>
                              {hours(i)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.windowTimeline}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const group = windowRows(i);
                    return (
                      <button
                        type="button"
                        key={hours(i)}
                        data-side={i === left ? 'a' : i === right ? 'b' : ''}
                        onClick={() => setRight(i)}
                      >
                        <span>{hours(i)}</span>
                        <strong>
                          {format(
                            group.length && !group.some((row) => row.unavailable)
                              ? trafficTotals(group).spend
                              : null,
                            'money',
                          )}
                        </strong>
                        <small>
                          {i === left ? 'A' : i === right ? 'B' : 'Clique para comparar como B'}
                        </small>
                      </button>
                    );
                  })}
                </div>
                {windowView === 'overview' ? (
                  <div className={styles.tableScroll}>
                    <table className={styles.table}>
                      <caption className="sr-only">Comparação de janelas reais</caption>
                      <thead>
                        <tr>
                          <th>Indicador</th>
                          <th>A · {hours(left)}</th>
                          <th>B · {hours(right)}</th>
                          <th>Diferença B − A</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metaColumns.map((key) => {
                          const column = reportColumns.find((c) => c.key === key)!;
                          return (
                            <tr key={key}>
                              <th scope="row">{column.label}</th>
                              <td>{format(aAvailable ? am[key] : null, column.kind)}</td>
                              <td>{format(bAvailable ? bm[key] : null, column.kind)}</td>
                              <td>
                                {format(
                                  !aAvailable || !bAvailable || am[key] === null || bm[key] === null
                                    ? null
                                    : bm[key]! - am[key]!,
                                  column.kind,
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <h3>A · {hours(left)}</h3>
                    <MetricsTable
                      rows={a}
                      format={format}
                      caption="Anúncios da janela A"
                      columns={metaColumns}
                    />
                    <h3>B · {hours(right)}</h3>
                    <MetricsTable
                      rows={b}
                      format={format}
                      caption="Anúncios da janela B"
                      columns={metaColumns}
                    />
                  </>
                )}
              </>
            )}
          </Panel>
        </>
      )}
      <Panel
        title="Classificação e vínculo das ofertas"
        subtitle="Classificação interna salva neste navegador, por usuário. Nenhum nome é alterado na Meta."
      >
        <details>
          <summary className={styles.textButton}>
            Classificar campanhas e vincular ao resultado TMX
          </summary>
          <div className={styles.toolbar}>
            <label className={styles.field}>
              Criar código de oferta
              <input
                className={styles.control}
                value={newOffer}
                maxLength={80}
                onChange={(event) => setNewOffer(event.target.value.toUpperCase().trim())}
                placeholder="Ex.: CPJRS"
              />
            </label>
            <span className={styles.subtle}>
              Prefixos inequívocos são reconhecidos. O restante fica em Não classificado.
            </span>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Campanha com gasto</th>
                  <th>Oferta</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns
                  .filter((c) => scopedCampaignIds.has(c.id))
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.name}
                        <small>{c.id}</small>
                      </td>
                      <td>
                        <select
                          className={styles.control}
                          aria-label={`Oferta da campanha ${c.id}`}
                          value={
                            Object.hasOwn(live.mappings, c.id) ? live.mappings[c.id] : '__auto'
                          }
                          onChange={(event) =>
                            live.saveClassification('campaigns', c.id, event.target.value)
                          }
                        >
                          <option value="__auto">
                            Automático · {campaignOffer(c.name) || 'Não classificado'}
                          </option>
                          <option value="">Não classificado</option>
                          {[...new Set([...codes, ...(newOffer ? [newOffer] : [])])].map((code) => (
                            <option key={code}>{code}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3>Correspondência com Ofertas do TMX</h3>
          <p className={styles.subtle}>
            Ofertas reais da conta financeira conectada. Vínculos ambíguos não são feitos
            automaticamente.
          </p>
          <div className={styles.formGrid}>
            {codes.map((code) => (
              <label className={styles.field} key={code}>
                {code}
                <select
                  className={styles.control}
                  aria-label={`Vínculo TMX de ${code}`}
                  value={live.links[code] ?? ''}
                  onChange={(event) => live.saveClassification('links', code, event.target.value)}
                >
                  <option value="">Correspondência exata ou não vinculado</option>
                  {live.offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      </Panel>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-5xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>Dados reais da Meta · {selectedCampaign?.name}</DialogDescription>
          </DialogHeader>
          {selected && selectedCampaign && (
            <div className={styles.dialogBody}>
              <label className={styles.field}>
                Oferta da campanha
                <select
                  className={styles.control}
                  value={
                    Object.hasOwn(live.mappings, selectedCampaign.id)
                      ? live.mappings[selectedCampaign.id]
                      : '__auto'
                  }
                  onChange={(event) =>
                    live.saveClassification('campaigns', selectedCampaign.id, event.target.value)
                  }
                >
                  <option value="__auto">
                    Automático · {campaignOffer(selectedCampaign.name) || 'Não classificado'}
                  </option>
                  <option value="">Não classificado</option>
                  {codes.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
              <MetricsTable
                rows={[selected]}
                format={format}
                caption="Resumo do item real"
                columns={metaColumns}
              />
              <h3>Série diária da campanha</h3>
              <MetricsTable
                rows={daily({ ...data, campaigns: [selectedCampaign] })}
                format={format}
                caption="Série diária"
                columns={metaColumns}
              />
              <h3>Anúncios vinculados</h3>
              <MetricsTable
                rows={realCampaignRows({ ...data, campaigns: [selectedCampaign] }, range, {
                  ...scope,
                  level: 'ads',
                })}
                format={format}
                caption="Anúncios vinculados reais"
                columns={metaColumns}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
