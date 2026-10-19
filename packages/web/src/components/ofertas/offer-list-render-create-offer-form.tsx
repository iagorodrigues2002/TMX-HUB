'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import type { useOfferListState } from './offer-list-use-offer-list-state';
import { OfferMemberPicker } from './offer-member-picker';

export function renderCreateOfferForm({
  user,
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
  memberIds,
  setMemberIds,
  createAttempted,
  setCreateAttempted,
  usersQuery,
  createMut,
  canCreate,
  createErrors,
}: Pick<
  ReturnType<typeof useOfferListState>,
  | 'user'
  | 'companyName'
  | 'setCompanyName'
  | 'name'
  | 'setName'
  | 'dashboardId'
  | 'setDashboardId'
  | 'utmifyLogin'
  | 'setUtmifyLogin'
  | 'utmifyAccess'
  | 'setUtmifyAccess'
  | 'utmifyPassword'
  | 'setUtmifyPassword'
  | 'memberIds'
  | 'setMemberIds'
  | 'createAttempted'
  | 'setCreateAttempted'
  | 'usersQuery'
  | 'createMut'
  | 'canCreate'
  | 'createErrors'
>) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setCreateAttempted(true);
        if (canCreate) createMut.mutate();
      }}
      className="glass-card space-y-4 p-5"
    >
      <div>
        <p className="hud-label">Nova conexão UTMify</p>
        <p className="mt-1 text-[12px] text-white/45">
          Login e senha ficam criptografados no backend e nunca retornam para o navegador.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          id="offer-company"
          label="Empresa"
          error={createAttempted ? createErrors.companyName : null}
        >
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ex: Empresa 1"
          />
        </FormField>
        <FormField
          id="offer-name"
          label="Nome da oferta"
          error={createAttempted ? createErrors.name : null}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: PFL Brasil"
          />
        </FormField>
        <label className="col-span-full flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm">
          <input
            type="checkbox"
            aria-label="Permitir acesso à dashboard UTMify"
            checked={utmifyAccess}
            onChange={(e) => setUtmifyAccess(e.target.checked)}
            className="mt-1"
          />
          <span>
            Permitir acesso à dashboard UTMify
            <span className="mt-1 block text-xs text-white/50">
              Opcional. Desmarcado: sem login ou importação da dashboard. O envio de vendas por API
              é configurado separadamente no Tracking.
            </span>
          </span>
        </label>
        {utmifyAccess && (
          <>
            <FormField
              id="offer-utmify-login"
              label="Login UTMify"
              error={createAttempted ? createErrors.utmifyLogin : null}
            >
              <Input
                value={utmifyLogin}
                onChange={(e) => setUtmifyLogin(e.target.value)}
                autoComplete="username"
                placeholder="seu@email.com"
              />
            </FormField>
            <FormField
              id="offer-utmify-password"
              label="Senha UTMify"
              error={createAttempted ? createErrors.utmifyPassword : null}
            >
              <Input
                type="password"
                value={utmifyPassword}
                onChange={(e) => setUtmifyPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </FormField>
            <FormField
              id="offer-dashboard-id"
              label="ID da dashboard"
              error={createAttempted ? createErrors.dashboardId : null}
            >
              <Input
                value={dashboardId}
                onChange={(e) => setDashboardId(e.target.value)}
                className="font-mono text-[12px]"
                placeholder="6a2182d753f10e2ba0fb2ed2"
              />
            </FormField>
          </>
        )}
      </div>
      {user?.role === 'admin' && (
        <OfferMemberPicker
          members={usersQuery.data ?? []}
          selected={memberIds}
          onChange={setMemberIds}
          loading={usersQuery.isLoading}
        />
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={createMut.isPending}>
          {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar e sincronizar
        </Button>
      </div>
    </form>
  );
}
