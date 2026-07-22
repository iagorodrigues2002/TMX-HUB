'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type OfferStatus, type OfferView, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { STATUS_LIST, statusLabel } from './status-badge';
import { OfferMemberPicker } from './offer-member-picker';
import { useAuth } from '@/lib/auth-context';

interface Props {
  offer: OfferView;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

export function OfferEditDialog({ offer, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState(offer.name);
  const [companyName, setCompanyName] = useState(offer.companyName ?? '');
  const [description, setDescription] = useState(offer.description ?? '');
  const [dashboardId, setDashboardId] = useState(offer.dashboardId ?? '');
  const [status, setStatus] = useState<OfferStatus>(offer.status);
  const [utmifyLogin, setUtmifyLogin] = useState('');
  const [utmifyPassword, setUtmifyPassword] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>(offer.memberIds);
  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiClient.listUsers(),
    enabled: open && user?.role === 'admin',
  });

  useEffect(() => {
    if (!open) return;
    setName(offer.name);
    setCompanyName(offer.companyName ?? '');
    setDescription(offer.description ?? '');
    setDashboardId(offer.dashboardId ?? '');
    setStatus(offer.status);
    setUtmifyLogin('');
    setUtmifyPassword('');
    setMemberIds(offer.memberIds);
  }, [open, offer]);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.updateOffer(offer.id, {
        name: name.trim(),
        ...(companyName.trim() ? { company_name: companyName.trim() } : {}),
        description: description.trim(),
        dashboard_id: dashboardId.trim(),
        status,
        member_ids: memberIds,
        ...(utmifyLogin.trim() && utmifyPassword
          ? { utmify_login: utmifyLogin.trim(), utmify_password: utmifyPassword }
          : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void qc.invalidateQueries({ queryKey: ['offer-detail', offer.id] });
      toast.success('Oferta e acessos atualizados.');
      onOpenChange(false);
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar oferta</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <p className="hud-label">Identidade</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Empresa" htmlFor="of-company">
                <Input
                  id="of-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </Field>
              <Field label="Nome da oferta" htmlFor="of-name">
                <Input
                  id="of-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Status" htmlFor="of-status">
                <Select value={status} onValueChange={(value) => setStatus(value as OfferStatus)}>
                  <SelectTrigger id="of-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_LIST.map((item) => (
                      <SelectItem key={item} value={item}>
                        {statusLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Descrição" htmlFor="of-description">
                <Input
                  id="of-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Nicho, idioma ou observação"
                />
              </Field>
            </div>
          </section>

          {user?.role === 'admin' && (
            <OfferMemberPicker
              members={usersQuery.data ?? []}
              selected={memberIds}
              onChange={setMemberIds}
              loading={usersQuery.isLoading}
            />
          )}

          <section className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-4">
            <div>
              <p className="hud-label">Conexão UTMify</p>
              <p className="mt-1 text-[11px] text-white/45">
                {offer.utmifyConfigured
                  ? `Conectada como ${offer.utmifyLoginHint ?? 'usuário protegido'}. Preencha login e senha somente para trocar a conta.`
                  : 'Informe a conta que possui acesso à dashboard.'}
              </p>
            </div>
            <Field label="ID da dashboard" htmlFor="of-dashboard">
              <Input
                id="of-dashboard"
                value={dashboardId}
                onChange={(event) => setDashboardId(event.target.value)}
                className="font-mono text-[12px]"
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Novo login" htmlFor="of-login">
                <Input
                  id="of-login"
                  value={utmifyLogin}
                  onChange={(event) => setUtmifyLogin(event.target.value)}
                  autoComplete="username"
                />
              </Field>
              <Field label="Nova senha" htmlFor="of-password">
                <Input
                  id="of-password"
                  type="password"
                  value={utmifyPassword}
                  onChange={(event) => setUtmifyPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            {(offer.syncStatus === 'error' || offer.syncStatus === 'partial') && (
              <p className="rounded-md border border-red-300/20 bg-red-300/[0.04] p-3 text-[12px] text-red-200">
                {offer.lastSyncError}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !dashboardId.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Salvando…' : 'Salvar e sincronizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
