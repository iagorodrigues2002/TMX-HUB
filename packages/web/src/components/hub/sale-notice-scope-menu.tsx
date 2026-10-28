'use client';

import { DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { request } from '@/lib/api-client/request';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Preference = { scope: 'all' | 'own' };
export const saveSaleNoticeScope = (scope: Preference['scope']) =>
  request<Preference>('/v1/tracking/sale-notice-preferences', {
    method: 'PUT',
    body: { scope },
  });
export function SaleNoticeScopeMenu({ userId }: { userId: string }) {
  const client = useQueryClient();
  const key = ['sale-notice-preferences', userId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => request<Preference>('/v1/tracking/sale-notice-preferences'),
    staleTime: 15000,
    retry: false,
  });
  const change = useMutation({
    mutationFn: saveSaleNoticeScope,
    onSuccess: (data) => client.setQueryData(key, data),
  });
  return (
    <>
      <DropdownMenuCheckboxItem
        checked={query.data?.scope === 'all'}
        disabled={!query.data || query.isError || change.isPending}
        onSelect={(event) => event.preventDefault()}
        onCheckedChange={(checked) => change.mutate(checked ? 'all' : 'own')}
        className="min-h-11 cursor-pointer pr-3 text-[13px]"
      >
        Vendas de outras empresas
      </DropdownMenuCheckboxItem>
      <p className="px-3 pb-2 text-xs text-muted-foreground">
        Preferência só sua, inclusive no push. Desmarcado: apenas ofertas criadas pela sua conta.
      </p>
      {(query.isError || change.isError) && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          Não foi possível salvar ou consultar esta preferência. Tente novamente.
        </p>
      )}
    </>
  );
}
