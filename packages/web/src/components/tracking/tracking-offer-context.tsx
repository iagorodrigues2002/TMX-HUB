'use client';

import { type OfferView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { TRACKING_DASHBOARD_STALE_TIME } from './tracking-query';

const TRACKING_OFFER_STORAGE_KEY = 'tmx-ui.tracking.offer';

interface TrackingOfferContextValue {
  offers: OfferView[];
  activeOffer: OfferView | null;
  activeOfferId: string;
  setActiveOfferId: (offerId: string) => void;
  canManage: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
}

const TrackingOfferContext = createContext<TrackingOfferContextValue | null>(null);

export function TrackingOfferProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [storedOfferId, setStoredOfferId] = useState('');
  const [hasReadStoredOffer, setHasReadStoredOffer] = useState(false);
  const offersQuery = useQuery({
    queryKey: ['tracking-offers'],
    queryFn: () => apiClient.listOffers(),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const offers = offersQuery.data ?? [];
  const requestedOfferId = searchParams.get('offer') ?? '';
  const preferredOfferId = requestedOfferId || storedOfferId;
  const canResolveOffer = Boolean(requestedOfferId) || hasReadStoredOffer;
  const activeOffer = canResolveOffer
    ? (offers.find((offer) => offer.id === preferredOfferId) ?? offers[0] ?? null)
    : null;

  useEffect(() => {
    setStoredOfferId(window.localStorage.getItem(TRACKING_OFFER_STORAGE_KEY) ?? '');
    setHasReadStoredOffer(true);
  }, []);

  const persistOffer = useCallback((offerId: string) => {
    setStoredOfferId(offerId);
    if (offerId) window.localStorage.setItem(TRACKING_OFFER_STORAGE_KEY, offerId);
    else window.localStorage.removeItem(TRACKING_OFFER_STORAGE_KEY);
  }, []);

  const writeOfferToUrl = useCallback(
    (offerId: string) => {
      persistOffer(offerId);
      const next = new URLSearchParams(searchParams.toString());
      if (offerId) next.set('offer', offerId);
      else next.delete('offer');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, persistOffer, router, searchParams],
  );

  useEffect(() => {
    if (activeOffer && storedOfferId !== activeOffer.id) {
      persistOffer(activeOffer.id);
    }
  }, [activeOffer, persistOffer, storedOfferId]);

  useEffect(() => {
    if (activeOffer && requestedOfferId !== activeOffer.id) {
      writeOfferToUrl(activeOffer.id);
    }
  }, [activeOffer, requestedOfferId, writeOfferToUrl]);

  const value: TrackingOfferContextValue = {
    offers,
    activeOffer,
    activeOfferId: activeOffer?.id ?? '',
    setActiveOfferId: writeOfferToUrl,
    canManage: Boolean(activeOffer?.canConfigureTracking),
    isLoading: offersQuery.isLoading || (!requestedOfferId && !hasReadStoredOffer),
    isError: offersQuery.isError,
    isFetching: offersQuery.isFetching,
    refetch: () => {
      void offersQuery.refetch();
    },
  };

  return <TrackingOfferContext value={value}>{children}</TrackingOfferContext>;
}

export function useTrackingOffer() {
  const context = useContext(TrackingOfferContext);
  if (!context) {
    throw new Error('useTrackingOffer deve ser usado dentro de TrackingOfferProvider.');
  }
  return context;
}
