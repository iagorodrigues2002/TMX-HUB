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
import { usePrivacy } from '@/lib/privacy-context';
import { ArrowDownToLine, ArrowRight, Search } from 'lucide-react';
import { useState } from 'react';
import { TrafficIntraday } from './traffic-intraday';
import { MetricColumnPicker, type MetricFormat, MetricsTable } from './traffic-metrics-table';
import type { Inventory, TrafficTab } from './traffic-model';
import styles from './traffic-preview.module.css';
import {
  type ReportLevel,
  type ReportMetricKey,
  type ReportRecord,
  type ReportRow,
  defaultTrafficColumns,
  groupReportRows,
  reportColumns,
  reportCoverage,
  reportMetrics,
} from './traffic-reports-model';
import { Panel } from './traffic-ui';

export function TrafficReports({
  view,
  records,
  range,
  inventory,
  navigate,
}: {
  view: TrafficTab;
  records: ReportRecord[];
  range: DateRange;
  inventory: Inventory;
  navigate: (view: TrafficTab) => void;
}) {
  const { isPrivate } = usePrivacy();
  const [level, setLevel] = useState<ReportLevel>('campaigns');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [columns, setColumns] = useState<ReportMetricKey[]>([...defaultTrafficColumns]);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [notice, setNotice] = useState('');
  const format: MetricFormat = (value, kind) => {
    if (isPrivate) return '••••';
    if (!records.length || value === null || !Number.isFinite(value)) return '—';
    if (kind === 'money')
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (kind === 'percent')
      return value.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 2 });
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: kind === 'count' ? 0 : 2 })}${kind === 'ratio' ? '×' : ''}`;
  };
  const totals = reportMetrics(records);
  const daily = groupReportRows(records, 'daily');
  const coverage = reportCoverage(range);
  const filteredRecords = records.filter(
    (row) =>
      (!status || row.ad.status === status) &&
      `${row.ad.name} ${row.ad.id} ${row.ad.campaign} ${row.ad.adset}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.trim().toLocaleLowerCase('pt-BR')),
  );
  const rows = groupReportRows(filteredRecords, level);
  const selectedRecords = selected
    ? records.filter((row) => [row.ad.id, row.ad.campaignId, row.ad.adsetId].includes(selected.id))
    : [];
  const columnFor = (key: ReportMetricKey) => reportColumns.find((column) => column.key === key)!;
  function exportCsv() {
    const visible = reportColumns.filter((column) => columns.includes(column.key));
    const data = [
      ['Nome', 'ID', 'De', 'Até', ...visible.map((column) => column.label)],
      ...rows.map((row) => [
        row.name,
        row.id,
        range.from,
        range.to,
        ...visible.map((column) => format(row.metrics[column.key], column.kind)),
      ]),
    ];
    const csv = `\uFEFF${data
      .map((line) =>
        line
          .map(
            (cell) =>
              `"${String(cell)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(';'),
      )
      .join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tmx-trafego-amostra.csv';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('CSV da amostra exportado com os filtros e a privacidade atuais.');
  }
  return (
    <div className={styles.pageStack}>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>Performance consolidada</p>
          <h2>
            {view === 'overview'
              ? 'Visão geral do tráfego'
              : view === 'campaigns'
                ? 'Campanhas e anúncios'
                : 'Janelas e comparações'}
          </h2>
          <p>
            {view === 'windows'
              ? 'Compare faixas do dia e encontre diferenças por anúncio.'
              : 'Aquisição, conversão e resultado de todas as ofertas no período.'}
          </p>
        </div>
        {view === 'campaigns' && (
          <Button variant="outline" onClick={exportCsv}>
            <ArrowDownToLine size={16} aria-hidden />
            Exportar CSV
          </Button>
        )}
      </div>
      <section className={styles.performanceBoard} aria-label="Indicadores principais">
        <div className={styles.boardHeading}>
          <strong>Eficiência de aquisição</strong>
          <span>Vendas de front rastreadas · amostra</span>
        </div>
        <div className={styles.metricStrip}>
          {defaultTrafficColumns.slice(0, 6).map((key) => {
            const column = columnFor(key);
            return (
              <div
                key={key}
                className={styles.metricCell}
                data-accent={key === 'roi'}
                title={column.hint}
              >
                <span>{column.label}</span>
                <strong>{format(totals[key], column.kind)}</strong>
                <small>
                  {key === 'frontSales'
                    ? 'Sem upsells e order bumps'
                    : key === 'cpa'
                      ? 'Investimento ÷ front'
                      : key === 'roi'
                        ? 'Resultado após mídia ÷ mídia'
                        : key === 'costCheckout'
                          ? 'Investimento ÷ IC'
                          : key === 'checkouts'
                            ? 'Eventos de checkout iniciado'
                            : 'No período selecionado'}
                </small>
              </div>
            );
          })}
        </div>
        <div className={styles.secondaryStrip}>
          {(['finalResult', 'roas', 'cpm', 'cpc', 'hookRate', 'checkoutConversion'] as const).map(
            (key) => {
              const column = columnFor(key);
              return (
                <div key={key} title={column.hint}>
                  <span>{column.label}</span>
                  <strong>{format(totals[key], column.kind)}</strong>
                </div>
              );
            },
          )}
        </div>
      </section>
      <p className={styles.scopeNote}>
        {coverage
          ? `Amostra de ${coverage.from.split('-').reverse().join('/')} a ${coverage.to.split('-').reverse().join('/')}${coverage.partial ? ' · cobertura parcial do período' : ''}.`
          : 'Sem dados demonstrativos neste período.'}{' '}
        Métricas fictícias; a importação de ativos reais não conecta vendas e gastos
        automaticamente.
      </p>
      {view === 'overview' && (
        <>
          <div className={styles.overviewGrid}>
            <Panel
              title="Resultado e investimento"
              subtitle="Evolução diária no período selecionado"
            >
              <ReportChart rows={daily} format={format} privateMode={isPrivate} />
            </Panel>
            <Panel title="Do clique à venda" subtitle="Front rastreado, sem somar os upsells">
              <div className={styles.funnel}>
                {(['impressions', 'clicks', 'pageViews', 'checkouts', 'frontSales'] as const).map(
                  (key, i) => (
                    <div key={key}>
                      <span>
                        <small>0{i + 1}</small>
                        {columnFor(key).label}
                      </span>
                      <strong>{format(totals[key], 'count')}</strong>
                    </div>
                  ),
                )}
              </div>
              <div className={styles.funnelFooter}>
                <span>Conversão de página</span>
                <strong>{format(totals.conversionRate, 'percent')}</strong>
              </div>
            </Panel>
          </div>
          <Panel
            title="Resultado final"
            subtitle="Receita após taxas, devoluções, encargos e retenção da reserva; antes da mídia."
          >
            <div className={styles.financialFlow}>
              {(
                [
                  'revenue',
                  'fees',
                  'refunds',
                  'penalties',
                  'reserve',
                  'finalResult',
                  'spend',
                  'afterMedia',
                ] as const
              ).map((key) => (
                <div key={key} data-final={key === 'finalResult' || key === 'afterMedia'}>
                  <span>{columnFor(key).label}</span>
                  <strong>{format(totals[key], 'money')}</strong>
                </div>
              ))}
            </div>
            <p className={styles.subtle}>
              Reserva é retenção temporária. Resultado após mídia é uma visão de caixa, sem os
              demais custos da operação.
            </p>
          </Panel>
          <Panel
            title="Anúncios em acompanhamento"
            subtitle="Mesma ordem de métricas da análise completa."
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('campaigns')}>
                Ver campanhas
                <ArrowRight size={14} aria-hidden />
              </Button>
            }
          >
            <MetricsTable
              rows={groupReportRows(records, 'ads').slice(0, 5)}
              format={format}
              caption="Anúncios em acompanhamento"
              columns={[...defaultTrafficColumns]}
              onOpen={setSelected}
            />
          </Panel>
          <div className={styles.operationLinks}>
            <button type="button" onClick={() => navigate('windows')}>
              <span>
                Janelas e comparações<small>Compare horários e eficiência por anúncio</small>
              </span>
              <ArrowRight size={18} aria-hidden />
            </button>
            <button type="button" onClick={() => navigate('contingency')}>
              <span>
                Estrutura de contas
                <small>
                  {inventory.accounts.some((account) => account.source === 'meta')
                    ? `${inventory.bms.length} BMs e ${inventory.accounts.length} contas importadas da Meta`
                    : 'Abra Contingência para consultar o inventário importado'}
                </small>
              </span>
              <ArrowRight size={18} aria-hidden />
            </button>
          </div>
        </>
      )}
      {view === 'campaigns' && (
        <>
          <Panel
            title="Análise de campanhas"
            subtitle="Clique no nome para abrir anúncios vinculados e série diária."
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
                    variant={level === key ? 'secondary' : 'ghost'}
                    aria-pressed={level === key}
                    onClick={() => setLevel(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <MetricColumnPicker selected={columns} onChange={setColumns} />
            </div>
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <Search size={16} aria-hidden />
                <input
                  aria-label="Buscar campanha ou anúncio"
                  placeholder="Buscar nome, ID, campanha ou conjunto"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                aria-label="Situação do relatório"
                className={styles.control}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Todas as situações</option>
                {['Ativa', 'Pausada', 'Em análise', 'Com reprovação'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <span className={styles.subtle}>{rows.length} registros</span>
            </div>
            <MetricsTable
              rows={rows}
              format={format}
              caption={
                level === 'ads' ? 'Anúncios' : level === 'adsets' ? 'Conjuntos' : 'Campanhas'
              }
              columns={columns}
              totals={reportMetrics(filteredRecords)}
              onOpen={setSelected}
            />
          </Panel>
          <Panel
            title="Série diária"
            subtitle="Índices calculados a partir dos totais, sem médias de médias."
          >
            <MetricsTable
              rows={daily}
              format={format}
              caption="Série diária"
              columns={columns}
              totals={totals}
            />
          </Panel>
        </>
      )}
      {view === 'windows' && (
        <TrafficIntraday records={records} range={range} format={format} columns={columns} />
      )}
      <details className={styles.definitions}>
        <summary>Bases de cálculo e origem dos dados</summary>
        <dl className={styles.metricDefinitions}>
          {reportColumns.map((column) => (
            <div key={column.key}>
              <dt>{column.label}</dt>
              <dd>{column.hint}.</dd>
            </div>
          ))}
        </dl>
        <p className={styles.subtle}>
          Mídia e vídeo: Meta. Vendas de front, checkout, taxas e reserva: tracking e gateways do
          TMX. Dados indisponíveis aparecem como “—”.
        </p>
      </details>
      <output aria-live="polite" className={styles.subtle}>
        {notice}
      </output>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-5xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              Detalhe do período · métricas demonstrativas por ID
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className={styles.dialogBody}>
              <MetricsTable
                rows={[{ ...selected, metrics: reportMetrics(selectedRecords) }]}
                format={format}
                caption="Resumo do item"
                columns={columns}
              />
              <h3>Anúncios vinculados</h3>
              <MetricsTable
                rows={groupReportRows(selectedRecords, 'ads')}
                format={format}
                caption="Anúncios vinculados"
                columns={columns}
              />
              <h3>Série diária</h3>
              <MetricsTable
                rows={groupReportRows(selectedRecords, 'daily')}
                format={format}
                caption="Série diária"
                columns={columns}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportChart({
  rows,
  format,
  privateMode,
}: { rows: ReportRow[]; format: MetricFormat; privateMode: boolean }) {
  if (privateMode || !rows.length)
    return (
      <div className={styles.empty}>
        {privateMode ? 'Gráfico oculto pela privacidade.' : 'Nenhum dado no período.'}
      </div>
    );
  const values = rows.flatMap((row) => [row.metrics.finalResult ?? 0, row.metrics.spend]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const x = (i: number) => (rows.length === 1 ? 320 : 78 + (i / (rows.length - 1)) * 495);
  const y = (v: number) => 195 - ((v - min) / span) * 160;
  const points = (key: 'finalResult' | 'spend') =>
    rows.map((row, i) => `${x(i)},${y(row.metrics[key] ?? 0)}`).join(' ');
  return (
    <div className={styles.reportChart}>
      <div className={styles.legend}>
        <span>
          <i />
          Resultado final
        </span>
        <span>
          <i />
          Investimento
        </span>
      </div>
      <svg
        viewBox="0 0 600 235"
        role="img"
        aria-label="Evolução diária do resultado final e investimento"
      >
        <title>Resultado final e investimento por dia</title>
        {[0, 1, 2, 3].map((tick) => (
          <g key={tick}>
            <line
              x1="78"
              x2="573"
              y1={35 + tick * 53.33}
              y2={35 + tick * 53.33}
              className={styles.chartGrid}
            />
            <text x="1" y={39 + tick * 53.33}>
              {format(max - (tick * span) / 3, 'money')}
            </text>
          </g>
        ))}
        <polyline points={points('finalResult')} className={styles.resultLine} />
        <polyline points={points('spend')} className={styles.mediaLine} />
        {rows.map((row, i) =>
          i % Math.max(1, Math.ceil(rows.length / 6)) === 0 || i === rows.length - 1 ? (
            <text key={row.id} x={x(i)} y="222" textAnchor="middle">
              {row.name.slice(0, 5)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
