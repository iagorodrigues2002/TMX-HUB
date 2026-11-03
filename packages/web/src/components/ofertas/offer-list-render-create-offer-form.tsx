'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import type { useOfferListState } from './offer-list-use-offer-list-state';

export function renderCreateOfferForm({
  companyId,
  setCompanyId,
  companies,
  companiesQuery,
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
  createAttempted,
  setCreateAttempted,
  createMut,
  canCreate,
  createErrors,
}: Pick<
  ReturnType<typeof useOfferListState>,
  | 'companyId'
  | 'setCompanyId'
  | 'companies'
  | 'companiesQuery'
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
  | 'createAttempted'
  | 'setCreateAttempted'
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
        <p className="hud-label">Nova oferta da empresa</p>
        <p className="mt-1 text-[12px] text-white/45">
          A oferta ficará vinculada à empresa selecionada e respeitará as permissões dos seus
          membros.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          id="offer-company"
          label="Empresa"
          error={
            companiesQuery.isError
              ? 'Não foi possível carregar as empresas. Tente novamente.'
              : createAttempted
                ? createErrors.companyId
                : null
          }
        >
          <select
            id="offer-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={companiesQuery.isLoading || companiesQuery.isError}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">
              {companiesQuery.isLoading ? 'Carregando empresas…' : 'Selecione a empresa'}
            </option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </FormField>
        {companiesQuery.isError && (
          <Button type="button" variant="outline" onClick={() => void companiesQuery.refetch()}>
            Tentar novamente
          </Button>
        )}
        {!companiesQuery.isLoading && !companiesQuery.isError && companies.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            Você precisa criar uma empresa ou ser administrador de uma empresa para cadastrar
            ofertas.
          </p>
        )}
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
      <div className="flex justify-end">
        <Button type="submit" disabled={createMut.isPending || !canCreate}>
          {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {utmifyAccess ? 'Criar e sincronizar' : 'Criar oferta'}
        </Button>
      </div>
    </form>
  );
}
