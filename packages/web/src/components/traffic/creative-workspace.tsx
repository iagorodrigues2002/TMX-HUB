'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { CreativeDriveState } from '@/lib/creative-drive-store';
import { creativeOffer, creativeStatuses } from '@/lib/creative-identity';
import { creativeDrivePath, creativeWorkspaceEnabled } from '@/lib/creative-workspace-release';
import type { DateRange } from '@/lib/date-range';
import { usePrivacy } from '@/lib/privacy-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  FileVideo,
  Folder,
  FolderOpen,
  LayoutGrid,
  Link2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  type CreativeMetricKey,
  type CreativeRecord,
  creativeAdsFromMeta,
  creativeCatalogRows,
  creativeColumns,
  creativeMetrics,
} from './creative-workspace-model';
import styles from './creative-workspace.module.css';
import { groupTrafficAttribution, summarizeCreativeAttribution } from './traffic-attribution-model';
import type { LiveTraffic } from './use-live-traffic';
import { useTrafficAttribution } from './use-traffic-attribution';

const statusTones = new Map([
  ['Stand by', 'white'],
  ['Testando', 'yellow'],
  ['Em teste', 'yellow'],
  ['Validado', 'green'],
  ['Não validado', 'red'],
]);
const emptyMetadata: CreativeDriveState['metadata'] = {};
const countFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const creativeTmxColumns = [
  ['upsells', 'Upsells totais · TMX', 'count'],
  ['tmxGross', 'Faturamento bruto · TMX', 'money'],
  ['funnelArpu', 'ARPU do funil · TMX', 'money'],
  ['tmxCreativeRoas', 'ROAS TMX', 'ratio'],
] as const;
const tableColumns = creativeWorkspaceEnabled
  ? [...creativeColumns.slice(0, 4), ...creativeTmxColumns, ...creativeColumns.slice(4)]
  : creativeColumns;
type CreativeColumnKey = (typeof tableColumns)[number][0];

function displayedStatus(row: CreativeRecord, metadata: CreativeDriveState['metadata'], complete: boolean) {
  const saved = metadata[row.id]?.status;
  return saved === undefined && complete && row.files.length && !row.adIds.length ? 'Stand by' : saved;
}

