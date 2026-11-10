'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import type { PushcutProfile, PushcutProfileInput } from '@/lib/api-client/endpoints-pushcut';
import { useAuth } from '@/lib/auth-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Pencil, Plus, UserRound } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

const kinds = ['front', 'upsell', ...Array.from({ length: 19 }, (_, i) => `upsell_${i + 2}`)];
function emptyProfile(offerId: string): PushcutProfileInput {
  return {
    name: '',
    secret: '',
    front_notification_name: '',
    upsell_notification_name: null,
    devices: [],
    offer_ids: [offerId],
    order_kinds: ['front'],
    show_amount: true,
    enabled: true,
  };
}

export function PushcutProfiles({ offerId }: { offerId: string }) {
  const formId = useId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['pushcut-profiles', user?.id, offerId],
    queryFn: () => apiClient.getPushcutProfiles(offerId),
    retry: false,
  });
  const legacy = useQuery({
    queryKey: ['tracking-pushcut-destinations', offerId],
    queryFn: () => apiClient.getTrackingPushcutDestinations(offerId),
  });
  const [draft, setDraft] = useState<PushcutProfileInput | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [devices, setDevices] = useState('');
  const save = useMutation({
    mutationFn: () =>
      apiClient.savePushcutProfile(
        offerId,
        {
          ...draft!,
          secret: draft!.secret?.trim() || undefined,
          devices: devices
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        },
        editingId,
      ),
    onSuccess: () => {
      setDraft(null);
      setEditingId(undefined);
      void qc.invalidateQueries({ queryKey: ['pushcut-profiles'] });
      void qc.invalidateQueries({ queryKey: ['tracking-pushcut-destinations'] });
      toast.success('Perfil salvo. As próximas vendas seguem suas preferências.');
    },
    onError: (error) => toast.error(error.message),
  });
  const open = (profile?: PushcutProfile) => {
    setEditingId(profile?.id);
    setDraft(profile ? { ...profile, secret: '' } : emptyProfile(offerId));
    setDevices(profile?.devices.join(', ') ?? '');
  };
  const toggle = (field: 'offer_ids' | 'order_kinds', value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [field]: draft[field].includes(value)
        ? draft[field].filter((v) => v !== value)
        : [...draft[field], value],
    });
  };
  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Uma configuração por pessoa. Escolha as ofertas e os alertas.
        </p>
        <Button
          onClick={() => open()}
          disabled={save.isPending || query.isLoading || query.isError}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo perfil
        </Button>
      </div>
      {query.isLoading && (
        <output className="text-sm text-muted-foreground">Carregando perfis…</output>
      )}
      {query.isError && (
        <div role="alert" className="rounded-md border border-danger p-4 text-sm">
          Não foi possível carregar os perfis.{' '}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {(query.data?.profiles ?? []).map((profile) => (
          <article
            key={profile.id}
            className="glass-card rounded-xl border border-border bg-accent/40 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <UserRound className="h-5 w-5 text-primary" />
                <h3 className="font-medium">{profile.name}</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => open(profile)}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {profile.enabled ? 'Ativo' : 'Pausado'} · {profile.offer_ids.length} oferta(s) ·{' '}
              {profile.show_amount ? 'Com valor' : 'Valor oculto'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.order_kinds.map((kind) => (
                <span key={kind} className="rounded-md border border-border px-2 py-1 text-xs">
                  {kind === 'front'
                    ? 'Front'
                    : kind === 'upsell'
                      ? 'Upsell 1'
                      : `Upsell ${kind.slice(7)}`}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      {!query.isLoading && !query.isError && !query.data?.profiles.length && (
        <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          Cadastre um destinatário ou aproveite uma configuração existente abaixo.
        </p>
      )}
      {!draft &&
        (legacy.data?.destinations ?? [])
          .filter((d) => !d.profile_id)
          .map((d) => (
            <div
              key={d.id}
              className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <p className="text-sm font-medium">{d.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configuração atual desta oferta
                </p>
              </div>
              <Button
                variant="outline"
                disabled={query.isError || query.isLoading}
                onClick={() => {
                  open();
                  setDraft({
                    ...emptyProfile(offerId),
                    name: d.name,
                    secret: '',
                    source_destination_id: d.id,
                    front_notification_name: d.front_notification_name,
                    upsell_notification_name: d.upsell_notification_name,
                    devices: d.devices,
                    enabled: d.enabled,
                    order_kinds: d.upsell_notification_name ? kinds : ['front'],
                  });
                  setDevices(d.devices.join(', '));
                }}
              >
                Usar como perfil salvo
              </Button>
            </div>
          ))}
      {draft && (
        <form
          className="glass-card space-y-5 rounded-xl border border-primary/30 bg-accent/30 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h3 className="flex items-center gap-2 font-medium">
            <Bell className="h-4 w-4 text-primary" />
            {editingId ? 'Editar perfil' : 'Novo perfil'}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor={`${formId}-name`} className="space-y-2 text-xs">
              Destinatário
              <Input
                id={`${formId}-name`}
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="iPhone do Iago"
              />
            </label>
            <label htmlFor={`${formId}-secret`} className="space-y-2 text-xs">
              Secret do Pushcut
              <Input
                id={`${formId}-secret`}
                type="password"
                autoComplete="new-password"
                required={!editingId && !draft.source_destination_id}
                value={draft.secret ?? ''}
                onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
                placeholder={
                  editingId || draft.source_destination_id
                    ? 'Salvo · preencha apenas para trocar'
                    : 'Credencial da conta'
                }
              />
            </label>
            <label htmlFor={`${formId}-front`} className="space-y-2 text-xs">
              Notificação de front
              <Input
                id={`${formId}-front`}
                required={draft.order_kinds.includes('front')}
                value={draft.front_notification_name}
                onChange={(e) => setDraft({ ...draft, front_notification_name: e.target.value })}
                placeholder="Venda Aprovada"
              />
            </label>
            <label htmlFor={`${formId}-upsell`} className="space-y-2 text-xs">
              Notificação de upsell
              <Input
                id={`${formId}-upsell`}
                required={draft.order_kinds.some((kind) => kind !== 'front')}
                value={draft.upsell_notification_name ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, upsell_notification_name: e.target.value || null })
                }
                placeholder="Upsell Aprovado"
              />
            </label>
            <label htmlFor={`${formId}-devices`} className="space-y-2 text-xs sm:col-span-2">
              Dispositivos · opcional
              <Input
                id={`${formId}-devices`}
                value={devices}
                onChange={(e) => setDevices(e.target.value)}
                placeholder="Nomes separados por vírgula; vazio envia para todos"
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Ofertas que notificam essa pessoa</legend>
            <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
              {(query.data?.offers ?? []).map((offer) => (
                <label
                  key={offer.id}
                  htmlFor={`${formId}-offer-${offer.id}`}
                  className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <Checkbox
                    id={`${formId}-offer-${offer.id}`}
                    checked={draft.offer_ids.includes(offer.id)}
                    onChange={() => toggle('offer_ids', offer.id)}
                  />
                  {offer.name}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Desmarcar uma oferta interrompe seus próximos alertas.
            </p>
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">Quais vendas avisar</legend>
            <div className="flex flex-wrap gap-2">
              {kinds.slice(0, 6).map((kind) => (
                <label
                  key={kind}
                  htmlFor={`${formId}-kind-${kind}`}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    id={`${formId}-kind-${kind}`}
                    checked={draft.order_kinds.includes(kind)}
                    onChange={() => toggle('order_kinds', kind)}
                  />
                  {kind === 'front'
                    ? 'Front'
                    : kind === 'upsell'
                      ? 'Upsell 1'
                      : `Upsell ${kind.slice(7)}`}
                </label>
              ))}
            </div>
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Outros estágios de upsell
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {kinds.slice(6).map((kind) => (
                  <label
                    key={kind}
                    htmlFor={`${formId}-kind-${kind}`}
                    className="flex items-center gap-2 rounded-md border border-border p-2"
                  >
                    <Checkbox
                      id={`${formId}-kind-${kind}`}
                      checked={draft.order_kinds.includes(kind)}
                      onChange={() => toggle('order_kinds', kind)}
                    />
                    Upsell {kind.slice(7)}
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
          <div className="flex flex-wrap items-center gap-5">
            <label htmlFor={`${formId}-amount`} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${formId}-amount`}
                checked={draft.show_amount}
                onChange={(e) => setDraft({ ...draft, show_amount: e.target.checked })}
              />
              Mostrar valor da venda
            </label>
            <div className="w-40">
              <Select
                value={draft.enabled ? 'active' : 'paused'}
                onValueChange={(v) => setDraft({ ...draft, enabled: v === 'active' })}
              >
                <SelectTrigger aria-label="Status do perfil">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending || !draft.order_kinds.length}>
              {save.isPending ? 'Salvando…' : 'Salvar perfil'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
