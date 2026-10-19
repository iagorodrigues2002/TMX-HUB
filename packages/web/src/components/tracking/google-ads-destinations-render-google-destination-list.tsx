'use client';

import { Button } from '@/components/ui/button';
import type { useGoogleAdsDestinationsState } from './google-ads-destinations-use-google-ads-destinations-state';

export function renderGoogleDestinationList({
  destinationData,
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
}: Pick<
  ReturnType<typeof useGoogleAdsDestinationsState>,
  | 'form'
  | 'setForm'
  | 'setEditing'
  | 'archiveId'
  | 'setArchiveId'
  | 'accountsFor'
  | 'selectedAccount'
  | 'setSelectedAccount'
  | 'destinations'
  | 'connections'
  | 'connect'
  | 'disconnect'
  | 'attach'
  | 'accounts'
  | 'validate'
  | 'validateSynthetic'
  | 'save'
  | 'archive'
  | 'edit'
> & {
  destinationData: NonNullable<
    ReturnType<typeof useGoogleAdsDestinationsState>['destinations']['data']
  >;
}) {
  return (
    <div className="space-y-3">
      {destinationData.destinations.map((d) => {
        const connection = connections.data?.connections.find((c) => c.destination_id === d.id);
        const reusableConnection = connections.data?.oauth_connections[0];
        return (
          <article key={d.id} className="rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium">{d.name}</h3>
              <span className="text-xs text-amber-200">
                {connection
                  ? `Conexão: ${connection.connection_name} · conta ainda não validada`
                  : 'Rascunho · não conectado'}
              </span>
            </div>
            <p className="mt-2 break-all text-sm text-white/60">
              Conta {d.customer_id} · Ação {d.conversion_action_id}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!connection && reusableConnection && (
                <Button
                  disabled={attach.isPending}
                  onClick={() => attach.mutate({ id: d.id, connectionId: reusableConnection.id })}
                >
                  {attach.isPending ? 'Associando…' : 'Usar conexão existente'}
                </Button>
              )}
              <Button
                disabled={
                  !connections.data?.oauth_configured ||
                  connect.isPending ||
                  disconnect.isPending ||
                  attach.isPending
                }
                onClick={() => connect.mutate(d.id)}
              >
                {connect.isPending
                  ? 'Abrindo Google…'
                  : connection
                    ? 'Conectar outra conta'
                    : 'Conectar Google'}
              </Button>
              {connection && (
                <Button
                  disabled={disconnect.isPending || attach.isPending}
                  onClick={() => disconnect.mutate(d.id)}
                >
                  Desconectar do destino
                </Button>
              )}
              {connection && (
                <Button
                  disabled={accounts.isPending || validate.isPending}
                  onClick={() => accounts.mutate(d.id)}
                >
                  {accounts.isPending ? 'Carregando contas…' : 'Escolher conta vinculada'}
                </Button>
              )}
              {connection && (
                <Button
                  disabled={accounts.isPending || validate.isPending || validateSynthetic.isPending}
                  onClick={() => validateSynthetic.mutate(d.id)}
                >
                  {validateSynthetic.isPending ? 'Testando configuração…' : 'Testar sem venda'}
                </Button>
              )}
              {connection && (
                <Button
                  disabled={accounts.isPending || validate.isPending || validateSynthetic.isPending}
                  onClick={() => validate.mutate(d.id)}
                >
                  {validate.isPending ? 'Validando com Google…' : 'Validar com venda real'}
                </Button>
              )}
              <Button disabled={save.isPending || archive.isPending} onClick={() => edit(d)}>
                Editar
              </Button>
              <Button
                disabled={save.isPending || archive.isPending}
                onClick={() => setArchiveId(d.id)}
              >
                Arquivar
              </Button>
            </div>
            {archiveId === d.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm">Arquivar este rascunho?</p>
                <Button disabled={archive.isPending} onClick={() => archive.mutate(d.id)}>
                  Confirmar
                </Button>
                <Button disabled={archive.isPending} onClick={() => setArchiveId(undefined)}>
                  Cancelar
                </Button>
              </div>
            )}
            {accountsFor === d.id && accounts.data && (
              <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
                <p className="text-sm font-medium">Contas encontradas</p>
                <p className="mt-1 text-xs text-white/60">
                  Ao selecionar uma conta, o TMX preenche o destino abaixo, mas não salva
                  automaticamente. Confirme o ID da ação e clique em “Salvar rascunho”.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {accounts.data.accounts.map((account) => {
                    const isSelected =
                      selectedAccount?.destinationId === d.id &&
                      selectedAccount.customerId === account.customer_id;
                    return (
                      <Button
                        key={account.customer_id}
                        type="button"
                        className={
                          isSelected
                            ? 'border border-emerald-300 bg-emerald-300/15 text-emerald-50'
                            : ''
                        }
                        onClick={() => {
                          setSelectedAccount({
                            destinationId: d.id,
                            customerId: account.customer_id,
                            name: account.name,
                          });
                          setForm({
                            name: form.name || `Google · ${account.name}`,
                            customer_id: account.customer_id,
                            conversion_action_id: form.conversion_action_id,
                          });
                          setEditing(d.id);
                          window.scrollTo({
                            top: document.body.scrollHeight,
                            behavior: 'smooth',
                          });
                        }}
                      >
                        {account.name} · {account.customer_id}
                        {account.manager ? ' · Administradora' : ''}
                      </Button>
                    );
                  })}
                </div>
                {selectedAccount?.destinationId === d.id && (
                  <output className="mt-3 block rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
                    <span className="font-medium">Conta selecionada:</span> {selectedAccount.name} ·{' '}
                    {selectedAccount.customerId}. Revise a ação de conversão no formulário e salve
                    para confirmar.
                  </output>
                )}
                {!accounts.data.accounts.length && (
                  <p className="mt-3 text-sm text-amber-200">
                    Nenhuma conta ativa retornou. Confirme que o usuário Google tem acesso direto ou
                    via conta administradora.
                  </p>
                )}
              </div>
            )}
            {accounts.isError && accounts.variables === d.id && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-100"
              >
                <p className="font-medium">Não foi possível carregar as contas vinculadas</p>
                <p className="mt-1 text-white/70">
                  {String(accounts.error.message || 'Verifique a conexão Google.')}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  O seletor usa apenas a autorização OAuth desta conexão. Reconecte o Google se a
                  permissão de listar contas ainda não tiver sido concedida.
                </p>
              </div>
            )}
            {validate.data && validate.variables === d.id && (
              <output className="mt-4 block rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">
                <p className="font-medium">Validação do envio aprovada</p>
                <p className="mt-1 text-white/70">
                  {validate.data.detail} Pedido usado: {validate.data.order_id}. Avisos:{' '}
                  {validate.data.warnings}
                  {validate.data.request_id
                    ? ` · Protocolo Google: ${validate.data.request_id}`
                    : ''}
                  .
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Este teste usa uma venda real com identificador Google capturado, mas é executado
                  em modo de validação: ele prova que o Google aceita a autorização, conta, ação e
                  payload sem criar uma conversão duplicada.
                </p>
              </output>
            )}
            {validateSynthetic.data && validateSynthetic.variables === d.id && (
              <output className="mt-4 block rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm text-cyan-100">
                <p className="font-medium">Teste sem venda aprovado</p>
                <p className="mt-1 text-white/70">
                  {validateSynthetic.data.detail} Avisos: {validateSynthetic.data.warnings}
                  {validateSynthetic.data.request_id
                    ? ` · Protocolo Google: ${validateSynthetic.data.request_id}`
                    : ''}
                  .
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Este teste não exige pedido, clique ou cliente real. Ele é uma validação técnica:
                  não aparece como conversão no Google Ads e não altera métricas.
                </p>
              </output>
            )}
            {validate.isError && validate.variables === d.id && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/5 p-3 text-sm text-rose-100"
              >
                <p className="font-medium">Teste não aprovado</p>
                <p className="mt-1 text-white/70">
                  {String(validate.error.message || 'Não foi possível validar o tracking.')}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  O teste não envia uma conversão. Ele precisa de uma venda front aprovada desta
                  oferta que tenha GCLID, GBRAID ou WBRAID capturado.
                </p>
              </div>
            )}
            {validateSynthetic.isError && validateSynthetic.variables === d.id && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/5 p-3 text-sm text-rose-100"
              >
                <p className="font-medium">Teste sem venda não aprovado</p>
                <p className="mt-1 text-white/70">
                  {String(
                    validateSynthetic.error.message || 'Não foi possível validar a configuração.',
                  )}
                </p>
              </div>
            )}
          </article>
        );
      })}
      {!destinationData.destinations.length && (
        <p className="text-sm text-white/60">Nenhum destino Google cadastrado nesta oferta.</p>
      )}
    </div>
  );
}
