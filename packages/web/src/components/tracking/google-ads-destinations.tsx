'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { empty } from './google-ads-destinations-empty';
import { renderGoogleDestinationList } from './google-ads-destinations-render-google-destination-list';
import { useGoogleAdsDestinationsState } from './google-ads-destinations-use-google-ads-destinations-state';

// Mounted with offerId as key: an unfinished form can never migrate to another offer.
export function GoogleAdsDestinations({ offerId }: { offerId: string }) {
  const {
    form,
    setForm,
    editing,
    setEditing,
    archiveId,
    setArchiveId,
    accountsFor,
    selectedAccount,
    setSelectedAccount,
    destinations,
    connections,
    connect,
    disconnect,
    attach,
    accounts,
    validate,
    validateSynthetic,
    lookupAccount,
    save,
    archive,
    edit,
  } = useGoogleAdsDestinationsState({ offerId });

  return (
    <section className="space-y-5" aria-label="Destinos Google Ads">
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
        <p className="font-medium">Configuração inicial · envios desativados</p>
        <p className="mt-2 text-white/60">
          Cadastre contas independentes para esta oferta. Depois de conectar o Google, carregue as
          contas vinculadas, escolha a conta e valide com uma venda Google real já capturada. Salvar
          aqui não instala tags nem envia eventos.
        </p>
      </div>
      {connections.data && !connections.data.oauth_configured && (
        <p className="text-sm text-white/60">
          Conexão Google aguardando a configuração do aplicativo OAuth no servidor. Você já pode
          salvar os destinos.
        </p>
      )}
      {connections.isError && (
        <div role="alert" className="text-sm text-rose-200">
          Não foi possível consultar a conexão Google.{' '}
          <Button onClick={() => void connections.refetch()}>Tentar novamente</Button>
        </div>
      )}
      {destinations.isPending || connections.isPending ? (
        <DataState className="min-h-64" variant="loading" title="Carregando destinos Google Ads…" />
      ) : destinations.isError ? (
        <div role="alert" className="space-y-2 text-sm text-rose-200">
          <p>
            Não foi possível carregar os destinos Google. Verifique se a API e a migração desta
            integração foram publicadas.
          </p>
          <Button onClick={() => void destinations.refetch()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          {renderGoogleDestinationList({
            destinationData: destinations.data,
            form,
            setForm,
            setEditing,
            archiveId,
            setArchiveId,
            accountsFor,
            selectedAccount,
            setSelectedAccount,
            destinations,
            connections,
            connect,
            disconnect,
            attach,
            accounts,
            validate,
            validateSynthetic,
            save,
            archive,
            edit,
          })}
          <form
            className="space-y-4 rounded-xl border border-white/10 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <h3 className="font-medium">
              {editing ? 'Editar destino' : 'Adicionar conta Google Ads'}
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              <label htmlFor="google-destination-name" className="space-y-2 text-sm">
                Nome do destino
                <Input
                  id="google-destination-name"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Google · PJR · Conta 1"
                />
              </label>
              <label htmlFor="google-customer-id" className="space-y-2 text-sm">
                ID da conta Google Ads
                <Input
                  id="google-customer-id"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4}"
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  onBlur={() => {
                    const customerId = form.customer_id.replace(/-/g, '').trim();
                    if (
                      editing &&
                      /^\d{10}$/.test(customerId) &&
                      selectedAccount?.customerId !== customerId
                    )
                      lookupAccount.mutate({ id: editing, customerId });
                  }}
                  placeholder="123-456-7890"
                />
                {lookupAccount.isPending && (
                  <span className="text-xs text-cyan-200">Consultando conta no Google…</span>
                )}
                {selectedAccount &&
                  form.customer_id.replace(/-/g, '') === selectedAccount.customerId && (
                    <span className="block text-xs text-emerald-200">✓ {selectedAccount.name}</span>
                  )}
                {lookupAccount.isError && (
                  <span className="block text-xs text-rose-200">
                    ID não encontrado na autorização Google conectada.
                  </span>
                )}
              </label>
              <label htmlFor="google-conversion-action-id" className="space-y-2 text-sm">
                ID da ação de conversão
                <Input
                  id="google-conversion-action-id"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{1,30}"
                  value={form.conversion_action_id}
                  onChange={(e) => setForm({ ...form, conversion_action_id: e.target.value })}
                  placeholder="ID numérico da ação de compra"
                />
              </label>
            </div>
            <p className="text-xs text-white/50">
              Use o ID da ação de conversão de importação. Ele é diferente do ID de tag AW e do
              rótulo da tag. O envio só é confirmado quando você salvar este destino.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={save.isPending || archive.isPending}>
                {save.isPending ? 'Salvando…' : 'Salvar rascunho'}
              </Button>
              {editing && (
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(undefined);
                    setForm(empty);
                    save.reset();
                  }}
                >
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
        </>
      )}
      {(save.isError || archive.isError) && (
        <p role="alert" className="text-sm text-rose-200">
          Não foi possível salvar a alteração. Confira os IDs, suas permissões e se a conta/ação já
          está cadastrada nesta oferta. {String((save.error || archive.error)?.message || '')}
        </p>
      )}
      {(connect.isError || disconnect.isError || attach.isError) && (
        <p role="alert" className="text-sm text-rose-200">
          Não foi possível alterar a conexão Google. Tente novamente.{' '}
          {String((connect.error || disconnect.error || attach.error)?.message || '')}
        </p>
      )}
    </section>
  );
}
