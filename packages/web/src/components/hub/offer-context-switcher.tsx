'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

const OFFER_STORAGE_KEY = 'tmx-ui.offer.current';
export const OPEN_OFFER_SWITCHER_EVENT = 'tmx-ui.offer-switcher.open';

interface OfferContextValue {
  offers: OfferView[];
  currentOffer: OfferView | null;
  currentOfferId: string;
  setCurrentOfferId: (offerId: string) => void;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

const OfferContext = createContext<OfferContextValue | null>(null);

export function isOfferContextPath(pathname: string) {
  return (
    /^\/ofertas\/[^/]+$/.test(pathname) || pathname === '/tracking' || pathname === '/reembolsos'
  );
}

function offerLabel(offer: OfferView) {
  return offer.companyName ? `${offer.name} · ${offer.companyName}` : offer.name;
}

export function OfferContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [storedOfferId, setStoredOfferId] = useState('');
  const offersQuery = useQuery({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    enabled: isOfferContextPath(pathname),
  });

  const routeOfferId = /^\/ofertas\/([^/]+)$/.exec(pathname)?.[1];
  const queryOfferId = searchParams.get('offer') ?? '';
  const offers = offersQuery.data ?? [];
  const currentOfferId = routeOfferId ?? queryOfferId ?? storedOfferId;
  const resolvedOfferId = offers.some((offer) => offer.id === currentOfferId)
    ? currentOfferId
    : (offers[0]?.id ?? currentOfferId);

  useEffect(() => {
    setStoredOfferId(window.localStorage.getItem(OFFER_STORAGE_KEY) ?? '');
  }, []);

  useEffect(() => {
    if (!resolvedOfferId) return;
    setStoredOfferId(resolvedOfferId);
    window.localStorage.setItem(OFFER_STORAGE_KEY, resolvedOfferId);
  }, [resolvedOfferId]);

  const setCurrentOfferId = (offerId: string) => {
    setStoredOfferId(offerId);
    window.localStorage.setItem(OFFER_STORAGE_KEY, offerId);

    if (/^\/ofertas\/[^/]+$/.test(pathname)) {
      router.push(`/ofertas/${offerId}`);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('offer', offerId);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const value: OfferContextValue = {
    offers,
    currentOffer: offers.find((offer) => offer.id === resolvedOfferId) ?? null,
    currentOfferId: resolvedOfferId,
    setCurrentOfferId,
    isLoading: offersQuery.isLoading,
    isError: offersQuery.isError,
    retry: () => void offersQuery.refetch(),
  };

  return <OfferContext value={value}>{children}</OfferContext>;
}

export function useOfferContext() {
  const context = useContext(OfferContext);
  if (!context) throw new Error('useOfferContext must be used inside OfferContextProvider');
  return context;
}

export function OfferContextSwitcher() {
  const pathname = usePathname();
  const { offers, currentOfferId, isLoading, isError, retry, setCurrentOfferId } =
    useOfferContext();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_OFFER_SWITCHER_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_OFFER_SWITCHER_EVENT, handleOpen);
  }, []);

  if (!isOfferContextPath(pathname)) return null;

  return (
    <div className="hidden min-w-0 sm:block">
      <Select
        open={open}
        onOpenChange={setOpen}
        value={currentOfferId || undefined}
        onValueChange={(value) => (value === '__retry' ? retry() : setCurrentOfferId(value))}
        disabled={isLoading || (!isError && offers.length === 0)}
      >
        <SelectTrigger
          aria-label="Trocar oferta atual"
          className="h-9 w-[min(30vw,240px)] border-border/60 bg-muted/70 px-3 text-[13px]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Store className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <SelectValue
              placeholder={
                isLoading ? 'Carregando ofertas…' : isError ? 'Falha ao carregar' : 'Sem ofertas'
              }
            />
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="border-border/60">
          {isError && <SelectItem value="__retry">Tentar carregar novamente</SelectItem>}
          {offers.map((offer) => (
            <SelectItem key={offer.id} value={offer.id}>
              {offerLabel(offer)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
