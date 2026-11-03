'use client';

import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { request } from '@/lib/api-client/request';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type SaleNoticePreference = {
  offer_ids: string[];
  offers: { id: string; name: string; company: string }[];
};
export const getSaleNoticePreference = () =>
  request<SaleNoticePreference>('/v1/tracking/sale-notice-preferences');
export const saveSaleNoticeScope = (offer_ids: string[]) =>
  request<Pick<SaleNoticePreference, 'offer_ids'>>('/v1/tracking/sale-notice-preferences', {
    method: 'PUT',
    body: { offer_ids },
  });
export function SaleNoticeScopeMenu({ userId }: { userId: string }) {
  const client = useQueryClient();
  const key = ['sale-notice-preferences', userId];
  const query = useQuery({
    queryKey: key,
    queryFn: getSaleNoticePreference,
    staleTime: 15000,
    retry: false,
  });
  const change = useMutation({
    mutationFn: saveSaleNoticeScope,
    onSuccess: (data) => {
      client.setQueryData(key, { ...query.data, ...data });
      client.removeQueries({ queryKey: ['notification-center', userId], type: 'inactive' });
      void client.resetQueries({ queryKey: ['notification-center', userId] });
    },
  });
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-h-11 text-[13px]">
        Notificações por oferta
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-[65vh] w-80 max-w-[85vw] overflow-y-auto">
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Escolha suas notificações de venda, som e push. Não altera permissões nem avisos de
            outras pessoas. Novas ofertas precisarão ser selecionadas após salvar.
          </p>
          <DropdownMenuItem
            disabled={!query.data || query.isError || change.isPending}
            onSelect={(e) => {
              e.preventDefault();
              change.mutate(query.data!.offers.map((o) => o.id));
            }}
          >
            Ativar todas as ofertas disponíveis
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!query.data || query.isError || change.isPending}
            onSelect={(e) => {
              e.preventDefault();
              change.mutate([]);
            }}
          >
            Desativar todas
          </DropdownMenuItem>
          {query.isPending && <output className="block p-3 text-sm">Carregando ofertas…</output>}
          {query.data?.offers.map((offer) => (
            <DropdownMenuCheckboxItem
              key={offer.id}
              checked={query.data!.offer_ids.includes(offer.id)}
              disabled={change.isPending}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) =>
                change.mutate(
                  checked
                    ? [...query.data!.offer_ids, offer.id]
                    : query.data!.offer_ids.filter((id) => id !== offer.id),
                )
              }
              className="min-h-11 text-[13px]"
            >
              <span>
                {offer.name}
                {offer.company && (
                  <span className="block text-xs text-muted-foreground">{offer.company}</span>
                )}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          {query.data?.offers.length === 0 && (
            <p className="p-3 text-sm">Nenhuma oferta autorizada.</p>
          )}
          {change.isSuccess && (
            <output className="block px-3 py-2 text-xs text-muted-foreground">
              Preferências salvas somente para você.
            </output>
          )}
          {(query.isError || change.isError) && (
            <p role="alert" className="px-3 pb-2 text-xs text-destructive">
              Não foi possível salvar ou consultar esta preferência. Tente novamente.
            </p>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
