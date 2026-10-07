'use client';

import { type OfferView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, createContext, useCallback, useContext, useEffect } from 'react';

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
  const offersQuery = useQuery({
    queryKey: ['tracking-offers'],
    queryFn: () => apiClient.listOffers(),
    retry: false,
  });
  const offers = offersQuery.data ?? [];
  const requestedOfferId = searchParams.get('offer') ?? '';
  const activeOffer = offers.find((offer) => offer.id === requestedOfferId) ?? offers[0] ?? null;

  const writeOfferToUrl = useCallback(
    (offerId: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (offerId) next.set('offer', offerId);
      else next.delete('offer');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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
    isLoading: offersQuery.isLoading,
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
