'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { History, Loader2, Send } from 'lucide-react';
import type { useUtmifyGlobalCenterState } from './utmify-global-center-use-utmify-global-center-state';

export function renderDashboardSettings({
  dashboardConfig,
  config,
  form,
  setForm,
  attemptedSave,
  save,
  test,
  replay,
  nameError,
  tokenError,
  pixelError,
  endpointError,
  handleSave,
}: Pick<
  ReturnType<typeof useUtmifyGlobalCenterState>,
  | 'config'
  | 'form'
  | 'setForm'
  | 'attemptedSave'
  | 'save'
  | 'test'
  | 'replay'
  | 'nameError'
  | 'tokenError'
  | 'pixelError'
  | 'endpointError'
  | 'handleSave'
> & {
  dashboardConfig: NonNullable<ReturnType<typeof useUtmifyGlobalCenterState>['config']['data']>;
}) {
  return (
    <form
      className="rounded-2xl border border-cyan-300/15 bg-bg-elevated/90 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleSave();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Destino agregador</h2>
          <p className="mt-1 text-xs leading-5 text-white/40">
            Use o token e o Pixel ID pertencentes à dashboard geral da UTMify.
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            className="h-4 w-4 accent-cyan-300"
          />
          Integração ativa
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FormField
          id="utmify-global-name"
          label="Nome da dashboard"
          error={attemptedSave ? nameError : null}
        >
          <Input
            id="utmify-global-name"
            value={form.name}
            aria-invalid={attemptedSave && Boolean(nameError)}
            aria-describedby={attemptedSave && nameError ? 'utmify-global-name-error' : undefined}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </FormField>
        <FormField
          id="utmify-global-token"
          label="API Token"
          help={
            dashboardConfig.destination?.token_configured
              ? 'Token salvo. Deixe em branco para manter o atual.'
              : 'Token da dashboard geral da UTMify.'
          }
          error={attemptedSave ? tokenError : null}
        >
          <Input
            id="utmify-global-token"
            type="password"
            autoComplete="new-password"
            value={form.api_token}
            aria-invalid={attemptedSave && Boolean(tokenError)}
            aria-describedby={
              attemptedSave && tokenError ? 'utmify-global-token-error' : 'utmify-global-token-help'
            }
            onChange={(event) => setForm({ ...form, api_token: event.target.value })}
          />
        </FormField>
        <FormField
          id="utmify-global-pixel"
          label="Pixel ID geral"
          help="Opcional. Use 24 caracteres hexadecimais."
          error={attemptedSave ? pixelError : null}
        >
          <Input
            id="utmify-global-pixel"
            value={form.pixel_id}
            className="font-mono"
            aria-invalid={attemptedSave && Boolean(pixelError)}
            aria-describedby={
              attemptedSave && pixelError ? 'utmify-global-pixel-error' : 'utmify-global-pixel-help'
            }
            onChange={(event) => setForm({ ...form, pixel_id: event.target.value })}
          />
        </FormField>
        <FormField
          id="utmify-global-endpoint"
          label="Endpoint de pedidos"
          error={attemptedSave ? endpointError : null}
        >
          <Input
            id="utmify-global-endpoint"
            type="url"
            value={form.endpoint_url}
            aria-invalid={attemptedSave && Boolean(endpointError)}
            aria-describedby={
              attemptedSave && endpointError ? 'utmify-global-endpoint-error' : undefined
            }
            onChange={(event) => setForm({ ...form, endpoint_url: event.target.value })}
          />
        </FormField>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => replay.mutate()}
          disabled={!dashboardConfig.configured || replay.isPending}
          className="gap-2 border-white/10"
        >
          {replay.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <History className="h-4 w-4" />
          )}
          {replay.isPending ? 'Reenviando…' : 'Reenviar histórico'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => test.mutate()}
          disabled={!dashboardConfig.configured || test.isPending}
          className="gap-2 border-white/10"
        >
          {test.isPending ? <Loader2 className="animate-spin" /> : <Send className="h-4 w-4" />}
          {test.isPending ? 'Enviando…' : 'Enviar pedido teste'}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {save.isPending ? 'Salvando…' : 'Salvar UTMify Geral'}
        </Button>
      </div>
    </form>
  );
}
