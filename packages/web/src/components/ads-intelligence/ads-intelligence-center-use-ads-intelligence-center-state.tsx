'use client';

import { apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { MetricKey } from './ads-intelligence-center-support';
import { importErrorPresentation } from './metric-presentation';

export function useAdsIntelligenceCenterState() {
  const id = useId();
  const qc = useQueryClient();
  const { isPrivate } = usePrivacy();
  const query = useQuery({
    queryKey: ['ads-intelligence'],
    queryFn: apiClient.getAdsIntelligence,
    refetchInterval: 60_000,
  });
  const [form, setForm] = useState({ login: '', password: '', dashboard_id: '' });
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState('');
  const [offer, setOffer] = useState('');
  const [sort, setSort] = useState<MetricKey>('roas');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => apiClient.saveAdsIntelligenceConnection(form),
    onSuccess: () => {
      setForm({ login: '', password: '', dashboard_id: '' });
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['ads-intelligence'] });
      toast.success('Conexão salva. A importação segue o agendamento semanal.');
    },
    onError: (e) => toast.error(e.message),
  });
  const mapping = useMutation({
    mutationFn: apiClient.mapAdsIntelligenceCampaign,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ads-intelligence'] });
      toast.success('Campanha vinculada à oferta.');
    },
    onError: (e) => toast.error(e.message),
  });
  const data = query.data;
  const importError = data?.connection?.error
    ? importErrorPresentation(data.connection.state, data.connection.error)
    : null;
  const companies = [
    ...new Set((data?.offers ?? []).map((o) => o.company_name || 'Sem empresa')),
  ].sort();
  const offers = (data?.offers ?? []).filter(
    (o) => !company || (o.company_name || 'Sem empresa') === company,
  );
  const batches = useMemo(
    () =>
      (data?.coverage?.to ? data.batches : [])
        .filter((b) => {
          const candidate = data?.offers.find((o) => o.id === b.offer_id);
          return (
            (!offer || b.offer_id === offer) &&
            (!company || (candidate?.company_name || 'Sem empresa') === company)
          );
        })
        .sort(
          (a, b) =>
            (b.totals[sort] ?? Number.NEGATIVE_INFINITY) -
              (a.totals[sort] ?? Number.NEGATIVE_INFINITY) ||
            a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
        ),
    [data, company, offer, sort],
  );
  return {
    id,
    isPrivate,
    query,
    form,
    setForm,
    editing,
    setEditing,
    company,
    setCompany,
    offer,
    setOffer,
    sort,
    setSort,
    mappings,
    setMappings,
    save,
    mapping,
    data,
    importError,
    companies,
    offers,
    batches,
  };
}