function Choice({
  label,
  value,
  change,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  const isStatusChoice = options.some((option) => statusTones.has(option));
  return (
    <Select value={value} onValueChange={change} disabled={disabled}>
      <SelectTrigger
        aria-label={label}
        className={isStatusChoice ? styles.testStatusTrigger : undefined}
        data-tone={statusTones.get(value)}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const tone = statusTones.get(option);
          const optionLabel =
            (
              {
                spend: 'Maior investimento',
                frontSales: 'Mais vendas',
                cpa: 'Menor CPA',
                metaRoas: 'Maior ROAS',
                BRL: 'Real · R$',
                USD: 'Dólar · US$',
              } as Record<string, string>
            )[option] ?? option;
          return (
            <SelectItem
              key={option}
              value={option}
              className={isStatusChoice ? styles.testStatusOption : undefined}
              data-tone={tone}
            >
              {isStatusChoice ? (
                <span className={styles.testStatusLabel}>{optionLabel}</span>
              ) : (
                optionLabel
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function LowRoasWarning() {
  return (
    <span
      className={styles.lowRoasWarning}
      title="Campanha ativa com pelo menos R$ 1.500 de gasto e ROAS Meta abaixo de 1,40x"
    >
      <AlertTriangle size={13} aria-hidden="true" />
      ROAS baixo · ativa
    </span>
  );
}
function CreativeThumb({ item, mini = false }: { item: CreativeRecord; mini?: boolean }) {
  const [failed, setFailed] = useState('');
  const image = item.principal?.thumbnail;
  return (
    <span className={styles.thumb + (mini ? ' ' + styles.miniThumb : '')} aria-hidden="true">
      {image && failed !== image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(image)}
        />
      ) : (
        <>
          <FileVideo />
          <span>{item.name.match(/AD\d+/i)?.[0] ?? 'AD'}</span>
        </>
      )}
    </span>
  );
}
const linkLabel = (row: CreativeRecord) =>
  row.principal
    ? 'Abrir no Drive'
    : row.files.length > 1
      ? 'Escolher arquivo principal'
      : 'Vínculo pendente';

export function CreativeWorkspace({
  live,
  range,
  currency,
  setCurrency,
  offer,
  selectOffer,
}: {
  live: LiveTraffic;
  range: DateRange;
  currency: 'BRL' | 'USD';
  setCurrency: (v: 'BRL' | 'USD') => void;
  offer: string;
  selectOffer: (v: string) => void;
}) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const client = useQueryClient();
  const queryKey = ['creative-drive-local', user?.id];
  const drive = useQuery({
    queryKey,
    queryFn: () => request<CreativeDriveState>(creativeDrivePath),
    enabled: !!user,
    refetchInterval: 5000,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      request<CreativeDriveState>(creativeDrivePath, { method: 'POST', body }),
    onSuccess: (state) => client.setQueryData(queryKey, state),
  });
  const [configuring, setConfiguring] = useState(false);
  const [rootUrl, setRootUrl] = useState('');
  const [batch, setBatch] = useState('Todas as levas');
  const [status, setStatus] = useState('Todos os status');
  const [onlyLowRoas, setOnlyLowRoas] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CreativeMetricKey>('spend');
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState<CreativeColumnKey[]>(() => [
    ...creativeColumns.map((column) => column[0]),
    ...(creativeWorkspaceEnabled ? creativeTmxColumns.map((column) => column[0]) : []),
  ]);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [detailId, setDetailId] = useState<string | null>(null);
  const complete =
    !!live.data.data && live.data.data.from <= range.from && live.data.data.to >= range.to;
  const classificationScope = [
    'creative-auto-classification',
    user?.id,
    live.personal,
    live.connection.data?.id,
  ];
  const lastClassificationKey = [...classificationScope, 'last-success'];
  const { data: lastClassification } = useQuery<{ lowRoas: string[] }>({
    queryKey: lastClassificationKey,
    enabled: false,
  });
  const autoClassification = useQuery({
    queryKey: [
      ...classificationScope,
      live.data.data?.fetchedAt,
      range.to,
      drive.data?.checkedAt,
      live.mappings,
    ],
    enabled: complete && drive.isSuccess,
    staleTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }) => {
      const result = await request<{ lowRoas: string[] }>(creativeDrivePath, {
        method: 'POST',
        body: { action: 'classify', personal: live.personal, mappings: live.mappings },
        signal,
      });
      await client.invalidateQueries({ queryKey });
      if (!signal.aborted) client.setQueryData(lastClassificationKey, result);
      return result;
    },
  });
  const ads = useMemo(
    () =>
      complete && live.data.data
        ? creativeAdsFromMeta(live.data.data, range, currency, live.mappings)
        : [],
    [complete, live.data.data, range.from, range.to, currency, live.mappings],
  );
  const records = useMemo(
    () =>
      creativeCatalogRows(
        ads,
        drive.data?.catalog ?? null,
        drive.data?.metadata,
        drive.data?.reviewedAds,
      ),
    [ads, drive.data?.catalog, drive.data?.metadata, drive.data?.reviewedAds],
  );
  const code = offer ? creativeOffer(offer) : '';
  const attribution = useTrafficAttribution(range, creativeWorkspaceEnabled && !!code && complete);
  const meta = live.data.data;
  const attributionByAd = useMemo(
    () => meta && attribution.data
      ? groupTrafficAttribution(meta, attribution.data, 'ads').groups
      : new Map(),
    [meta, attribution.data],
  );
  const offers = [
    ...new Set([
      ...(drive.data?.catalog?.offers.map((o) => o.code) ?? []),
      ...records.map((r) => r.offer),
    ]),
  ].sort();
  const metadata = drive.data?.metadata ?? emptyMetadata;
  const classification = autoClassification.data ?? lastClassification;
  const lowRoas = useMemo(() => new Set(classification?.lowRoas), [classification]);
  const reportedAds = live.data.data?.ads;
  const activeAdIds = useMemo(
    () => new Set(reportedAds?.filter((ad) => ad.status === 'ACTIVE').map((ad) => ad.id)),
    [reportedAds],
  );
  const search = query.trim().toLocaleLowerCase('pt-BR');
  const offerRows = useMemo(() => records.filter((r) => !code || r.offer === code), [records, code]);
  const batches = [...new Set(offerRows.map((r) => r.batch))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true }),
  );
  const metricsById = useMemo(
    () => new Map(offerRows.map((row) => {
      const metrics = creativeMetrics([row]);
      return [row.id, {
        ...metrics,
        ...summarizeCreativeAttribution([row], attributionByAd, currency, metrics),
      }];
    })),
    [offerRows, attributionByAd, currency],
  );
  const rows = useMemo(
    () =>
      offerRows
        .filter(
          (r) =>
            (!onlyLowRoas || lowRoas.has(r.id)) &&
            (!onlyActive || r.adIds.some((id) => activeAdIds.has(id))) &&
            (batch === 'Todas as levas' || r.batch === batch) &&
            (status === 'Todos os status' || displayedStatus(r, metadata, complete) === status) &&
            (!search ||
              (r.offer + ' ' + r.name + ' ' + r.files.map((f) => f.name).join(' '))
                .toLocaleLowerCase('pt-BR')
                .includes(search)),
        )
        .sort((a, b) => {
          const av = metricsById.get(a.id)![sort];
          const bv = metricsById.get(b.id)![sort];
          return av === bv
            ? a.name.localeCompare(b.name, 'pt-BR', { numeric: true })
            : av === null
              ? 1
              : bv === null
                ? -1
                : sort === 'cpa'
                  ? av - bv
                  : bv - av;
        }),
    [offerRows, onlyLowRoas, lowRoas, onlyActive, activeAdIds, batch, status, metadata, complete, search, metricsById, sort],
  );
  const totals = useMemo(() => {
    const delivered = rows.filter((row) => row.adIds.length);
    const metrics = creativeMetrics(delivered);
    return {
      ...metrics,
      ...summarizeCreativeAttribution(delivered, attributionByAd, currency, metrics),
    };
  }, [rows, attributionByAd, currency]);
  const countedRows = onlyLowRoas || onlyActive ? rows : offerRows;
  const paginationKey = JSON.stringify([code, batch, status, query, sort, onlyLowRoas, onlyActive]);
  const page =
    pagination.key === paginationKey
      ? Math.min(pagination.page, Math.max(1, Math.ceil(rows.length / 25)))
      : 1;
  const detail = records.find((r) => r.id === detailId);
  const pending = !!drive.data?.rootUrl && drive.data.checkedAt < drive.data.requestedAt;
  const refreshingMeta = Boolean(
    live.data.isFetching ||
      live.refresh.isPending ||
      live.connection.data?.busy ||
      live.status.data?.busy,
  );
  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }),
    [currency],
  );
  const format = (value: number | null, kind: string) =>
    value === null || !complete
      ? '—'
      : isPrivate && kind === 'money'
        ? '••••'
        : kind === 'money'
          ? moneyFormatter.format(value)
          : kind === 'ratio'
            ? value.toFixed(2).replace('.', ',') + 'x'
            : kind === 'percent'
              ? (value * 100).toFixed(1).replace('.', ',') + '%'
              : countFormatter.format(value);
  const date = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('pt-BR');
  function openOffer(value: string) {
    selectOffer(value);
    setBatch('Todas as levas');
    setStatus('Todos os status');
    setQuery('');
    setOnlyLowRoas(false);
    setOnlyActive(false);
  }
  function changeStatus(row: CreativeRecord, value: string) {
    mutation.mutate({
      action: 'metadata',
      key: row.id,
      status: value === 'Sem classificação' ? null : value,
    });
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <div className={styles.kicker}>
            <Clapperboard size={14} /> Criativos & desempenho
          </div>
          <h2>Ads Intelligence</h2>
          <p>Criativos organizados por oferta e leva.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.sourceBadge}>Meta · System User</span>
          <Button
            variant="outline"
            onClick={() => {
              setRootUrl(drive.data?.rootUrl ?? '');
              setConfiguring(true);
            }}
          >
            <Link2 /> {drive.data?.rootUrl ? 'Drive conectado' : 'Conectar Drive'}
          </Button>
        </div>
      </header>
      <section className={styles.filters} aria-label="Dados acumulados dos criativos">
        <div className={styles.filterRow}>
          <div className={styles.lifetime}>
            <small>Período total</small>
            <strong>
              {date(range.from)} — {date(range.to)}
            </strong>
          </div>
          <Choice
            label="Oferta do Ads Intelligence"
            value={code || 'Todas as ofertas'}
            change={(v) => openOffer(v === 'Todas as ofertas' ? '' : v)}
            options={['Todas as ofertas', ...offers]}
          />
          <Choice
            label="Moeda do Ads Intelligence"
            value={currency}
            change={(v) => setCurrency(v as 'BRL' | 'USD')}
            options={['BRL', 'USD']}
          />
          <div className={styles.sourceNote}>
            {complete && live.data.data
              ? 'Meta · ' + new Date(live.data.data.fetchedAt).toLocaleString('pt-BR')
              : 'Histórico completo aguardando consulta'}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={
              live.refresh.isPending || live.connection.data?.busy || live.status.data?.busy
            }
            onClick={() => live.refresh.mutate()}
          >
            <RefreshCw size={14} className={styles.refreshIcon} data-refreshing={refreshingMeta} />
            Atualizar Meta
          </Button>
        </div>
      </section>
      {!complete && (
        <div role="status" className={styles.notice}>
          Aguardando os dados da Meta desde agosto. Métricas parciais não entram no acumulado.
          {live.data.error ? ' ' + live.data.error.message : ''}
        </div>
      )}
      {complete && live.data.isError && (
        <p role="status" className={styles.notice}>
          Exibindo a última consulta completa. {live.data.error.message}
        </p>
      )}
      {drive.isError && (
        <p role="alert" className={styles.error}>
          Não foi possível carregar o catálogo do Drive.
        </p>
      )}
      {drive.data?.error && (
        <p role="alert" className={styles.error}>
          {drive.data.error} Último catálogo completo mantido.
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className={styles.error}>
          {mutation.error.message}
        </p>
      )}
      {autoClassification.isError && (
        <p role="alert" className={styles.error}>
          {autoClassification.error.message}
          {lastClassification && ' Exibindo os últimos alertas disponíveis.'}
        </p>
      )}
      {pending && (
        <p role="status" className={styles.notice}>
          Importando pastas e levas do Drive…
        </p>
      )}
      <div className={styles.path} aria-label="Localização nos criativos">
        <button type="button" onClick={() => openOffer('')}>
          <LayoutGrid size={15} /> Ofertas
        </button>
        {code && (
          <>
            <ChevronRight size={14} />
            <span>{code}</span>
          </>
        )}
        <span className={styles.pathCount}>
          {code
            ? countedRows.length +
              ' criativos · ' +
              countedRows.reduce((n, r) => n + r.adIds.length, 0) +
              ' anúncios vinculados'
            : offers.length + ' ofertas'}
        </span>
      </div>
      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor="creative-search">
          <Search size={16} />
          <Input
            id="creative-search"
            placeholder={code ? 'Buscar criativo…' : 'Buscar oferta ou criativo…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {code && (
          <>
            <Choice
              label="Filtrar leva"
              value={batch}
              change={setBatch}
              options={['Todas as levas', ...batches]}
            />
            <Choice
              label="Filtrar status"
              value={status}
              change={setStatus}
              options={['Todos os status', ...creativeStatuses]}
            />
            <Button
              type="button"
              variant={onlyLowRoas ? 'default' : 'outline'}
              className={styles.filterToggle}
              aria-pressed={onlyLowRoas}
              onClick={() => setOnlyLowRoas((selected) => !selected)}
            >
              {onlyLowRoas ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              ROAS baixo
            </Button>
            <Button
              type="button"
              variant={onlyActive ? 'default' : 'outline'}
              className={styles.filterToggle}
              aria-pressed={onlyActive}
              onClick={() => setOnlyActive((selected) => !selected)}
            >
              {onlyActive ? <Check aria-hidden="true" /> : <Activity aria-hidden="true" />}
              Ads ativos
            </Button>
          </>
        )}
      </div>
      {!code ? (
        <section className={styles.folderGrid} aria-label="Pastas das ofertas">
          {offers
            .filter(
              (o) =>
                !search ||
                o.toLocaleLowerCase('pt-BR').includes(search) ||
                rows.some((r) => r.offer === o),
            )
            .map((o) => {
              const items = records.filter((r) => r.offer === o),
                m = creativeMetrics(items.filter((r) => r.adIds.length));
              return (
                <button
                  type="button"
                  key={o}
                  className={styles.folderCard}
                  onClick={() => openOffer(o)}
                  aria-label={'Abrir oferta ' + o}
                >
                  <span className={styles.folderTab} aria-hidden="true" />
                  <span className={styles.folderTop}>
                    <FolderOpen size={29} />
                    <span>
                      {
                        new Set(items.filter((r) => r.batch !== 'Sem leva').map((r) => r.batch))
                          .size
                      }{' '}
                      levas
                    </span>
                    <ArrowUpRight size={17} />
                  </span>
                  <span className={styles.folderTitle}>{o}</span>
                  <span className={styles.folderSubtitle}>
                    {items.length} criativos <span>·</span>{' '}
                    {items.reduce((n, r) => n + r.files.length, 0)} arquivos
                  </span>
                  <span className={styles.filmstrip}>
                    {items.slice(0, 3).map((item) => (
                      <CreativeThumb key={item.id} item={item} mini />
                    ))}
                    <span className={styles.moreCreatives}>+{Math.max(0, items.length - 3)}</span>
                  </span>
                  <span className={styles.folderMetrics}>
                    <span>
                      <small>Investimento</small>
                      <strong>{format(m.spend, 'money')}</strong>
                    </span>
                    <span>
                      <small>Vendas · Meta</small>
                      <strong>{format(m.frontSales, 'count')}</strong>
                    </span>
                    <span>
                      <small>ROAS Meta</small>
                      <strong>{format(m.metaRoas, 'ratio')}</strong>
                    </span>
                  </span>
                  <span className={styles.folderFoot}>
                    <Folder size={12} />
                    {drive.data?.catalog?.offers.some((f) => f.code === o)
                      ? 'Pasta importada do Drive'
                      : 'Sem pasta no Drive'}
                    <ChevronRight size={13} />
                  </span>
                </button>
              );
            })}
        </section>
      ) : (
        <>
          <div key={code} className={styles.offerSummary}>
            <Button variant="ghost" size="sm" onClick={() => openOffer('')}>
              <ArrowLeft /> Ofertas
            </Button>
            {(
              [
                ['Investimento', totals.spend, 'money'],
                ['Vendas · Meta', totals.frontSales, 'count'],
                ['CPA', totals.cpa, 'money'],
                ['ROAS Meta', totals.metaRoas, 'ratio'],
              ] as const
            ).map(([title, value, kind]) => (
              <div key={title}>
                <small>{title}</small>
                <strong>{format(value, kind)}</strong>
              </div>
            ))}
            {drive.data?.catalog?.offers.find((o) => o.code === code) && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={drive.data.catalog.offers.find((o) => o.code === code)!.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink /> Abrir pasta
                </a>
              </Button>
            )}
          </div>
          <div className={styles.tableTools}>
            <span className={styles.sourceBadge}>Uma linha por criativo</span>
            {creativeWorkspaceEnabled && !attribution.data && complete && (
              <output className={styles.sourceBadge}>
                {attribution.isError ? 'Atribuição TMX indisponível' : 'Consultando atribuição TMX…'}
              </output>
            )}
            <Choice
              label="Ordenar criativos"
              value={sort}
              change={(v) => setSort(v as CreativeMetricKey)}
              options={['spend', 'frontSales', 'cpa', 'metaRoas']}
            />
            <Button
              size="sm"
              variant="outline"
              aria-expanded={showColumns}
              onClick={() => setShowColumns((v) => !v)}
            >
              <SlidersHorizontal /> Colunas
            </Button>
          </div>
          {showColumns && (
            <div className={styles.columnPicker} aria-label="Colunas da tabela">
              {tableColumns.map(([key, title]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={columns.includes(key)}
                    onChange={(e) =>
                      setColumns((v) =>
                        e.target.checked ? [...v, key] : v.filter((k) => k !== key),
                      )
                    }
                  />
                  {title}
                </label>
              ))}
            </div>
          )}
          <section
            className={styles.tableScroll}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus this horizontal scroll region.
            tabIndex={0}
            aria-label="Desempenho dos criativos; role horizontalmente para ver todas as métricas"
          >
            <table className={styles.table}>
              <caption className="sr-only">{code} · Criativos consolidados desde agosto</caption>
              <thead>
                <tr>
                  <th scope="col">Criativo</th>
                  <th scope="col">Leva</th>
                  <th scope="col">Status do teste</th>
                  {tableColumns
                    .filter((c) => columns.includes(c[0]))
                    .map(([key, title]) => (
                      <th
                        scope="col"
                        key={key}
                        title={key === 'tmxCreativeRoas'
                          ? '(Valor das compras da Meta + receita bruta dos upsells vinculados no TMX) ÷ investimento'
                          : undefined}
                      >
                        {title}
                      </th>
                    ))}
                  <th scope="col">Arquivos</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * 25, page * 25).map((row) => {
                  const m = metricsById.get(row.id)!;
                  const activeCount = row.adIds.filter((id) => activeAdIds.has(id)).length;
                  const identity = (
                    <>
                      <CreativeThumb item={row} />
                      <span>
                        <strong>{row.name}</strong>
                        <small>
                          {linkLabel(row)} · {row.adIds.length} anúncios
                          {onlyActive && <> · {activeCount} {activeCount === 1 ? 'ativo' : 'ativos'}</>}
                        </small>
                      </span>
                      {row.principal && <ExternalLink size={13} />}
                    </>
                  );
                  return (
                    <tr key={row.id}>
                      <th scope="row">
                        {row.principal ? (
                          <a
                            className={styles.adIdentity}
                            href={row.principal.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={'Abrir ' + row.name + ' no Google Drive'}
                          >
                            {identity}
                          </a>
                        ) : (
                          <button
                            type="button"
                            className={styles.adIdentity}
                            onClick={() => setDetailId(row.id)}
                          >
                            {identity}
                          </button>
                        )}
                      </th>
                      <td>
                        <span className={styles.batchBadge}>{row.batch}</span>
                      </td>
                      <td>
                        <Choice
                          label={'Status de ' + row.name}
                          value={displayedStatus(row, metadata, complete) ?? 'Sem classificação'}
                          change={(v) => changeStatus(row, v)}
                          options={['Sem classificação', ...creativeStatuses]}
                          disabled={mutation.isPending}
                        />
                        {lowRoas.has(row.id) && <LowRoasWarning />}
                      </td>
                      {tableColumns
                        .filter((c) => columns.includes(c[0]))
                        .map(([key, , kind]) => (
                          <td key={key}>{format(m[key], kind)}</td>
                        ))}
                      <td>
                        <Button variant="ghost" size="sm" onClick={() => setDetailId(row.id)}>
                          {row.files.length} arquivos <ChevronRight size={13} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total dos criativos filtrados</th>
                  <td />
                  <td />
                  {tableColumns
                    .filter((c) => columns.includes(c[0]))
                    .map(([key, , kind]) => (
                      <td key={key}>{format(totals[key], kind)}</td>
                    ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>
          <div className={styles.tableFoot}>
            <span>{rows.length} criativos · índices recalculados sobre os totais</span>
            <div className={styles.pagination}>
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 1}
                onClick={() => setPagination({ key: paginationKey, page: page - 1 })}
              >
                Anterior
              </Button>
              {page} / {Math.max(1, Math.ceil(rows.length / 25))}
              <Button
                variant="ghost"
                size="sm"
                disabled={page * 25 >= rows.length}
                onClick={() => setPagination({ key: paginationKey, page: page + 1 })}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
      {(!offers.length || (code && !rows.length)) && (
        <div className={styles.empty}>
          <FolderOpen />
          <strong>
            {onlyLowRoas && !classification
              ? autoClassification.isError || live.data.isError
                ? 'Alertas indisponíveis'
                : 'Aguardando alertas da Meta'
              : onlyActive && !live.data.data?.ads
                ? 'Status dos anúncios indisponível'
                : 'Nenhum criativo nesta seleção'}
          </strong>
          <p>
            {drive.data?.rootUrl
              ? 'Aguarde a leitura ou ajuste os filtros.'
              : 'Conecte a pasta principal compartilhada do Google Drive.'}
          </p>
        </div>
      )}
      <p className={styles.matchRule}>
        {drive.data?.catalog &&
          'Drive · pasta compartilhada · ' +
            drive.data.catalog.files.length +
            ' vídeos · atualizado em ' +
            new Date(drive.data.catalog.at).toLocaleString('pt-BR') +
            ' · sincronização a cada 10 minutos.'}
      </p>
      <Dialog open={configuring} onOpenChange={setConfiguring}>
        <DialogContent className={styles.driveDialog}>
          <DialogHeader>
            <DialogTitle>Importar pastas do Drive</DialogTitle>
            <DialogDescription>
              Leitura da pasta compartilhada. As subpastas identificam ofertas e levas; nenhum
              arquivo é alterado.
            </DialogDescription>
          </DialogHeader>
          <label className={styles.formField}>
            Pasta principal
            <Input
              aria-label="Link da pasta principal do Drive"
              value={rootUrl}
              onChange={(e) => setRootUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </label>
          <p className={styles.matchRule}>
            Oferta + AD + leva identificam o criativo. Creative, criative e reedito ficam como
            variações do mesmo criativo. Pastas privadas exigem conexão autenticada.
          </p>
          {mutation.isError && (
            <p className={styles.error} role="alert">
              {mutation.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfiguring(false)}>
              Fechar
            </Button>
            <Button
              disabled={mutation.isPending || !rootUrl.trim()}
              onClick={() =>
                mutation.mutate(
                  { action: 'configure', rootUrl: rootUrl.trim() },
                  { onSuccess: () => setConfiguring(false) },
                )
              }
            >
              Salvar e importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className={styles.driveDialog}>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              Escolha o arquivo principal para abrir o criativo no Drive.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <div className={styles.detailHero}>
                <CreativeThumb item={detail} />
                <div>
                  <p>
                    {detail.batch} · {detail.files.length} arquivos · {detail.adIds.length} anúncios
                    vinculados
                  </p>
                  <Choice
                    label={'Editar status de ' + detail.name}
                    value={displayedStatus(detail, metadata, complete) ?? 'Sem classificação'}
                    change={(v) => changeStatus(detail, v)}
                    options={['Sem classificação', ...creativeStatuses]}
                    disabled={mutation.isPending}
                  />
                  {lowRoas.has(detail.id) && <LowRoasWarning />}
                </div>
              </div>
              <div className={styles.files}>
                {detail.files.map((file) => (
                  <div className={styles.fileEditor} key={file.id}>
                    <FileVideo />
                    <div>
                      <strong>{file.name}</strong>
                      <a href={file.url} target="_blank" rel="noopener noreferrer">
                        Abrir arquivo <ExternalLink size={12} />
                      </a>
                    </div>
                    <Button
                      variant={detail.principal?.id === file.id ? 'default' : 'outline'}
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          action: 'metadata',
                          key: detail.id,
                          principalId: file.id,
                        })
                      }
                    >
                      {detail.principal?.id === file.id ? 'Principal' : 'Usar principal'}
                    </Button>
                  </div>
                ))}
              </div>
              {!detail.files.length && (
                <p className={styles.notice}>
                  Não há arquivo com oferta, AD e leva compatíveis no catálogo do Drive.
                </p>
              )}
              {detail.sources.length > 0 && (
                <details className={styles.matchRule}>
                  <summary>Origem dos dados da Meta</summary>
                  {detail.sources.map((a) => (
                    <p key={a.id}>
                      {a.name} · {a.status} · {a.campaign} · {a.account}
                      {creativeWorkspaceEnabled && (
                        <>
                          {' · Faturamento bruto TMX: '}
                          {format(
                            summarizeCreativeAttribution([a], attributionByAd, currency, a.amounts)
                              .tmxGross,
                            'money',
                          )}
                        </>
                      )}
                    </p>
                  ))}
                </details>
              )}
              {mutation.isError && (
                <p className={styles.error} role="alert">
                  {mutation.error.message}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
