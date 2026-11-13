'use client';

import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import styles from './traffic-preview.module.css';
import {
  type ReportMetricKey,
  type ReportMetrics,
  type ReportRow,
  reportColumns,
} from './traffic-reports-model';
import { StatusPill } from './traffic-ui';

export type MetricFormat = (
  value: number | null,
  kind: 'money' | 'count' | 'percent' | 'ratio',
) => string;
export function MetricsTable({
  rows,
  format,
  caption,
  onOpen,
  totals,
  columns = reportColumns.map((column) => column.key),
  selection,
  rowAction,
  beforeName,
  leadingColumns = [],
  hideInlineStatus = false,
}: {
  rows: ReportRow[];
  format: MetricFormat;
  caption: string;
  onOpen?: (row: ReportRow) => void;
  totals?: ReportMetrics;
  columns?: ReportMetricKey[];
  selection?: {
    ids: string[];
    toggle: (ids: string[], checked: boolean) => void;
    disabled?: boolean;
  };
  rowAction?: (row: ReportRow) => ReactNode;
  beforeName?: (row: ReportRow) => ReactNode;
  leadingColumns?: { key: string; label: string; render: (row: ReportRow) => ReactNode }[];
  hideInlineStatus?: boolean;
}) {
  const [sort, setSort] = useState<{ key: ReportMetricKey; ascending: boolean } | null>(null);
  const visible = columns.flatMap((key) => reportColumns.filter((column) => column.key === key));
  const ordered = sort
    ? [...rows].sort((a, b) => {
        const left =
          a.unavailable || a.missingMetrics?.includes(sort.key) ? null : a.metrics[sort.key];
        const right =
          b.unavailable || b.missingMetrics?.includes(sort.key) ? null : b.metrics[sort.key];
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return (left - right) * (sort.ascending ? 1 : -1);
      })
    : rows;
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: A região rolável precisa receber foco para permitir navegação horizontal pelo teclado.
    <section className={styles.tableScroll} aria-label={caption} tabIndex={0}>
      <table className={`${styles.table} ${styles.metricsTable}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">
              {selection && (
                <input
                  type="checkbox"
                  className="mr-3 size-4 accent-primary"
                  aria-label="Selecionar todos os itens desta página"
                  checked={rows.length > 0 && rows.every((row) => selection.ids.includes(row.id))}
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        rows.some((row) => selection.ids.includes(row.id)) &&
                        !rows.every((row) => selection.ids.includes(row.id));
                  }}
                  disabled={selection.disabled || !rows.length}
                  onChange={(event) =>
                    selection.toggle(
                      rows.map((row) => row.id),
                      event.target.checked,
                    )
                  }
                />
              )}
              {caption === 'Série diária'
                ? 'Data'
                : caption.includes('janela')
                  ? 'Faixa / anúncio'
                  : 'Nome'}
            </th>
            {leadingColumns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
            {visible.map((column) => (
              <th
                scope="col"
                key={column.key}
                aria-sort={
                  sort?.key === column.key ? (sort.ascending ? 'ascending' : 'descending') : 'none'
                }
              >
                <button
                  type="button"
                  title={column.hint}
                  onClick={() =>
                    setSort({
                      key: column.key,
                      ascending: sort?.key === column.key ? !sort.ascending : false,
                    })
                  }
                >
                  {column.label}
                  {sort?.key === column.key ? (
                    sort.ascending ? (
                      <ArrowUp size={12} aria-hidden />
                    ) : (
                      <ArrowDown size={12} aria-hidden />
                    )
                  ) : (
                    <ArrowUpDown size={12} aria-hidden />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.id} className="[&>td]:!align-top">
              <td>
                {selection && (
                  <input
                    type="checkbox"
                    className="mr-3 size-4 accent-primary"
                    aria-label={`Selecionar ${row.name}`}
                    checked={selection.ids.includes(row.id)}
                    disabled={selection.disabled}
                    onChange={(event) => selection.toggle([row.id], event.target.checked)}
                  />
                )}
                {beforeName?.(row)}
                {onOpen ? (
                  <button type="button" className={styles.textButton} onClick={() => onOpen(row)}>
                    {row.name}
                  </button>
                ) : (
                  <strong>{row.name}</strong>
                )}
                <small>{row.subtitle}</small>
                {!hideInlineStatus && row.status && <StatusPill status={row.status} />}
                {rowAction?.(row)}
              </td>
              {leadingColumns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
              {visible.map((column) => (
                <td className={styles.numeric} key={column.key}>
                  {format(
                    row.unavailable || row.missingMetrics?.includes(column.key)
                      ? null
                      : row.metrics[column.key],
                    column.kind,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row">Total do escopo</th>
              {leadingColumns.map((column) => (
                <td key={column.key} />
              ))}
              {visible.map((column) => (
                <td className={styles.numeric} key={column.key}>
                  {format(totals[column.key], column.kind)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {!rows.length && (
        <div className={styles.empty}>
          <Search aria-hidden />
          <h3>Nenhum dado neste recorte</h3>
          <p>Revise a busca, as fontes e o período selecionado.</p>
        </div>
      )}
    </section>
  );
}

export function MetricColumnPicker({
  selected,
  onChange,
  allowed,
}: {
  selected: ReportMetricKey[];
  onChange: (columns: ReportMetricKey[]) => void;
  allowed?: ReportMetricKey[];
}) {
  const options = allowed
    ? reportColumns.filter((column) => allowed.includes(column.key))
    : reportColumns;
  return (
    <details className={styles.columnPicker}>
      <summary>Colunas · {selected.length} métricas</summary>
      <div className={styles.columnOptions}>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(options.map((column) => column.key))}
          >
            Mostrar todas
          </Button>
        </div>
        {options.map((column) => (
          <label key={column.key} title={column.hint}>
            <input
              type="checkbox"
              aria-label={column.label}
              checked={selected.includes(column.key)}
              disabled={selected.length === 1 && selected.includes(column.key)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, column.key]
                    : selected.filter((key) => key !== column.key),
                )
              }
            />
            <span>
              {column.label}
              <small>{column.hint}</small>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}
