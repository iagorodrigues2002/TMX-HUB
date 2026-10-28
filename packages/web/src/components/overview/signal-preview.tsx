'use client';

import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { Kpi } from '@/components/ui/kpi';
import type { TrackingOverviewAccount } from '@/lib/api-client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { DateRange } from '@/lib/date-range';
import { funnelRates } from '@/lib/funnel-rates';
import { useInterfaceEffects } from '@/lib/interface-effects';
import { usePrivacy } from '@/lib/privacy-context';
import { useQueries } from '@tanstack/react-query';
import {
  ChartNoAxesCombined,
  CreditCard,
  MousePointerClick,
  Network,
  Percent,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CountryActivityMap } from './country-activity-map';
import { GatewayOverview } from './gateway-overview';
import { Dataset } from './overview-dashboard-dataset';
import { type OverviewDataset, formatConversionRate } from './overview-dashboard-support';
import { ReceiptRevenueChart } from './receipt-revenue-chart';
import { ReserveReleaseProjection } from './reserve-release-projection';
import styles from './signal-preview.module.css';

export const SIGNAL_PREVIEW = process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1';

export function SignalPreview({
  datasets,
  accounts,
  period,
}: { datasets: OverviewDataset[]; accounts?: TrackingOverviewAccount[]; period: DateRange }) {
  const [selected, setSelected] = useState('');
  const { visual: effects } = useInterfaceEffects();
  const [motion, setMotion] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { isPrivate } = usePrivacy();
  const { user } = useAuth();
  const dataset =
    datasets.find((item) => item.key === selected) ??
    datasets.find((item) => item.key.startsWith(`${user?.id}:`)) ??
    datasets[0];
  const funnelQueries = useQueries({
    queries: [...new Set(dataset?.offerIds ?? [])].map((id) => ({
      queryKey: ['funnel-activity', user?.id, user?.role, id, period.from, period.to],
      queryFn: () =>
        request<{ version: string; entrants: number; checkouts: number; buyers: number }>(
          `/v1/offers/${id}/tracking/funnel-activity?${new URLSearchParams({ from: period.from, to: period.to })}`,
        ),
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });
  const cohortReady =
    funnelQueries.length > 0 &&
    funnelQueries.every((q) => !q.isError && q.data?.version === 'visitor-cohort-v1');
  const cohort = cohortReady
    ? funnelQueries.reduce(
        (sum, q) => ({
          entrants: sum.entrants + q.data!.entrants,
          checkouts: sum.checkouts + q.data!.checkouts,
          buyers: sum.buyers + q.data!.buyers,
        }),
        { entrants: 0, checkouts: 0, buyers: 0 },
      )
    : null;
  const rates = cohort ? funnelRates(cohort.entrants, cohort.checkouts, cohort.buyers) : null;
  const percentage = (value: number | null | undefined) =>
    isPrivate
      ? '••••'
      : value == null
        ? '—'
        : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const active = effects && !reduced.matches;
      setMotion(active);
    };
    const updateVisibility = () => setHidden(document.hidden);
    update();
    updateVisibility();
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      reduced.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, [effects]);

  if (!dataset) return null;
  const money = (value: number) => formatCurrency(value, dataset.currency);
  const metrics = [
    {
      label: 'Receita bruta',
      value: dataset.totals.revenue,
      format: money,
      Icon: ChartNoAxesCombined,
    },
    { label: 'Vendas', value: dataset.totals.sales, format: formatInt, Icon: ShoppingCart },
    {
      label: 'Taxa de conversão',
      value: dataset.conversionRate,
      format: formatConversionRate,
      Icon: Percent,
    },
    {
      label: 'Após retenção da reserva',
      value: dataset.finance?.available ?? null,
      format: money,
      Icon: Wallet,
    },
  ];
  const steps = [
    {
      label: 'Entrada',
      value: cohort ? formatInt(cohort.entrants) : '—',
      hint: 'Visitantes com entrada rastreada',
      Icon: MousePointerClick,
    },
    {
      label: 'Checkout',
      value: cohort ? formatInt(cohort.checkouts) : '—',
      hint: 'Visitantes que abriram checkout',
      Icon: CreditCard,
    },
    {
      label: 'Compra',
      value: cohort ? formatInt(cohort.buyers) : '—',
      hint: 'Compradores de front vinculados',
      Icon: ShoppingCart,
    },
  ];

  return (
    <section
      className={styles.signal}
      data-motion={motion ? 'on' : 'off'}
      data-paused={hidden}
      aria-label="Visão geral Signal"
    >
      <div className={styles.toolbar}>
        <label>
          Escopo dos dados
          <select
            aria-label="Escopo dos dados"
            value={dataset.key}
            onChange={(event) => setSelected(event.target.value)}
          >
            {datasets.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} · {item.offerCount} {item.offerCount === 1 ? 'oferta' : 'ofertas'} ·{' '}
                {item.currency}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.kpis}>
        {metrics.map(({ label, value, format, Icon }) => (
          <Kpi
            key={`${dataset.key}:${label}`}
            label={label}
            value={isPrivate ? '****' : value === null ? '—' : format(value)}
            countUp={
              !isPrivate && motion && value !== null ? { value, format, duration: 2600 } : undefined
            }
            icon={<Icon aria-hidden className="h-5 w-5" />}
            hint={
              label === 'Após retenção da reserva'
                ? 'Estimativa; não é saldo liberado para saque'
                : undefined
            }
          />
        ))}
      </div>
      <div className={styles.visuals}>
        <CountryActivityMap offerIds={dataset.offerIds ?? []} period={period} animated={motion} />
        <ReceiptRevenueChart animated={motion} offerIds={dataset.offerIds ?? []} period={period} />
      </div>
      <section className={styles.journey}>
        <h3>
          <Network aria-hidden /> Entrada → Checkout → Compra
        </h3>
        <p className={styles.flowNote}>
          Visitantes únicos por oferta · etapas vinculadas no período · upsells excluídos. Animação
          ilustrativa.
        </p>
        <div className={styles.steps}>
          {steps.map(({ label, value, hint, Icon }, index) => (
            <div key={label}>
              {index < steps.length - 1 && (
                <>
                  <span className={styles.flowTrack} aria-hidden="true">
                    <span
                      className={styles.flowParticle}
                      style={{ animationDelay: `${index * 2.4}s` }}
                    />
                  </span>
                  <div className={styles.flowRates}>
                    <b>
                      {percentage(rates?.advances[index])} <span>avançaram</span>
                    </b>
                    <small>{percentage(rates?.losses[index])} sem avanço</small>
                  </div>
                </>
              )}
              <span className={styles.ring} style={{ animationDelay: `${index * 2.4}s` }}>
                <Icon aria-hidden />
              </span>
              <strong>{isPrivate ? '****' : value}</strong>
              <span>{label}</span>
              <small>{hint}</small>
            </div>
          ))}
        </div>
        <div className={styles.funnelFooter}>
          <span>
            Conversão total do funil <strong>{percentage(rates?.total)}</strong>
          </span>
          <small>
            {!cohort
              ? funnelQueries.some((q) => q.isError)
                ? 'Consulta indisponível. Sem estimar taxas pelos totais gerais.'
                : 'Consultando vínculos. Sem estimar taxas pelos totais gerais.'
              : 'Abandono = sem avanço até o fim do período; não representa perda definitiva.'}
          </small>
        </div>
      </section>
      <Dataset dataset={dataset} />
      <ReserveReleaseProjection offerIds={dataset.offerIds ?? []} />
      {accounts && (
        <GatewayOverview
          accounts={accounts.filter((account) => dataset.key.startsWith(`${account.owner_id}:`))}
        />
      )}
    </section>
  );
}
