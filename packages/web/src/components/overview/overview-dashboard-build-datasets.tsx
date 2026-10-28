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
  shortDate,
} from './overview-dashboard-support';

export function buildDatasets(
  scope: OverviewDashboardProps['scope'],
  offers: OfferDescriptor[],
  snapshots: Array<OfferSnapshotsView | undefined>,
  summaries: Array<TrackingSummaryView | undefined>,
  intraday: Array<IntradayRangeSummaryView | undefined>,
  finances: TrackingOverviewOffer[] | undefined,
): OverviewDataset[] {
  const groups = new Map<string, DatasetAccumulator>();

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
      group.totals.sales += summary.paid_orders;
      group.totals.revenue += Number(summary.paid_revenue_brl_minor) / 100;
      group.totals.ic += summary.checkout_events;
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

  return [...groups.values()].map((group) => {
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
    const totals = computedMetrics(group.totals);
    const pageViewConversion = group.pageViews > 0 ? group.totals.sales / group.pageViews : null;

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
