'use client';

import { apiClient } from '@/lib/api-client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type ImportedInventory, type Inventory, mergeImportedInventory } from './traffic-model';

export function useTrafficInventory(enabled: boolean) {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<Inventory>(() => ({ bms: [], accounts: [] }));
  const [inventoryOwner, setInventoryOwner] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [origin, setOrigin] = useState<'pending' | 'meta'>('pending');
  const personal = useQuery({
    queryKey: ['traffic-user-connection', user?.id],
    queryFn: () =>
      request<{ connected: boolean; id?: string }>('/v1/meta-control/traffic/connection'),
    enabled: !!user,
    retry: false,
    refetchInterval: 3000,
  });
  const isPersonal = personal.data?.connected === true;
  const inventoryConnection = isPersonal ? personal.data?.id : 'local-import';
  const connections = useQuery({
    queryKey: ['traffic-meta-connections', user?.id],
    queryFn: () => apiClient.getMetaControlConnections(),
    enabled: false,
    retry: false,
    staleTime: 30_000,
  });
  const local = useQuery({
    queryKey: ['traffic-local-inventory', user?.id, personal.data?.id ?? 'legacy'],
    queryFn: () =>
      request<ImportedInventory>(
        isPersonal
          ? '/v1/meta-control/traffic/connection/inventory'
          : '/v1/meta-control/inventory?connection_id=local-import',
      ),
    enabled:
      enabled &&
      (isPersonal ||
        (user?.id === 'admin' && process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic')),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    if (!local.data || !inventoryConnection) return;
    let previous: Inventory = { bms: [], accounts: [] };
    try {
      previous = JSON.parse(
        localStorage.getItem(`tmx:traffic-inventory:${user?.id}`) ?? '{"bms":[],"accounts":[]}',
      );
    } catch {}
    setInventory(mergeImportedInventory(previous, local.data, inventoryConnection));
    setInventoryOwner(user?.id ?? '');
    setFetchedAt(local.data.fetchedAt);
    setOrigin('meta');
  }, [local.data, inventoryConnection, user?.id]);
  function saveInventory(next: Inventory) {
    setInventory(next);
    try {
      localStorage.setItem(`tmx:traffic-inventory:${user?.id}`, JSON.stringify(next));
    } catch {}
  }
  async function importAssets(id = connectionId) {
    if (
      busy ||
      user?.role !== 'admin' ||
      !connections.data?.some((item) => item.id === id && item.enabled)
    )
      return;
    setConnectionId(id);
    setBusy(true);
    setError('');
    try {
      const data = await request<ImportedInventory>(
        `/v1/meta-control/inventory?${new URLSearchParams({ connection_id: id })}`,
      );
      setInventory((current) => mergeImportedInventory(current, data, id));
      setFetchedAt(data.fetchedAt);
      setOrigin('meta');
    } catch {
      setError(
        'Não foi possível importar os ativos. Confira a conexão e as permissões. O inventário anterior foi preservado.',
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    inventory: inventoryOwner === user?.id ? inventory : { bms: [], accounts: [] },
    setInventory: saveInventory,
    userId: user?.id ?? '',
    connections,
    connectionId,
    busy,
    error,
    fetchedAt,
    origin,
    importAssets,
    canImport: user?.role === 'admin',
  };
}
