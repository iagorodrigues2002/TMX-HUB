'use client';

import type { AdsIntelligenceData } from '@/lib/api-client';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { MetricCells } from './ads-intelligence-center-metric-cells';
import {
  MetricColumns,
  type MetricKey,
  columns,
  platformLabel,
  stickyColumnClass,
  tableWidth,
} from './ads-intelligence-center-support';
import { sourceAccountLabel } from './metric-presentation';

export function BatchRow({
  batch,
  sort,
  privateMode,
}: { batch: AdsIntelligenceData['batches'][number]; sort: MetricKey; privateMode: boolean }) {
  const [open, setOpen] = useState(false);
  const ads = [...batch.ads].sort(
    (a, b) =>
      (b[sort] ?? Number.NEGATIVE_INFINITY) - (a[sort] ?? Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
  );
  const panelId = `ads-batch-${encodeURIComponent(batch.key)}`;
  return (
    <tbody className="border-b border-border">
      <tr className="bg-muted/20">
        <th
          scope="row"
          className={`${stickyColumnClass} z-20 w-56 min-w-56 p-0 text-left font-medium`}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
            <span>
              {batch.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {batch.offer_name} · {batch.ads.length} anúncios
              </span>
            </span>
          </button>
        </th>
        <MetricCells metrics={batch.totals} privateMode={privateMode} />
      </tr>
      <tr>
        <td colSpan={columns.length + 1} className="p-0">
          <div
            id={panelId}
            aria-hidden={!open}
            className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
            style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
          >
            <div className="min-h-0 overflow-clip">
              <table
                className="relative table-fixed text-sm"
                style={{ width: tableWidth, minWidth: tableWidth }}
                aria-label={`Anúncios da ${batch.name}`}
              >
                <MetricColumns />
                <thead className="sr-only">
                  <tr>
                    <th>Anúncio</th>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.key} className="border-t border-border/40 bg-background/40">
                      <th
                        scope="row"
                        className={`${stickyColumnClass} z-10 w-56 min-w-56 px-4 py-3 pl-11 text-left font-normal`}
                      >
                        <span>{ad.name}</span>
                        {!!ad.sources?.length && (
                          <>
                            <span className="mt-1 block break-all text-xs text-muted-foreground">
                              {sourceAccountLabel(ad.sources)}
                            </span>
                            {new Set(ad.sources.map((source) => source.platform).filter(Boolean))
                              .size > 1 && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {[
                                  ...new Set(
                                    ad.sources.map((source) => source.platform).filter(Boolean),
                                  ),
                                ]
                                  .map(platformLabel)
                                  .join(' / ')}
                              </span>
                            )}
                            <details className="mt-2 text-xs" tabIndex={open ? undefined : -1}>
                              <summary
                                tabIndex={open ? undefined : -1}
                                className="cursor-pointer text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                Nomes e IDs originais
                              </summary>
                              <div className="mt-2 space-y-3 break-words text-muted-foreground">
                                {ad.sources.map((source) => (
                                  <dl
                                    key={JSON.stringify(source)}
                                    className="space-y-2 border-t border-border pt-2"
                                  >
                                    <div>
                                      <dt className="font-medium text-foreground">Plataforma</dt>
                                      <dd>{platformLabel(source.platform)}</dd>
                                    </div>
                                    <div>
                                      <dt className="font-medium text-foreground">
                                        Página anunciante
                                      </dt>
                                      <dd>{source.page_name || 'Não informada'}</dd>
                                      {source.page_id && (
                                        <dd className="break-all">ID: {source.page_id}</dd>
                                      )}
                                    </div>
                                    {(['account', 'campaign', 'adset', 'ad'] as const).map(
                                      (field) => (
                                        <div key={field}>
                                          <dt className="font-medium text-foreground">
                                            {
                                              {
                                                account: 'Conta',
                                                campaign: 'Campanha',
                                                adset: 'Conjunto',
                                                ad: 'Anúncio',
                                              }[field]
                                            }
                                          </dt>
                                          <dd>{source[`${field}_name`] || 'Nome não informado'}</dd>
                                          <dd className="break-all">
                                            ID: {source[`${field}_id`] || 'Não informado'}
                                          </dd>
                                        </div>
                                      ),
                                    )}
                                  </dl>
                                ))}
                              </div>
                            </details>
                          </>
                        )}
                      </th>
                      <MetricCells metrics={ad} privateMode={privateMode} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}
