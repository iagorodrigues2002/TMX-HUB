'use client';

import type {
  IntradayRangeSummaryView,
  OfferSnapshotsView,
  TrackingOverviewOffer,
} from '@/lib/api-client';
import { overviewFinancials } from '@/lib/overview-financial';
import {
  type DatasetAccumulator,
  type MetricParts,
  type OfferDescriptor,
  type OverviewDashboardProps,
  type OverviewDataset,
  type TrackingSummaryView,
  addMetrics,
  computedMetrics,
  emptyMetrics,
  selectedOverviewDataset,
  shortDate,
} from './overview-dashboard-support';

function validFinancialRevenue(
  financial: TrackingOverviewOffer | undefined,
): financial is TrackingOverviewOffer {
  const gross = Number(financial?.gross_revenue_brl_minor);
  return Boolean(
    financial &&
      /^\d+$/.test(financial.gross_revenue_brl_minor) &&
      Number.isSafeInteger(gross) &&
      gross >= 0 &&
      Number.isSafeInteger(financial.paid_orders) &&
      financial.paid_orders >= 0,
  );
}

/** Read other scopes on selection; missing financial rows still need their summary fallback. */
export function overviewDetailOfferIds(
  offers: OfferDescriptor[],
  scope: OverviewDashboardProps['scope'],
  selected: string,
  userId: string | undefined,
  finances: TrackingOverviewOffer[] | undefined,
  includeAll = false,
) {
  const groups = offers.map((offer) => ({
    key: scope === 'offer' ? offer.id : `${offer.ownerId}:${offer.currency}`,
    offer,
  }));
  const active = selectedOverviewDataset(groups, selected, userId)?.key;
  const covered = new Set(finances?.filter(validFinancialRevenue).map((row) => row.offer_id));
  return new Set(
    groups
      .filter(
        ({ key, offer }) => includeAll || key === active || (finances && !covered.has(offer.id)),
      )
      .map(({ offer }) => offer.id),
  );
}

export function buildDatasets(
  scope: OverviewDashboardProps['scope'],
  offers: OfferDescriptor[],
  snapshots: Array<OfferSnapshotsView | undefined>,
  summaries: Array<TrackingSummaryView | undefined>,
  intraday: Array<IntradayRangeSummaryView | undefined>,
  finances: TrackingOverviewOffer[] | undefined,
): OverviewDataset[] {
  const groups = new Map<string, DatasetAccumulator>();
  const revenueMinor = new Map<string, number>();
  const incompleteFinancialGroups = new Set<string>();
  const incompleteTrackingGroups = new Set<string>();

  offers.forEach((descriptor, index) => {
    const snapshot = snapshots[index];
    const summary = summaries[index];
    const intradaySummary = intraday[index];
    const currency = snapshot?.offer.currency ?? descriptor.currency;
    const ownerName =
      scope === 'offer' ? (snapshot?.offer.name ?? descriptor.name) : descriptor.ownerName;
    const key = scope === 'offer' ? descriptor.id : `${descriptor.ownerId}:${currency}`;
    const group: DatasetAccumulator = groups.get(key) ?? {
      key,
      ownerName,
      currency,
      offerNames: [],
      totals: emptyMetrics(),
      clicks: 0,
      pageViews: 0,
      fallbackClicks: 0,
      daily: new Map<string, MetricParts & { clicks: number }>(),
      intraday: new Map<string, { label: string; metrics: MetricParts }>(),
    };

    if (!group.offerNames.includes(descriptor.name)) group.offerNames.push(descriptor.name);

    if (snapshot) {
      // Media snapshots remain the source for spend and chart series. Sales,
      // revenue and checkout totals come from first-party tracking below.
      group.totals.spend += snapshot.totals.spend;
      for (const day of snapshot.snapshots) {
        group.clicks += day.clicks ?? 0;
        const current = group.daily.get(day.date) ?? { ...emptyMetrics(), clicks: 0 };
        addMetrics(current, day);
        current.clicks += day.clicks ?? 0;
        group.daily.set(day.date, current);
      }
    }

    if (summary) {
      group.pageViews += summary.page_views;
      group.fallbackClicks += summary.ad_clicks;
      group.totals.ic += summary.checkout_events;
    } else {
      incompleteTrackingGroups.add(key);
    }

    // Both endpoints use the same period/sales view and paid-order ledger.
    // Prefer the complete financial response: a failed heavy tracking query
    // must not silently remove an offer's revenue from the displayed total.
    const financial = finances?.find((row) => row.offer_id === descriptor.id);
    const financialGross = Number(financial?.gross_revenue_brl_minor);
    const summaryGross = Number(summary?.paid_revenue_brl_minor);
    const financialValid = validFinancialRevenue(financial);
    const summaryValid =
      summary &&
      /^\d+$/.test(summary.paid_revenue_brl_minor) &&
      Number.isSafeInteger(summaryGross) &&
      summaryGross >= 0 &&
      Number.isSafeInteger(summary.paid_orders) &&
      summary.paid_orders >= 0;
    if (financialValid || summaryValid) {
      group.totals.sales += financialValid ? financial.paid_orders : summary!.paid_orders;
      revenueMinor.set(
        key,
        (revenueMinor.get(key) ?? 0) + (financialValid ? financialGross : summaryGross),
      );
    } else {
      incompleteFinancialGroups.add(key);
    }

    for (const window of intradaySummary?.windows ?? []) {
      if (!window.available) continue;
      const current = group.intraday.get(window.label) ?? {
        label: window.label,
        metrics: emptyMetrics(),
      };
      addMetrics(current.metrics, window.metrics);
      group.intraday.set(window.label, current);
    }

    groups.set(key, group);
  });

  return [...groups.values()]
    .filter((group) => !incompleteFinancialGroups.has(group.key))
    .map((group) => {
      const offerIds = offers
        .filter(
          (offer) =>
            (scope === 'offer'
              ? offer.id
              : `${offer.ownerId}:${snapshots[offers.indexOf(offer)]?.offer.currency ?? offer.currency}`) ===
            group.key,
        )
        .map((offer) => offer.id);
      const finance = overviewFinancials(offerIds, finances);
      group.totals.revenue = (revenueMinor.get(group.key) ?? 0) / 100;
      const totals = computedMetrics(group.totals);
      const trackingComplete = !incompleteTrackingGroups.has(group.key);
      const pageViewConversion =
        trackingComplete && group.pageViews > 0 ? group.totals.sales / group.pageViews : null;
      if (!trackingComplete) {
        totals.conversionRate = null;
        totals.icCpa = null;
      }

      return {
        key: group.key,
        offerIds,
        finance,
        label: group.ownerName,
        currency: 'BRL',
        offerCount: group.offerNames.length,
        totals,
        clicks: group.clicks || group.fallbackClicks,
        pageViews: group.pageViews,
        conversionRate: pageViewConversion,
        daily: [...group.daily.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, metrics]) => ({
            key: date,
            label: shortDate(date),
            value: metrics.revenue,
            secondary: metrics.sales,
          })),
        intraday: [...group.intraday.values()].map((window) => ({
          key: window.label,
          label: window.label,
          value: window.metrics.revenue,
          secondary: window.metrics.sales,
        })),
      };
    });
}

/** Do not let a renderer fall back to another account when a whole group is missing. */
export function hasCompleteOverviewScope(offers: OfferDescriptor[], datasets: OverviewDataset[]) {
  const covered = new Set(datasets.flatMap((dataset) => dataset.offerIds ?? []));
  return offers.every((offer) => covered.has(offer.id));
}
