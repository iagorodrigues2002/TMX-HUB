'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { request } from '@/lib/api-client/request';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
export function OfferNiche({ offerId }: { offerId: string }) {
  const { user } = useAuth(),
    client = useQueryClient(),
    [draft, setDraft] = useState<string>();
  const key = ['creative-learning', user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      request<{ canManage: boolean; offers: { id: string; niche: string }[] }>(
        '/v1/meta-control/traffic/ai/creative-learning',
      ),
    retry: false,
  });
  const offer = query.data?.offers.find((o) => o.id === offerId);
  const save = useMutation({
    mutationFn: () =>
      request('/v1/meta-control/traffic/ai/creative-learning/niche', {
        method: 'PUT',
        body: { offerId, niche: draft ?? offer?.niche },
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: key }),
  });
  if (!offer) return null;
  return (
    <div className="space-y-2">
      <label htmlFor="offer-ai-niche" className="text-sm">
        Nicho da oferta
      </label>
      <div className="flex gap-2">
        <Input
          id="offer-ai-niche"
          value={draft ?? offer.niche}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={80}
          disabled={!query.data?.canManage}
          placeholder="Ex.: Renda extra"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!query.data?.canManage || save.isPending || !(draft ?? offer.niche).trim()}
          onClick={() => save.mutate()}
        >
          Salvar nicho
        </Button>
      </div>
      <small>Usado nas análises e nos roteiros da IA. Salvo para a empresa.</small>
      {save.isSuccess && <p role="status">Nicho salvo.</p>}
      {save.error && <p role="alert">{save.error.message}</p>}
    </div>
  );
}
