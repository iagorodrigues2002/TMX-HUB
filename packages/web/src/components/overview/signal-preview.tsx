'use client';

import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { Kpi } from '@/components/ui/kpi';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TrackingOverviewAccount } from '@/lib/api-client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useDataPending } from '@/lib/data-pending';
import type { DateRange } from '@/lib/date-range';
import { funnelRates } from '@/lib/funnel-rates';
import { useCountUp } from '@/lib/hooks/use-count-up';
import { useInterfaceEffects } from '@/lib/interface-effects';
import { usePrivacy } from '@/lib/privacy-context';
import { useQueries } from '@tanstack/react-query';
import {
  ChartNoAxesCombined,
  CreditCard,
  Filter,
  LogIn,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { CountryActivityMap } from './country-activity-map';
import { GatewayOverview } from './gateway-overview';
import { Dataset } from './overview-dashboard-dataset';
import { type OverviewDataset, formatConversionRate } from './overview-dashboard-support';
import { ReceiptRevenueChart } from './receipt-revenue-chart';
import styles from './signal-preview.module.css';

export const SIGNAL_PREVIEW = process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1';

function FlowNumber({
  value,
  label,
  privateMode,
  motion,
}: { value: number | null; label: string; privateMode: boolean; motion: boolean }) {
  const pending = useDataPending();
  const reading = useCountUp(
    !privateMode && motion ? (value ?? undefined) : undefined,
    1650,
    label,
  );
  return (
    <strong>
      {pending ? '—' : privateMode ? '••••' : value === null ? '—' : formatInt(reading ?? value)}
    </strong>
  );
}

export function SignalPreview({
  datasets,
  accounts,
  period,
  salesView = 'general',
  selected,
  onSelect,
}: {
  datasets: OverviewDataset[];
  accounts?: TrackingOverviewAccount[];
  period: DateRange;
  salesView?: 'general' | 'natural';
  selected: string;
  onSelect: (key: string) => void;
}) {
  const { visual: effects } = useInterfaceEffects();
  const pending = useDataPending();
  const scopeLabelId = useId();
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
      queryKey: ['funnel-activity', user?.id, user?.role, id, period.from, period.to, salesView],
      queryFn: () =>
        request<{ version: string; entrants: number; checkouts: number; buyers: number }>(
          `/v1/offers/${id}/tracking/funnel-activity?${new URLSearchParams({ from: period.from, to: period.to, sales_view: salesView })}`,
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
    pending
      ? '—'
      : isPrivate
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
      value: cohort?.entrants ?? null,
      hint: 'Visitantes com entrada rastreada',
      Icon: LogIn,
    },
    {
      label: 'Checkout',
      value: cohort?.checkouts ?? null,
      hint: 'Visitantes que abriram checkout',
      Icon: CreditCard,
    },
    {
      label: 'Compra',
      value: cohort?.buyers ?? null,
      hint: 'Compradores de front vinculados',
      Icon: ShoppingBag,
    },
  ];

  return (
    <section
      className={styles.signal}
      data-motion={motion ? 'on' : 'off'}
      data-paused={hidden}
      aria-label="Visão geral Signal"
    >
      <div className={styles.toolbar} data-motion-panel>
        <div className={styles.scope}>
          <span id={scopeLabelId}>Escopo dos dados</span>
          <Select value={dataset.key} onValueChange={onSelect}>
            <SelectTrigger aria-labelledby={scopeLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label} · {item.offerCount} {item.offerCount === 1 ? 'oferta' : 'ofertas'} ·{' '}
                  {item.currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className={styles.kpis}>
        {metrics.map(({ label, value, format, Icon }) => (
          <Kpi
            key={label}
            label={label}
            value={isPrivate ? '****' : value === null ? '—' : format(value)}
            countUp={
              !isPrivate && motion && value !== null ? { value, format, duration: 1650 } : undefined
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
        <CountryActivityMap
          salesView={salesView}
          offerIds={dataset.offerIds ?? []}
          period={period}
          animated={motion}
        />
        <ReceiptRevenueChart
          salesView={salesView}
          animated={motion}
          offerIds={dataset.offerIds ?? []}
          period={period}
        />
      </div>
      <section className={styles.journey} data-motion-panel data-glass-surface>
        <h3>
          <Filter aria-hidden /> Entrada → Checkout → Compra
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
              <FlowNumber value={value} label={label} privateMode={isPrivate} motion={motion} />
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
      <Dataset dataset={dataset} salesView={salesView} />
      {accounts && (
        <GatewayOverview
          accounts={accounts.filter((account) => dataset.key.startsWith(`${account.owner_id}:`))}
        />
      )}
    </section>
  );
}
