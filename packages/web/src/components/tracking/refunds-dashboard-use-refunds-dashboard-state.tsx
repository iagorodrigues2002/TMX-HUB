'use client';

import { apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ago, today } from './refunds-dashboard-support';
import './refunds-dashboard.css';

export function useRefundsDashboardState({
  initialOfferId = '',
}: {
  initialOfferId?: string;
}) {
  const workspace = useRef<HTMLDivElement>(null);
  const [from, setFrom] = useState(() => ago(29));
  const [to, setTo] = useState(today);
  const [offerId, setOfferId] = useState(initialOfferId);
  const [product, setProduct] = useState('');
  const [provider, setProvider] = useState('');
  const [vendepay, setVendepay] = useState<'' | 'mainex' | 'cobrak'>('');
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('day');
  const [page, setPage] = useState(1);
  const { isPrivate } = usePrivacy();
  const offers = useQuery({
    queryKey: ['offers'],
    queryFn: apiClient.listOffers,
    retry: false,
  });
  const report = useQuery({
    queryKey: ['refunds-dashboard', from, to, offerId, product, vendepay, provider, interval],
    queryFn: () =>
      apiClient.getRefundsDashboard(
        from,
        to,
        offerId || undefined,
        product || undefined,
        vendepay || undefined,
        { interval, provider: provider || undefined },
      ),
    retry: false,
  });
  const data = report.data;
  const hasData = Boolean(data);
  useEffect(() => {
    if (!hasData) return;
    const root = workspace.current;
    if (
      !root ||
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
    setFrom(a);
    setTo(b);
    setPage(1);
  };
  const currentPage = Math.min(page, Math.max(1, Math.ceil((data?.items.length ?? 0) / 50)));
  return {
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
  };
}
