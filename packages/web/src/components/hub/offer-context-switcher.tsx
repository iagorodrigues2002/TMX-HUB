'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

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
    /^\/ofertas\/[^/]+$/.test(pathname) ||
    pathname === '/tracking' ||
    pathname === '/reembolsos' ||
    pathname === '/integracoes/syzepay'
  );
}

function groupOffersByCompany(offers: OfferView[]) {
  const groups = new Map<string, OfferView[]>();
  for (const offer of offers) {
    const company = offer.companyName?.trim() || 'Sem empresa';
    groups.set(company, [...(groups.get(company) ?? []), offer]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([company, companyOffers]) => ({
      company,
      offers: companyOffers.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    }));
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
  const currentOfferId = routeOfferId || queryOfferId || storedOfferId;
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
  const params = useSearchParams();
  const router = useRouter();
  const companyMode = pathname === '/integracoes/syzepay';
  const allowCompany =
    companyMode ||
    (pathname === '/tracking' &&
      params.get('view') === 'finance' &&
      params.get('section') === 'payments');
  const { offers, currentOfferId, isLoading, isError, retry, setCurrentOfferId } =
    useOfferContext();
  const [open, setOpen] = useState(false);
  const offersByCompany = useMemo(() => groupOffersByCompany(offers), [offers]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_OFFER_SWITCHER_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_OFFER_SWITCHER_EVENT, handleOpen);
  }, []);

  if (!isOfferContextPath(pathname)) return null;

  return (
    <div className="min-w-0">
      <Select
        open={open}
        onOpenChange={setOpen}
        value={
          companyMode
            ? `__company:${params.get('company') ?? offersByCompany[0]?.company ?? ''}`
            : currentOfferId || undefined
        }
        onValueChange={(value) => {
          if (value === '__retry') retry();
          else if (value.startsWith('__company:'))
            router.push(`/integracoes/syzepay?company=${encodeURIComponent(value.slice(10))}`);
          else if (companyMode)
            router.push(
              `/tracking?view=finance&section=payments&offer=${encodeURIComponent(value)}`,
            );
          else setCurrentOfferId(value);
        }}
        disabled={isLoading || (!isError && offers.length === 0)}
      >
        <SelectTrigger
          aria-label={allowCompany ? 'Selecionar oferta ou empresa' : 'Trocar oferta atual'}
          className="h-11 w-11 justify-center border-border/60 bg-muted/70 px-0 text-[13px] sm:h-9 sm:w-[min(30vw,240px)] sm:justify-between sm:px-3"
        >
          <Store className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="hidden min-w-0 items-center gap-2 sm:flex">
            <SelectValue
              placeholder={
                isLoading ? 'Carregando ofertas…' : isError ? 'Falha ao carregar' : 'Sem ofertas'
              }
            />
          </span>
          <span className="sr-only sm:hidden">Trocar oferta atual</span>
        </SelectTrigger>
        <SelectContent align="start" className="border-border/60">
          {isError && <SelectItem value="__retry">Tentar carregar novamente</SelectItem>}
          {offersByCompany.map((group) => (
            <SelectGroup key={group.company}>
              <SelectLabel>{group.company}</SelectLabel>
              {allowCompany && (
                <SelectItem value={`__company:${group.company}`}>
                  {group.company} · SyzePay geral
                </SelectItem>
              )}
              {group.offers.map((offer) => (
                <SelectItem key={offer.id} value={offer.id}>
                  {offer.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
