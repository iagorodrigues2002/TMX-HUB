'use client';
import { Button } from '@/components/ui/button';
import type { DateRange } from '@/lib/date-range';
import { supportsIntradayRange } from '@/lib/intraday-range';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { type MetricFormat, MetricsTable } from './traffic-metrics-table';
import styles from './traffic-preview.module.css';
import {
  type ReportMetricKey,
  type ReportRecord,
  groupReportRows,
  reportColumns,
  reportMetrics,
} from './traffic-reports-model';
import { Panel } from './traffic-ui';

export function TrafficIntraday({
  records,
  range,
  format,
  columns,
}: {
  records: ReportRecord[];
  range: DateRange;
  format: MetricFormat;
  columns: ReportMetricKey[];
}) {
  const [view, setView] = useState('overview');
  const [left, setLeft] = useState('10');
  const [right, setRight] = useState('11');
  const [target, setTarget] = useState('a');
  const [search, setSearch] = useState('');
  const [window, setWindow] = useState('all');
  const windows = groupReportRows(records, 'windows');
  const a = records.filter((row) => String(row.window) === left);
  const b = records.filter((row) => String(row.window) === right);
  const before = reportMetrics(a);
  const after = reportMetrics(b);
  const matches = (row: ReportRecord) =>
    `${row.ad.name} ${row.ad.id}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR'));
  const ads = groupReportRows([...a, ...b].filter(matches), 'ads');
  const filtered = records.filter(
    (row) => (window === 'all' || String(row.window) === window) && matches(row),
  );
  if (!supportsIntradayRange(range))
    return (
      <Panel title="Janelas intradiárias">
        <p className={styles.subtle}>
          Selecione até 60 dias para comparar faixas. Os demais relatórios mantêm o período
          completo.
        </p>
      </Panel>
    );
  return (
    <div className={styles.pageStack}>
      <Panel
        title="Mapa do dia"
        subtitle="12 faixas de duas horas · soma dos dias selecionados · horário de São Paulo"
      >
        <div className={styles.toolbar}>
          <p className={styles.subtle}>Escolha o lado e clique em um horário para comparar.</p>
          <div className={styles.segmented}>
            {['a', 'b'].map((side) => (
              <Button
                key={side}
                size="sm"
                variant={target === side ? 'secondary' : 'ghost'}
                aria-pressed={target === side}
                onClick={() => setTarget(side)}
              >
                Selecionar {side.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <div className={styles.windowTimeline}>
          {windows.map((row) => (
            <button
              type="button"
              key={row.id}
              data-side={
                row.id === left && row.id === right
                  ? 'both'
                  : row.id === left
                    ? 'a'
                    : row.id === right
                      ? 'b'
                      : ''
              }
              aria-label={`Comparar ${row.name} como janela ${target.toUpperCase()}`}
              aria-pressed={row.id === left || row.id === right}
              onClick={() => (target === 'a' ? setLeft(row.id) : setRight(row.id))}
            >
              <span>{row.name}</span>
              <strong>{format(row.metrics.spend, 'money')}</strong>
              <small>{format(row.metrics.frontSales, 'count')} fronts</small>
              <i>
                {row.id === left ? 'A' : ''}
                {row.id === left && row.id === right ? ' / ' : ''}
                {row.id === right ? 'B' : ''}
              </i>
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title="Comparação de eficiência"
        subtitle="A e B usam o mesmo período e fontes; a variação mostra B menos A."
      >
        <div className={styles.comparisonToolbar}>
          <div className={styles.segmented}>
            <Button
              variant={view === 'overview' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'overview'}
              onClick={() => setView('overview')}
            >
              Visão geral
            </Button>
            <Button
              variant={view === 'ads' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'ads'}
              onClick={() => setView('ads')}
            >
              Por anúncios
            </Button>
          </div>
          <div className={styles.actions}>
            {(
              [
                ['A', left, setLeft],
                ['B', right, setRight],
              ] as const
            ).map(([label, value, setValue]) => (
              <label key={label} className={styles.field}>
                Janela {label}
                <select
                  className={styles.control}
                  aria-label={`Janela ${label}`}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                >
                  {windows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        {left === right && (
          <p className={styles.warning}>
            A e B estão na mesma faixa. Selecione horários diferentes para comparar.
          </p>
        )}
        {view === 'overview' ? (
          <div className={styles.tableScroll}>
            <table className={`${styles.table} ${styles.compareTable}`}>
              <caption className="sr-only">Comparação entre janelas A e B</caption>
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">A · {windows.find((row) => row.id === left)?.name}</th>
                  <th scope="col">B · {windows.find((row) => row.id === right)?.name}</th>
                  <th scope="col">Diferença B − A</th>
                  <th scope="col">Variação sobre A</th>
                </tr>
              </thead>
              <tbody>
                {reportColumns
                  .filter(
                    (column) =>
                      columns.includes(column.key) ||
                      [
                        'finalResult',
                        'roas',
                        'checkoutConversion',
                        'conversionRate',
                        'impressions',
                      ].includes(column.key),
                  )
                  .map((column) => {
                    const av = before[column.key];
                    const bv = after[column.key];
                    return (
                      <tr key={column.key}>
                        <th scope="row" title={column.hint}>
                          {column.label}
                        </th>
                        <td>{format(av, column.kind)}</td>
                        <td>{format(bv, column.kind)}</td>
                        <td>{format(av === null || bv === null ? null : bv - av, column.kind)}</td>
                        <td>
                          {format(
                            av === null || bv === null || av <= 0 ? null : (bv - av) / av,
                            'percent',
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
            <label className={styles.search}>
              <Search size={16} aria-hidden />
              <input
                aria-label="Buscar anúncio na comparação"
                placeholder="Nome ou ID do anúncio"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className="sr-only">Comparação intradiária por anúncio</caption>
                <thead>
                  <tr>
                    {[
                      'Anúncio',
                      'Investimento A',
                      'Investimento B',
                      'Fronts A',
                      'Fronts B',
                      'CPA A',
                      'CPA B',
                      'IC A',
                      'IC B',
                      'ROI A',
                      'ROI B',
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.map((row) => {
                    const ma = reportMetrics(a.filter((item) => item.ad.id === row.id));
                    const mb = reportMetrics(b.filter((item) => item.ad.id === row.id));
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                          <small>{row.id}</small>
                        </td>
                        {(['spend', 'frontSales', 'cpa', 'checkouts', 'roi'] as const).flatMap(
                          (key) =>
                            (
                              [
                                ['a', ma],
                                ['b', mb],
                              ] as const
                            ).map(([side, m]) => (
                              <td key={`${key}-${side}`}>
                                {format(
                                  m[key],
                                  key === 'frontSales' || key === 'checkouts'
                                    ? 'count'
                                    : key === 'roi'
                                      ? 'percent'
                                      : 'money',
                                )}
                              </td>
                            )),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!ads.length && (
                <p className={styles.empty}>Nenhum anúncio corresponde a este recorte.</p>
              )}
            </div>
          </>
        )}
      </Panel>
      <Panel
        title="Detalhamento intradiário"
        subtitle="Consulte todas as faixas ou isole um horário por anúncio."
      >
        <div className={styles.toolbar}>
          <label className={styles.field}>
            Recorte
            <select
              className={styles.control}
              aria-label="Janela dos anúncios"
              value={window}
              onChange={(event) => setWindow(event.target.value)}
            >
              <option value="all">Todas as faixas</option>
              {windows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.subtle}>Os dados não representam uma série em tempo real.</span>
        </div>
        <MetricsTable
          rows={window === 'all' ? windows : groupReportRows(filtered, 'ads')}
          format={format}
          caption={window === 'all' ? 'Métricas por janela' : 'Anúncios por janela'}
          columns={columns}
          totals={reportMetrics(window === 'all' ? records : filtered)}
        />
      </Panel>
    </div>
  );
}
