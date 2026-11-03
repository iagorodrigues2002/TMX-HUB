'use client';

import { companyApi } from '@/lib/api-client/endpoints-companies';
import { endpoints } from '@/lib/api-client/endpoints-offers';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ReserveReleaseProjection } from './reserve-release-projection';

export function FinanceReserve({ company }: { company?: string } = {}) {
  const { user } = useAuth();
  const [offerId, setOfferId] = useState('');
  const [salesView, setSalesView] = useState<'general' | 'natural'>('general');
  const offers = useQuery({
    queryKey: ['finance-offers', user?.id, company],
    queryFn: async () =>
      company ? (await companyApi.offers(company)).offers : endpoints.listOffers(),
    enabled: !!user,
  });
  const selected = (offers.data ?? []).filter((offer) => !offerId || offer.id === offerId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-4">
        <label className="grid gap-2 text-sm">
          Oferta
          <select
            className="rounded-lg border border-border bg-background p-2"
            value={offerId}
            onChange={(event) => setOfferId(event.target.value)}
          >
            <option value="">Todas as ofertas acessíveis</option>
            {(offers.data ?? []).map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          Vendas
          <select
            className="rounded-lg border border-border bg-background p-2"
            value={salesView}
            onChange={(event) =>
              setSalesView(event.target.value === 'natural' ? 'natural' : 'general')
            }
          >
            <option value="general">Todas</option>
            <option value="natural">Naturais</option>
          </select>
        </label>
      </div>
      {offers.isError ? (
        <p role="alert">Não foi possível carregar as ofertas. Tente novamente.</p>
      ) : offers.isPending ? (
        <output className="block">Carregando ofertas…</output>
      ) : !selected.length ? (
        <p>Nenhuma oferta disponível neste filtro.</p>
      ) : (
        <ReserveReleaseProjection
          offerIds={selected.map((offer) => offer.id)}
          salesView={salesView}
        />
      )}
    </div>
  );
}
