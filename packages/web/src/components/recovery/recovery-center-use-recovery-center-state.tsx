'use client';

import { type OfferView, type RecoveryView, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useRecoveryCenterState() {
  const qc = useQueryClient();
  const [offerId, setOfferId] = useState('');
  const offers = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
  });
  useEffect(() => {
    if (!offerId && offers.data?.[0]) setOfferId(offers.data[0].id);
  }, [offerId, offers.data]);
  const recovery = useQuery({
    queryKey: ['recovery', offerId],
    queryFn: () => apiClient.getRecovery(offerId),
    enabled: Boolean(offerId),
    refetchInterval: 30000,
  });
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [senderName, setSenderName] = useState('TMX');
  const [resendKey, setResendKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('Sua compra ainda está disponível');
  const [emailMessage, setEmailMessage] = useState(
    '<p>Olá {{nome}},</p><p>notamos que sua compra não foi concluída.</p><p>{{link}}</p>',
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'opened' | 'clicked' | 'converted'>(
    'all',
  );
  useEffect(() => {
    if (recovery.data?.settings) {
      setCheckoutUrl(recovery.data.settings.checkout_url || '');
      setSenderName(recovery.data.settings.sender_name || 'TMX');
    }
  }, [recovery.data?.settings]);
  useEffect(() => {
    const email = recovery.data?.channels.find((item) => item.kind === 'email');
    if (!email) return;
    setFromEmail(email.from_email || '');
    if (email.config.subject) setEmailSubject(email.config.subject);
    if (email.config.message) setEmailMessage(email.config.message);
  }, [recovery.data?.channels]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['recovery', offerId] });
  const settings = useMutation({
    mutationFn: () =>
      apiClient.updateRecoverySettings(offerId, {
        checkout_url: checkoutUrl,
        sender_name: senderName,
        quiet_start: 21,
        quiet_end: 8,
        enabled: true,
      }),
    onSuccess: () => {
      toast.success('Configuração de recuperação salva.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const channel = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.updateRecoveryChannel(offerId, body),
    onSuccess: (result) => {
      toast.success(
        result.webhook_configured
          ? 'Canal salvo e métricas ativadas.'
          : 'Canal salvo com criptografia.',
      );
      if (result.webhook_error)
        toast.warning('Canal salvo, mas o webhook de métricas precisa ser ativado.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const sync = useMutation({
    mutationFn: () => apiClient.syncRecovery(offerId),
    onSuccess: (r) => {
      toast.success(
        `${r.created} nova(s) oportunidade(s) criada(s) · ${r.candidates - r.skipped} com checkout resolvido.`,
      );
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const send = useMutation({
    mutationFn: (id: string) => apiClient.sendRecovery(offerId, id, 'email'),
    onSuccess: (_result, opportunityId) => {
      qc.setQueryData<RecoveryView>(['recovery', offerId], (current) =>
        current
          ? {
              ...current,
              opportunities: current.opportunities.filter((item) => item.id !== opportunityId),
            }
          : current,
      );
      toast.success('Recuperação enviada.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const bulk = useMutation({
    mutationFn: () => apiClient.bulkSendRecovery(offerId, 'email'),
    onSuccess: (r) => {
      toast.success(`${r.sent} enviada(s) · ${r.failed} falha(s).`);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const emailWebhook = useMutation({
    mutationFn: () => apiClient.setupRecoveryEmailWebhook(offerId),
    onSuccess: () => {
      toast.success('Métricas de e-mail ativadas.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const testSend = useMutation({
    mutationFn: () =>
      apiClient.sendRecoveryTestEmail(offerId, {
        to: testEmail.trim(),
        subject: emailSubject,
        message: emailMessage,
      }),
    onSuccess: () => {
      toast.success(`E-mail teste enviado para ${testEmail.trim()}.`);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const configured = (kind: string) =>
    recovery.data?.channels.some((c) => c.kind === kind && c.enabled);
  const r = recovery.data;
  const emailConfigured = Boolean(configured('email'));
  const trackingReady = Boolean(r?.sources.automatic);
  const readyToSend = emailConfigured && trackingReady;
  const emailOpportunities = (r?.opportunities ?? []).filter(
    (item) =>
      item.has_email &&
      !item.email_already_sent &&
      !['sent', 'delivered', 'read'].includes(item.last_message_state ?? ''),
  );
  return {
    offerId,
    setOfferId,
    offers,
    recovery,
    checkoutUrl,
    senderName,
    setSenderName,
    resendKey,
    setResendKey,
    fromEmail,
    setFromEmail,
    testEmail,
    setTestEmail,
    emailSubject,
    setEmailSubject,
    emailMessage,
    setEmailMessage,
    previewOpen,
    setPreviewOpen,
    activityFilter,
    setActivityFilter,
    settings,
    channel,
    sync,
    send,
    bulk,
    emailWebhook,
    testSend,
    configured,
    r,
    emailConfigured,
    trackingReady,
    readyToSend,
    emailOpportunities,
  };
}
