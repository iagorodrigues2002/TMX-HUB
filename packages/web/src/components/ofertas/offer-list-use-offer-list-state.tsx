'use client';

import { type OfferView, apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { type DateRange, rollingDateRange } from '@/lib/date-range';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useOfferListState() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [period, setPeriod] = useState(() => rollingDateRange(7));
  const { from, to } = period;
  const [showCreate, setShowCreate] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [dashboardId, setDashboardId] = useState('');
  const [utmifyLogin, setUtmifyLogin] = useState('');
  const [utmifyAccess, setUtmifyAccess] = useState(false);
  const [utmifyPassword, setUtmifyPassword] = useState('');
  const [editing, setEditing] = useState<OfferView | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [createAttempted, setCreateAttempted] = useState(false);
  const [filterPhase, setFilterPhase] = useState<'idle' | 'exiting' | 'waiting' | 'entering'>(
    'idle',
  );
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiClient.listUsers(),
    enabled: user?.role === 'admin',
  });

  const offersQuery = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    refetchInterval: 30_000,
  });
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', from, to],
    queryFn: () => apiClient.getDashboardSummary({ from, to }),
    refetchInterval: 60_000,
  });
  const offers = offersQuery.data ?? [];

  useEffect(() => {
    if (filterPhase !== 'waiting' || summaryQuery.isFetching) return;

    setFilterPhase('entering');
    filterTimerRef.current = setTimeout(() => setFilterPhase('idle'), 180);
  }, [filterPhase, summaryQuery.isFetching]);

  useEffect(
    () => () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    },
    [],
  );

  const changePeriod = (nextPeriod: DateRange) => {
    if (nextPeriod.from === from && nextPeriod.to === to) return;
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);

    setFilterPhase('exiting');
    filterTimerRef.current = setTimeout(() => {
      setPeriod(nextPeriod);
      setFilterPhase('waiting');
    }, 120);
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createOffer({
        company_name: companyName.trim(),
        name: name.trim(),
        utmify_access_enabled: utmifyAccess,
        ...(utmifyAccess
          ? {
              dashboard_id: dashboardId.trim(),
              utmify_login: utmifyLogin.trim(),
              utmify_password: utmifyPassword,
            }
          : {}),
        ...(user?.role === 'admin' ? { member_ids: memberIds } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowCreate(false);
      setCompanyName('');
      setName('');
      setDashboardId('');
      setUtmifyLogin('');
      setUtmifyPassword('');
      setMemberIds([]);
      setCreateAttempted(false);
      toast.success(
        utmifyAccess
          ? 'Oferta criada. A primeira sincronização já começou.'
          : 'Oferta criada sem acesso à dashboard UTMify.',
      );
      setUtmifyAccess(false);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteOffer(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Oferta removida.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => apiClient.syncOffer(id),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success(
        result.skipped
          ? 'A sincronização já estava em andamento.'
          : `${result.ads} ads atualizados${result.failedDays ? ` · ${result.failedDays} dia(s) com erro` : ''}.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const canCreate =
    companyName.trim() &&
    name.trim() &&
    (!utmifyAccess || (dashboardId.trim() && utmifyLogin.trim() && utmifyPassword));
  const createErrors = {
    companyName: companyName.trim() ? null : 'Informe o nome da empresa.',
    name: name.trim() ? null : 'Informe o nome da oferta.',
    dashboardId: !utmifyAccess || dashboardId.trim() ? null : 'Informe o ID da dashboard.',
    utmifyLogin: !utmifyAccess || utmifyLogin.trim() ? null : 'Informe o login da UTMify.',
    utmifyPassword: !utmifyAccess || utmifyPassword ? null : 'Informe a senha da UTMify.',
  };
  const summary = summaryQuery.data;
  const visibleSummaryOffers =
    summary?.accounts.reduce((total, account) => total + account.offers.length, 0) ?? 0;
  const animateSummaryContainer = visibleSummaryOffers > 20;
  const filterMotionClass =
    filterPhase === 'exiting' || filterPhase === 'waiting'
      ? 'opacity-0 transition-opacity duration-[120ms] ease-out motion-reduce:transition-none'
      : filterPhase === 'entering'
        ? 'animate-[tmx-tabs-content-in_180ms_ease-out_both] motion-reduce:animate-none'
        : '';
  return {
    user,
    period,
    showCreate,
    setShowCreate,
    companyName,
    setCompanyName,
    name,
    setName,
    dashboardId,
    setDashboardId,
    utmifyLogin,
    setUtmifyLogin,
    utmifyAccess,
    setUtmifyAccess,
    utmifyPassword,
    setUtmifyPassword,
    editing,
    setEditing,
    memberIds,
    setMemberIds,
    createAttempted,
    setCreateAttempted,
    usersQuery,
    offersQuery,
    summaryQuery,
    offers,
    changePeriod,
    createMut,
    deleteMut,
    syncMut,
    canCreate,
    createErrors,
    summary,
    animateSummaryContainer,
    filterMotionClass,
  };
}
