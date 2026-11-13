'use client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { publicLibraryState } from '@/lib/spy-library-store';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SpyOffer } from './spy-model';
export type LibraryView = ReturnType<typeof publicLibraryState> & { workerRunning: boolean };
export type LibraryViewJob = LibraryView['jobs'][string];
export const libraryErrorText: Record<string, string> = {
  daily_budget:
    'Limite diário atingido. Histórico preservado; novas tentativas automáticas após a virada do dia.',
  access_required: 'O provedor não autorizou esta consulta.',
  token_expired: 'A credencial da Library expirou ou foi revogada.',
  rate_limited: 'Limite temporário do provedor. Nova tentativa programada.',
  unavailable: 'O provedor não concluiu a consulta. Histórico preservado.',
  credits_exhausted:
    'Limite de teste ou créditos esgotados. Monitor pausado; histórico preservado.',
  incomplete: 'Leitura incompleta. A contagem anterior foi preservada.',
  invalid_source: 'Revise o link da Library e o tamanho da busca.',
  invalid_query: 'O provedor não aceitou a consulta. Confira os filtros.',
  cycle_incomplete: 'O ciclo terminou sem todas as leituras válidas.',
};
export const libraryStatusText: Record<string, string> = {
  prepared: 'Preparado · consultas pagas bloqueadas',
  waiting: 'Na fila',
  source_missing: 'Sem fonte válida',
  credentials_required: 'Credencial pendente',
  collecting: 'Consultando Library',
  blocked: 'Consulta bloqueada',
  active: 'Acompanhando',
  paused: 'Sem acompanhamento',
  complete: '7 dias concluídos',
  incomplete: 'Ciclo incompleto',
};
export function useSpyLibrary(offers: SpyOffer[], ready: boolean, scope = '') {
  const { user } = useAuth();
  const client = useQueryClient();
  const params = useSearchParams();
  const fixture =
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' &&
    params.get('fixture') === 'page-history';
  const fixtureQuery = fixture ? `?fixture=page-history&day=${params.get('day') ?? '0'}` : '';
  const [error, setError] = useState('');
  const queryKey = ['spy-library', user?.id, fixtureQuery, scope];
  const status = useQuery({
    queryKey,
    queryFn: () => request<LibraryView>(`/api/spy-library${fixtureQuery}`),
    enabled: ready && !!user,
    retry: false,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchInterval: 60000,
  });
  const payload = JSON.stringify({
    catalog: offers,
    offers: offers.map((o) => ({
      id: o.id,
      name: o.name,
      ownerId: o.ownerId ?? null,
      domains: o.domains,
      sources: o.links.filter((l) => l.kind === 'library').map((l) => l.url),
    })),
  });
  useEffect(() => {
    if (
      !ready ||
      user?.role !== 'admin' ||
      fixture ||
      process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic'
    )
      return;
    let alive = true;
    void request('/api/spy-library', {
      method: 'POST',
      body: { action: 'enroll', ...JSON.parse(payload) },
    })
      .then(() => {
        if (alive) {
          setError('');
          void client.invalidateQueries({ queryKey: ['spy-library', user.id] });
        }
      })
      .catch(() => {
        if (alive) setError('Não foi possível registrar as fontes no monitor local.');
      });
    return () => {
      alive = false;
    };
  }, [payload, ready, user?.id, user?.role, client, fixture]);
  const action = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (fixture) throw Error('Teste simulado não altera o monitor real.');
      return request<LibraryView>('/api/spy-library', { method: 'POST', body });
    },
    onSuccess: (data) => {
      setError('');
      // The mutation already returns the saved state; don't block every button on a second GET.
      client.setQueryData(queryKey, data);
    },
    onError: () => {
      setError('Não foi possível concluir. Confira o diagnóstico e tente novamente.');
      void client.invalidateQueries({ queryKey });
    },
  });
  return { status, action, error };
}
export type SpyLibrary = ReturnType<typeof useSpyLibrary>;
