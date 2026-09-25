'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type GoogleAdsDraft, type GoogleAdsDraftInput } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const empty: GoogleAdsDraftInput = { name: '', customer_id: '', conversion_action_id: '' };

// Mounted with offerId as key: an unfinished form can never migrate to another offer.
export function GoogleAdsDestinations({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const queryKey = ['google-ads-destinations', offerId];
  const [form, setForm] = useState<GoogleAdsDraftInput>(empty);
  const [editing, setEditing] = useState<string>();
  const [archiveId, setArchiveId] = useState<string>();
  const [accountsFor, setAccountsFor] = useState<string>();
  const destinations = useQuery({ queryKey, queryFn: () => apiClient.googleAdsDestinations(offerId), retry: false });
  const connectionKey = ['google-ads-connections', offerId];
  const connections = useQuery({ queryKey: connectionKey, queryFn: () => apiClient.googleAdsConnectionStatus(offerId), retry: false });
  const connect = useMutation({
    mutationFn: async (id: string) => {
      const flow = await apiClient.googleAdsOAuthStart(offerId, id);
      sessionStorage.setItem('tmx-google-oauth', JSON.stringify({ state: flow.state, offerId, destinationId: id }));
      window.location.assign(flow.authorization_url);
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => apiClient.googleAdsDisconnect(offerId, id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: connectionKey }); toast.success('Autorização removida deste destino no TMX.'); },
  });
  const attach = useMutation({
    mutationFn: ({ id, connectionId }: { id: string; connectionId: string }) =>
      apiClient.googleAdsAttachConnection(offerId, id, connectionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: connectionKey });
      toast.success('Conexão Google existente associada a este destino.');
    },
  });
  const accounts = useMutation({
    mutationFn: (id: string) => apiClient.googleAdsAccounts(offerId, id),
    onSuccess: (_data, id) => setAccountsFor(id),
  });
  const validate = useMutation({
    mutationFn: (id: string) => apiClient.googleAdsValidate(offerId, id),
  });
  const save = useMutation({
    mutationFn: () => apiClient.saveGoogleAdsDestination(offerId, form, editing),
    onSuccess: () => {
      setEditing(undefined); setForm(empty);
      void qc.invalidateQueries({ queryKey }); toast.success('Destino salvo em rascunho. Nenhum envio foi ativado.');
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => apiClient.archiveGoogleAdsDestination(offerId, id),
    onSuccess: () => {
      if (editing === archiveId) { setEditing(undefined); setForm(empty); }
      setArchiveId(undefined); void qc.invalidateQueries({ queryKey });
    },
  });
  const edit = (d: GoogleAdsDraft) => {
    setEditing(d.id); setForm({ name: d.name, customer_id: d.customer_id, conversion_action_id: d.conversion_action_id }); save.reset();
  };
  return <section className="space-y-5" aria-label="Destinos Google Ads">
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
      <p className="font-medium">Configuração inicial · envios desativados</p>
      <p className="mt-2 text-white/60">Cadastre contas independentes para esta oferta. Depois de conectar o Google, carregue as contas vinculadas, escolha a conta e valide com uma venda Google real já capturada. Salvar aqui não instala tags nem envia eventos.</p>
    </div>
    {connections.data && !connections.data.oauth_configured && <p className="text-sm text-white/60">Conexão Google aguardando a configuração do aplicativo OAuth no servidor. Você já pode salvar os destinos.</p>}
    {connections.isError && <div role="alert" className="text-sm text-rose-200">Não foi possível consultar a conexão Google. <Button onClick={() => void connections.refetch()}>Tentar novamente</Button></div>}
    {destinations.isPending ? <p role="status">Carregando destinos…</p> : destinations.isError ?
      <div role="alert" className="space-y-2 text-sm text-rose-200"><p>Não foi possível carregar os destinos Google. Verifique se a API e a migração desta integração foram publicadas.</p><Button onClick={() => void destinations.refetch()}>Tentar novamente</Button></div> : <>
      <div className="space-y-3">
        {destinations.data.destinations.map(d => {
          const connection = connections.data?.connections.find(c => c.destination_id === d.id);
          const reusableConnection = connections.data?.oauth_connections[0];
          return <article key={d.id} className="rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">{d.name}</h3><span className="text-xs text-amber-200">{connection ? `Conexão: ${connection.connection_name} · conta ainda não validada` : 'Rascunho · não conectado'}</span></div>
          <p className="mt-2 break-all text-sm text-white/60">Conta {d.customer_id} · Ação {d.conversion_action_id}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!connection && reusableConnection && <Button disabled={attach.isPending} onClick={() => attach.mutate({ id: d.id, connectionId: reusableConnection.id })}>{attach.isPending ? 'Associando…' : 'Usar conexão existente'}</Button>}
            <Button disabled={!connections.data?.oauth_configured || connect.isPending || disconnect.isPending || attach.isPending} onClick={() => connect.mutate(d.id)}>{connect.isPending ? 'Abrindo Google…' : connection ? 'Conectar outra conta' : 'Conectar Google'}</Button>
            {connection && <Button disabled={disconnect.isPending || attach.isPending} onClick={() => disconnect.mutate(d.id)}>Desconectar do destino</Button>}
            {connection && <Button disabled={accounts.isPending || validate.isPending} onClick={() => accounts.mutate(d.id)}>{accounts.isPending ? 'Carregando contas…' : 'Escolher conta vinculada'}</Button>}
            {connection && <Button disabled={accounts.isPending || validate.isPending} onClick={() => validate.mutate(d.id)}>{validate.isPending ? 'Validando com Google…' : 'Testar tracking'}</Button>}
            <Button disabled={save.isPending || archive.isPending} onClick={() => edit(d)}>Editar</Button>
            <Button disabled={save.isPending || archive.isPending} onClick={() => setArchiveId(d.id)}>Arquivar</Button>
          </div>
          {archiveId === d.id && <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-sm">Arquivar este rascunho?</p><Button disabled={archive.isPending} onClick={() => archive.mutate(d.id)}>Confirmar</Button><Button disabled={archive.isPending} onClick={() => setArchiveId(undefined)}>Cancelar</Button></div>}
          {accountsFor === d.id && accounts.data && <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-3">
            <p className="text-sm font-medium">Contas encontradas</p>
            <p className="mt-1 text-xs text-white/60">Escolha uma conta para preencher o destino abaixo. Depois informe ou mantenha a ação de conversão correta e salve.</p>
            <div className="mt-3 flex flex-wrap gap-2">{accounts.data.accounts.map(account => <Button key={account.customer_id} type="button" onClick={() => { setForm({ name: form.name || `Google · ${account.name}`, customer_id: account.customer_id, conversion_action_id: form.conversion_action_id }); setEditing(d.id); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}>
              {account.name} · {account.customer_id}{account.manager ? ' · Administradora' : ''}
            </Button>)}</div>
            {!accounts.data.accounts.length && <p className="mt-3 text-sm text-amber-200">Nenhuma conta ativa retornou. Confirme que o usuário Google tem acesso direto ou via conta administradora.</p>}
          </div>}
          {accounts.isError && accounts.variables === d.id && <div role="alert" className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-sm text-amber-100">
            <p className="font-medium">Não foi possível carregar as contas vinculadas</p>
            <p className="mt-1 text-white/70">{String(accounts.error.message || 'Verifique a conexão Google.')}</p>
            <p className="mt-2 text-xs text-white/55">O seletor exige o Developer Token da Google Ads API no Railway. Ele é usado apenas para leitura/listagem; as conversões continuam pelo Data Manager.</p>
          </div>}
          {validate.data && validate.variables === d.id && <div role="status" className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">
            <p className="font-medium">Teste aprovado</p><p className="mt-1 text-white/70">{validate.data.detail} Pedido usado: {validate.data.order_id}. Avisos: {validate.data.warnings}.</p>
          </div>}
          {validate.isError && validate.variables === d.id && <div role="alert" className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/5 p-3 text-sm text-rose-100">
            <p className="font-medium">Teste não aprovado</p>
            <p className="mt-1 text-white/70">{String(validate.error.message || 'Não foi possível validar o tracking.')}</p>
            <p className="mt-2 text-xs text-white/55">O teste não envia uma conversão. Ele precisa de uma venda front aprovada desta oferta que tenha GCLID, GBRAID ou WBRAID capturado.</p>
          </div>}
        </article>;
        })}
        {!destinations.data.destinations.length && <p className="text-sm text-white/60">Nenhum destino Google cadastrado nesta oferta.</p>}
      </div>
      <form className="space-y-4 rounded-xl border border-white/10 p-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <h3 className="font-medium">{editing ? 'Editar destino' : 'Adicionar conta Google Ads'}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">Nome do destino<Input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Google · PJR · Conta 1" /></label>
          <label className="space-y-2 text-sm">ID da conta Google Ads<Input required inputMode="numeric" pattern="[0-9]{10}|[0-9]{3}-[0-9]{3}-[0-9]{4}" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} placeholder="123-456-7890" /></label>
          <label className="space-y-2 text-sm">ID da ação de conversão<Input required inputMode="numeric" pattern="[0-9]{1,30}" value={form.conversion_action_id} onChange={e => setForm({ ...form, conversion_action_id: e.target.value })} placeholder="ID numérico da ação de compra" /></label>
        </div>
        <p className="text-xs text-white/50">Use o ID da ação de conversão de importação. Ele é diferente do ID de tag AW e do rótulo da tag.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={save.isPending || archive.isPending}>{save.isPending ? 'Salvando…' : 'Salvar rascunho'}</Button>{editing && <Button type="button" onClick={() => { setEditing(undefined); setForm(empty); save.reset(); }}>Cancelar edição</Button>}</div>
      </form>
    </>}
    {(save.isError || archive.isError) && <p role="alert" className="text-sm text-rose-200">Não foi possível salvar a alteração. Confira os IDs, suas permissões e se a conta/ação já está cadastrada nesta oferta. {String((save.error || archive.error)?.message || '')}</p>}
    {(connect.isError || disconnect.isError || attach.isError) && <p role="alert" className="text-sm text-rose-200">Não foi possível alterar a conexão Google. Tente novamente. {String((connect.error || disconnect.error || attach.error)?.message || '')}</p>}
  </section>;
}
