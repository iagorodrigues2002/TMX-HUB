'use client';

import { apiClient } from '@/lib/api-client';
import { companyApi } from '@/lib/api-client/endpoints-companies';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/lib/motion-router';
import { usePrivacy } from '@/lib/privacy-context';
import {
  refundCompanyHref,
  refundOfferFilters,
  refundReportHref,
  refundRouteFilters,
} from '@/lib/refunds-navigation';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ago, today } from './refunds-dashboard-support';
import './refunds-dashboard.css';

export function useRefundsDashboardState() {
  const { user } = useAuth();
  const workspace = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedView = searchParams.get('sales_view');
  const salesView =
    selectedView === 'natural' || selectedView === 'assisted' ? selectedView : 'general';
  const setSalesView = (view: 'general' | 'natural' | 'assisted') => {
    const params = new URLSearchParams(currentSearch());
    params.set('sales_view', view);
    router.push(`/reembolsos?${params}`, { scroll: false });
    setPage(1);
  };
  const [defaultRange] = useState(() => ({ from: ago(29), to: today() }));
  const { from, to, offerId } = refundRouteFilters(searchParams, defaultRange);
  const companies = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: companyApi.list,
    enabled: !!user,
    retry: false,
  });
  // The server chooses only the user's single active membership, not every company
  // a global administrator is allowed to inspect in the selector.
  const requestedCompanyId = searchParams.get('company_id') ?? '';
  const setCompanyId = (next: string) => {
    router.push(refundCompanyHref(next, { from, to }, searchParams.toString()), { scroll: false });
  };
  const currentSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (companyId) params.set('company_id', companyId);
    return params.toString();
  };
  const offerScopeKey = `${requestedCompanyId}:${offerId}`;
  const [offerFilters, setOfferFilters] = useState({
    offerId: offerScopeKey,
    product: '',
    page: 1,
  });
  // Reset before querying, so a new offer never uses the previous offer's product.
  const { product, page } = refundOfferFilters(offerFilters, offerScopeKey);
  useEffect(() => {
    setOfferFilters((previous) => refundOfferFilters(previous, offerScopeKey));
  }, [offerScopeKey]);
  const setProduct = (product: string) =>
    setOfferFilters((previous) => ({
      ...refundOfferFilters(previous, offerScopeKey),
      product,
      page: 1,
    }));
  const setPage = (page: number) =>
    setOfferFilters((previous) => ({ ...refundOfferFilters(previous, offerScopeKey), page }));
  const setOfferId = (nextOfferId: string) => {
    router.push(refundReportHref(nextOfferId, { from, to }, currentSearch()), {
      scroll: false,
    });
  };
  const [provider, setProvider] = useState('');
  const [vendepay, setVendepay] = useState<'' | 'mainex' | 'cobrak'>('');
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');
  const { isPrivate } = usePrivacy();
  const offers = useQuery({
    queryKey: ['offers', user?.id],
    queryFn: apiClient.listOffers,
    enabled: !!user,
    retry: false,
  });
  const report = useQuery({
    queryKey: [
      'refunds-dashboard',
      user?.id,
      requestedCompanyId,
      from,
      to,
      offerId,
      product,
      vendepay,
      provider,
      interval,
      salesView,
    ],
    queryFn: () =>
      apiClient.getRefundsDashboard(
        from,
        to,
        offerId || undefined,
        product || undefined,
        vendepay || undefined,
        {
          interval,
          provider: provider || undefined,
          salesView,
          companyId: requestedCompanyId || undefined,
        },
      ),
    enabled: !!user,
    retry: false,
  });
  const data = report.data;
  const companyId = requestedCompanyId || data?.company_scope?.id || '';
  const companySelectionRequired = data?.company_scope?.selection_required ?? false;
  const scopedOffers =
    offers.data?.filter((offer) => data?.company_scope?.offer_ids.includes(offer.id)) ?? [];
  const hasData = Boolean(data);
  useEffect(() => {
    if (!hasData) return;
    const root = workspace.current;
    if (
      !root ||
      root.closest('[data-motion-coordinated="true"]') ||
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const panels = root.querySelectorAll<HTMLElement>('.refund-panel');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.reveal = 'visible';
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -24px 0px' },
    );
    for (const panel of panels) {
      if (panel.dataset.reveal === 'visible') continue;
      panel.dataset.reveal = 'pending';
      observer.observe(panel);
    }
    return () => {
      observer.disconnect();
      for (const panel of panels) panel.dataset.reveal = 'visible';
    };
  }, [hasData]);
  const range = (a: string, b: string) => {
    router.push(refundReportHref(offerId, { from: a, to: b }, currentSearch()), {
      scroll: false,
    });
    setPage(1);
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil((data?.items.length ?? 0) / 50)));
  return {
    salesView,
    setSalesView,
    workspace,
    from,
    to,
    offerId,
    setOfferId,
    product,
    setProduct,
    provider,
    setProvider,
    vendepay,
    setVendepay,
    interval,
    setInterval,
    setPage,
    isPrivate,
    offers,
    report,
    data,
    range,
    currentPage,
    companyId,
    setCompanyId,
    companies,
    companySelectionRequired,
    scopedOffers,
  };
}
