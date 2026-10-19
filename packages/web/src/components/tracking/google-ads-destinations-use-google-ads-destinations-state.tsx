'use client';

import { type GoogleAdsDraft, type GoogleAdsDraftInput, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { empty } from './google-ads-destinations-empty';

export function useGoogleAdsDestinationsState({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const queryKey = ['google-ads-destinations', offerId];
  const [form, setForm] = useState<GoogleAdsDraftInput>(empty);
  const [editing, setEditing] = useState<string>();
  const [archiveId, setArchiveId] = useState<string>();
  const [accountsFor, setAccountsFor] = useState<string>();
  const [selectedAccount, setSelectedAccount] = useState<{
    destinationId: string;
    customerId: string;
    name: string;
  }>();
  const destinations = useQuery({
    queryKey,
    queryFn: () => apiClient.googleAdsDestinations(offerId),
    retry: false,
  });
  const connectionKey = ['google-ads-connections', offerId];
  const connections = useQuery({
    queryKey: connectionKey,
    queryFn: () => apiClient.googleAdsConnectionStatus(offerId),
    retry: false,
  });
  const connect = useMutation({
    mutationFn: async (id: string) => {
      const flow = await apiClient.googleAdsOAuthStart(offerId, id);
      sessionStorage.setItem(
        'tmx-google-oauth',
        JSON.stringify({ state: flow.state, offerId, destinationId: id }),
      );
      window.location.assign(flow.authorization_url);
    },
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => apiClient.googleAdsDisconnect(offerId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: connectionKey });
      toast.success('Autorização removida deste destino no TMX.');
    },
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
  const validateSynthetic = useMutation({
    mutationFn: (id: string) => apiClient.googleAdsValidateSynthetic(offerId, id),
  });
  const lookupAccount = useMutation({
    mutationFn: ({ id, customerId }: { id: string; customerId: string }) =>
      apiClient.googleAdsLookupAccount(offerId, id, customerId),
    onSuccess: ({ account }, input) => {
      setSelectedAccount({
        destinationId: input.id,
        customerId: account.customer_id,
        name: account.name,
      });
      setForm((current) => ({
        ...current,
        customer_id: account.customer_id,
        name: current.name.trim() || `Google · ${account.name}`,
      }));
      toast.success(`Conta Google encontrada: ${account.name}`);
    },
  });
  const save = useMutation({
    mutationFn: () => apiClient.saveGoogleAdsDestination(offerId, form, editing),
    onSuccess: () => {
      setEditing(undefined);
      setForm(empty);
      void qc.invalidateQueries({ queryKey });
      toast.success('Destino salvo em rascunho. Nenhum envio foi ativado.');
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => apiClient.archiveGoogleAdsDestination(offerId, id),
    onSuccess: () => {
      if (editing === archiveId) {
        setEditing(undefined);
        setForm(empty);
      }
      setArchiveId(undefined);
      void qc.invalidateQueries({ queryKey });
    },
  });
  const edit = (d: GoogleAdsDraft) => {
    setEditing(d.id);
    setForm({
      name: d.name,
      customer_id: d.customer_id,
      conversion_action_id: d.conversion_action_id,
    });
    save.reset();
  };
  return {
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
  };
}
