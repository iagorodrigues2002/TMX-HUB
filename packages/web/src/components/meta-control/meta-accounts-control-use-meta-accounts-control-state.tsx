'use client';

import { type MetaControlAccount, type MetaControlCampaign, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Filter } from './meta-accounts-control-support';

export function useMetaAccountsControlState() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [business, setBusiness] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [showPushcut, setShowPushcut] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [pushcutForm, setPushcutForm] = useState({
    secret: '',
    notification_name: '',
    devices: '',
    enabled: true,
  });
  const [connectionForm, setConnectionForm] = useState({
    name: 'Meta · TheMinex',
    app_id: '',
    app_secret: '',
    access_token: '',
  });

  const connections = useQuery({
    queryKey: ['meta-control-connections'],
    queryFn: () => apiClient.getMetaControlConnections(),
    refetchInterval: 15_000,
  });
  useEffect(() => {
    if (!selectedConnectionId && connections.data?.[0]) {
      setSelectedConnectionId(connections.data[0].id);
    }
  }, [connections.data, selectedConnectionId]);
  const selectedConnection =
    connections.data?.find((item) => item.id === selectedConnectionId) ?? null;
  const dashboard = useQuery({
    queryKey: ['meta-control-dashboard', selectedConnectionId],
    queryFn: () => apiClient.getMetaControlDashboard(selectedConnectionId),
    enabled: Boolean(selectedConnectionId),
    refetchInterval: 15_000,
  });
  const pushcutConfig = useQuery({
    queryKey: ['meta-payment-pushcut', selectedConnectionId],
    queryFn: () => apiClient.getMetaPaymentPushcut(selectedConnectionId),
    enabled: Boolean(selectedConnectionId),
  });
  useEffect(() => {
    if (!pushcutConfig.data) return;
    setPushcutForm({
      secret: '',
      notification_name: pushcutConfig.data.notification_name ?? '',
      devices: pushcutConfig.data.devices.join(', '),
      enabled: pushcutConfig.data.enabled,
    });
  }, [pushcutConfig.data]);
  const sync = useMutation({
    mutationFn: () => apiClient.syncMetaControl(selectedConnectionId),
    onSuccess: (result) => {
      toast.success(`${result.accounts} contas e ${result.campaigns} campanhas sincronizadas.`);
      void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['meta-control-connections'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha na sincronização.'),
  });
  const saveConnection = useMutation({
    mutationFn: () => apiClient.saveMetaControlConnection(connectionForm),
    onSuccess: (result) => {
      toast.success(
        result.syncing
          ? 'Dashboard conectado. Importando contas em segundo plano…'
          : result.warning
            ? `Conexão salva: ${result.warning}`
            : 'Conexão validada e salva.',
      );
      setShowConnection(false);
      setSelectedConnectionId(result.connection.id);
      setConnectionForm((current) => ({ ...current, app_secret: '', access_token: '' }));
      void queryClient.invalidateQueries({ queryKey: ['meta-control-connections'] });
      void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível conectar.'),
  });
  const savePushcut = useMutation({
    mutationFn: () =>
      apiClient.saveMetaPaymentPushcut(selectedConnectionId, {
        ...(pushcutForm.secret.trim() ? { secret: pushcutForm.secret.trim() } : {}),
        notification_name: pushcutForm.notification_name.trim(),
        devices: pushcutForm.devices
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        enabled: pushcutForm.enabled,
      }),
    onSuccess: () => {
      toast.success('Alerta de pagamento Pushcut salvo.');
      setPushcutForm((current) => ({ ...current, secret: '' }));
      void queryClient.invalidateQueries({
        queryKey: ['meta-payment-pushcut', selectedConnectionId],
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar o Pushcut.'),
  });
  const testPushcut = useMutation({
    mutationFn: () => apiClient.testMetaPaymentPushcut(selectedConnectionId),
    onSuccess: () => toast.success('Notificação de teste enviada ao Pushcut.'),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'O Pushcut recusou o teste.'),
  });
  const assignAccount = useMutation({
    mutationFn: ({ accountId, offerId }: { accountId: string; offerId: string | null }) =>
      apiClient.assignMetaAccountOffer(accountId, offerId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] }),
    onError: () => toast.error('Não foi possível associar a oferta.'),
  });
  const assignCampaign = useMutation({
    mutationFn: ({ campaignId, offerId }: { campaignId: string; offerId: string | null }) =>
      apiClient.assignMetaCampaignOffer(campaignId, offerId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] }),
    onError: () => toast.error('Não foi possível associar a campanha.'),
  });

  const accounts = dashboard.data?.accounts ?? [];
  const businesses = useMemo(
    () => [...new Set(accounts.map((account) => account.business_name ?? 'Sem BM'))].sort(),
    [accounts],
  );
  const businessStates = useMemo(() => {
    const grouped = new Map<string, MetaControlAccount[]>();
    for (const account of accounts) {
      if (!account.business_name) continue;
      grouped.set(account.business_name, [...(grouped.get(account.business_name) ?? []), account]);
    }
    return new Map(
      [...grouped.entries()].map(([name, items]) => [
        name,
        {
          usable: items.filter((item) => item.account_status === 1).length,
          total: items.length,
          off: !items.some((item) => item.account_status === 1),
        },
      ]),
    );
  }, [accounts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (filter !== 'all' && account.operational_state !== filter) return false;
      if (business !== 'all' && (account.business_name ?? 'Sem BM') !== business) return false;
      if (currency !== 'all' && account.currency !== currency) return false;
      if (
        term &&
        !`${account.name} ${account.external_id} ${account.business_name ?? ''} ${account.primary_offer_name ?? ''}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      return true;
    });
  }, [accounts, business, currency, filter, search]);
  const campaignsByAccount = useMemo(() => {
    const map = new Map<string, MetaControlCampaign[]>();
    for (const campaign of dashboard.data?.campaigns ?? []) {
      map.set(campaign.account_id, [...(map.get(campaign.account_id) ?? []), campaign]);
    }
    return map;
  }, [dashboard.data?.campaigns]);
  const counts = useMemo(
    () => ({
      delivering: accounts.filter((item) => item.operational_state === 'delivering').length,
      idle: accounts.filter((item) => item.operational_state === 'idle').length,
      disabled: accounts.filter((item) => item.operational_state === 'disabled').length,
      unsettled: accounts.filter((item) => item.operational_state === 'unsettled').length,
      attention: accounts.filter((item) => item.operational_state === 'attention').length,
    }),
    [accounts],
  );
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const account of accounts)
      out[account.currency] = (out[account.currency] ?? 0) + Number(account.amount_spent_minor);
    return out;
  }, [accounts]);
  return {
    filter,
    setFilter,
    search,
    setSearch,
    business,
    setBusiness,
    currency,
    setCurrency,
    expanded,
    setExpanded,
    showConnection,
    setShowConnection,
    showPushcut,
    setShowPushcut,
    selectedConnectionId,
    setSelectedConnectionId,
    pushcutForm,
    setPushcutForm,
    connectionForm,
    setConnectionForm,
    connections,
    selectedConnection,
    dashboard,
    pushcutConfig,
    sync,
    saveConnection,
    savePushcut,
    testPushcut,
    assignAccount,
    assignCampaign,
    accounts,
    businesses,
    businessStates,
    filtered,
    campaignsByAccount,
    counts,
    totals,
  };
}
