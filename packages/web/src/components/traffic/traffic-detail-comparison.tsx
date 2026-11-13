'use client';
import { useState } from 'react';
import { realCampaignRows, trafficTotals, type RealCampaignSnapshot } from './real-campaigns-model';
import { hourlyDetail } from './traffic-detail-model';
import { reportColumns, type ReportRow, type ReportMetricKey } from './traffic-reports-model';
import type { MetricFormat } from './traffic-metrics-table';
import styles from './traffic-preview.module.css';

export function DetailMetrics({ rows, columns, format, caption }: { rows: ReportRow[]; columns: ReportMetricKey[]; format: MetricFormat; caption: string }) {
  return <section aria-label={caption} className="grid min-w-0 gap-3">{rows.length ? rows.map(row => <article key={row.id} className="glass-card min-w-0 rounded-xl border border-border bg-muted/10 p-4">
    <header className="mb-4 min-w-0"><h4 className="break-words text-sm font-semibold">{row.name}</h4><p className="mt-1 break-words text-xs text-muted-foreground">{row.subtitle}</p></header>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{columns.map(key => {
      const column = reportColumns.find(c => c.key === key)!;
      return <div key={key} className="min-w-0 rounded-lg bg-background/40 p-3"><dt className="text-xs text-muted-foreground" title={column.hint}>{column.label}</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums">{format(row.unavailable || row.missingMetrics?.includes(key) ? null : row.metrics[key], column.kind)}</dd></div>;
    })}</dl>
  </article>) : <p className={styles.subtle}>Sem dados confirmados no período.</p>}</section>;
}

export function TrafficDetailComparison({ data, currency, format, from, to }: {
  data: RealCampaignSnapshot; currency: string; format: MetricFormat; from: string; to: string;
}) {
  const [windows, setWindows] = useState([{ date: to, start: 8, end: 10 }, { date: to, start: 10, end: 12 }]);
  const values = windows.map(window => {
    if (window.date < from || window.date > to) return null;
    const snapshot = hourlyDetail(data, window.date, window.start, window.end);
    if (!snapshot) return null;
    const rows = realCampaignRows(snapshot, { from: window.date, to: window.date }, { currency, account: '', business: '', status: '', query: '', deliveryOnly: true, includeAttributedZeroSpend: true });
    return rows.length && !rows.some(row => row.unavailable) ? trafficTotals(rows) : null;
  });
  const columns = reportColumns.filter(column => ['spend', 'frontSales', 'cpa', 'checkouts', 'costCheckout', 'metaRoas', 'cpm', 'cpc'].includes(column.key));
  return <section className="glass-card space-y-4 rounded-xl border border-border bg-muted/10 p-4" aria-label="Comparação de horários do item">
    <div><h3 className="font-semibold">Comparar horários</h3><p className={styles.subtle}>Dados deste item · fuso {data.accounts.find(a => a.id === data.campaigns[0]?.accountId)?.timezone ?? 'da conta Meta'}. O horário final não entra no intervalo.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{windows.map((window, index) => <fieldset key={index} className="rounded-lg border border-border p-3">
      <legend className="px-2 text-sm font-medium">Período {index === 0 ? 'A' : 'B'}</legend>
      <div className="flex flex-wrap gap-2">
        <label className={styles.field}>Data<input className={styles.control} aria-label={`Data ${index === 0 ? 'A' : 'B'}`} type="date" min={from} max={to} value={window.date} onChange={e => setWindows(current => current.map((w, i) => i === index ? { ...w, date: e.target.value } : w))}/></label>
        {(['start', 'end'] as const).map(field => <label className={styles.field} key={field}>{field === 'start' ? 'De' : 'Até'}<select className={styles.control} aria-label={`${field === 'start' ? 'Início' : 'Fim'} ${index === 0 ? 'A' : 'B'}`} value={window[field]} onChange={e => setWindows(current => current.map((w, i) => i === index ? { ...w, [field]: Number(e.target.value) } : w))}>{Array.from({ length: 24 }, (_, i) => field === 'end' ? i + 1 : i).map(hour => <option value={hour} key={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label>)}
      </div>
      {window.start >= window.end && <p role="alert" className="mt-2 text-sm text-danger">O fim deve ser posterior ao início.</p>}
    </fieldset>)}</div>
    {values.some(value => !value) && <p className={styles.subtle}>Sem leitura horária confirmada em um dos períodos. Dados ausentes aparecem como “—”, nunca como zero.</p>}
    <div className={styles.tableScroll}><table className={styles.table}><caption className="sr-only">Comparação horária do item selecionado</caption><thead><tr><th>Métrica</th><th>Período A</th><th>Período B</th><th>Diferença B − A</th></tr></thead><tbody>{columns.map(column => {
      const a = values[0]?.[column.key] ?? null, b = values[1]?.[column.key] ?? null;
      return <tr key={column.key}><th scope="row">{column.label}</th><td>{format(a, column.kind)}</td><td>{format(b, column.kind)}</td><td>{format(a === null || b === null ? null : b - a, column.kind)}</td></tr>;
    })}</tbody></table></div>
  </section>;
}
