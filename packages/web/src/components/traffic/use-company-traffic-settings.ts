'use client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { migrateTrafficSettings } from './migrate-traffic-settings';

type Settings<T> = { companyId: string; revision: string; value: T | null };
export function useCompanyTrafficSettings<T>(section: 'classification' | 'inventory' | 'structure', enabled: boolean) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['traffic-company-settings', user?.id, section];
  const query = useQuery({
    queryKey,
    queryFn: () => request<Settings<T>>(`/v1/meta-control/traffic/settings/${section}`),
    enabled: enabled && !!user,
    retry: false,
    refetchInterval: 30000,
  });
  const imported = useRef('');
  useEffect(() => {
    if (!enabled || !query.data || query.data.value !== null || user?.role !== 'admin') return;
    const attempt = `${user.id}:${query.data.companyId}:${section}`;
    if (imported.current === attempt) return;
    imported.current = attempt;
    try {
      const raw = localStorage.getItem(`tmx:traffic-${section}:${user.id}`);
      if (!raw) return;
      const value = migrateTrafficSettings(section, raw, query.data.companyId);
      const populated = section === 'structure' ? value.length > 0 :
        section === 'inventory' ? value.bms?.length || value.accounts?.length :
        Object.keys(value.campaigns ?? {}).length || Object.keys(value.links ?? {}).length;
      if (populated) void save(value).catch(() => { /* Preserve the local copy if another member saved first. */ });
    } catch { /* Invalid legacy state is never imported. */ }
  }, [enabled, query.data, user?.id, user?.role, section]);
  async function save(value: T) {
    if (!query.data) throw Error('Aguarde o carregamento da configuração da empresa.');
    try {
      const result = await request<Settings<T>>(`/v1/meta-control/traffic/settings/${section}`, {
        method: 'PUT', body: { revision: query.data.revision, value },
      });
      client.setQueryData(queryKey, result);
      return result;
    } catch (error) {
      await query.refetch();
      throw error;
    }
  }
  return { ...query, save };
}
