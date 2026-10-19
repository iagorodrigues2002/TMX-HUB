'use client';
import { apiClient } from '@/lib/api-client';
import { ExplodelyGatewaySettingsSchema } from '@page-cloner/shared';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { useDomainActions } from './use-domain-actions';
import type { useFormState } from './use-form-state';
import type { useTrackingPeriod } from './use-tracking-period';
export function useGatewayActions({
  selectedVendepayConnectionId,
  offerId,
  setVendepayWebhook,
  vendepayConnectionName,
  setVendepayConnectionName,
  setSelectedVendepayConnectionId,
  qc,
  refresh,
  paysightName,
  paysightApiKey,
  paysightSecret,
  paysightProduct,
  setPaysightWebhook,
  setPaysightApiKey,
  setPaysightSecret,
  gatewayPlatform,
  gatewayName,
  explodelyVendorId,
  explodelySellerId,
  explodelyCurrency,
  explodelyAmountUnit,
  explodelyAmountScale,
  setGatewayCreatedWebhook,
  setGatewayName,
  setGatewayFormError,
}: {
  selectedVendepayConnectionId: ReturnType<typeof useFormState>['selectedVendepayConnectionId'];
  offerId: string;
  setVendepayWebhook: ReturnType<typeof useFormState>['setVendepayWebhook'];
  vendepayConnectionName: ReturnType<typeof useFormState>['vendepayConnectionName'];
  setVendepayConnectionName: ReturnType<typeof useFormState>['setVendepayConnectionName'];
  setSelectedVendepayConnectionId: ReturnType<
    typeof useFormState
  >['setSelectedVendepayConnectionId'];
  qc: ReturnType<typeof useTrackingPeriod>['qc'];
  refresh: ReturnType<typeof useDomainActions>['refresh'];
  paysightName: ReturnType<typeof useFormState>['paysightName'];
  paysightApiKey: ReturnType<typeof useFormState>['paysightApiKey'];
  paysightSecret: ReturnType<typeof useFormState>['paysightSecret'];
  paysightProduct: ReturnType<typeof useFormState>['paysightProduct'];
  setPaysightWebhook: ReturnType<typeof useFormState>['setPaysightWebhook'];
  setPaysightApiKey: ReturnType<typeof useFormState>['setPaysightApiKey'];
  setPaysightSecret: ReturnType<typeof useFormState>['setPaysightSecret'];
  gatewayPlatform: ReturnType<typeof useFormState>['gatewayPlatform'];
  gatewayName: ReturnType<typeof useFormState>['gatewayName'];
  explodelyVendorId: ReturnType<typeof useFormState>['explodelyVendorId'];
  explodelySellerId: ReturnType<typeof useFormState>['explodelySellerId'];
  explodelyCurrency: ReturnType<typeof useFormState>['explodelyCurrency'];
  explodelyAmountUnit: ReturnType<typeof useFormState>['explodelyAmountUnit'];
  explodelyAmountScale: ReturnType<typeof useFormState>['explodelyAmountScale'];
  setGatewayCreatedWebhook: ReturnType<typeof useFormState>['setGatewayCreatedWebhook'];
  setGatewayName: ReturnType<typeof useFormState>['setGatewayName'];
  setGatewayFormError: ReturnType<typeof useFormState>['setGatewayFormError'];
}) {
  const rotateVendepay = useMutation({
    mutationFn: () => {
      if (!selectedVendepayConnectionId) throw new Error('Selecione uma conta Vendepay.');
      return apiClient.rotateVendepayConnectionWebhook(offerId, selectedVendepayConnectionId);
    },
    onSuccess: (result) => {
      setVendepayWebhook(result.vendepay_webhook_url);
      toast.success('Nova URL gerada para a conta selecionada.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const createVendepayConnection = useMutation({
    mutationFn: () => apiClient.createVendepayConnection(offerId, vendepayConnectionName),
    onSuccess: (result) => {
      setVendepayConnectionName('');
      setSelectedVendepayConnectionId(result.connection.id);
      setVendepayWebhook(result.vendepay_webhook_url);
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void refresh();
      toast.success('Conta Vendepay adicionada. Copie o webhook agora.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const savePaysightGateway = useMutation({
    mutationFn: () =>
      apiClient.createGatewayConnection(offerId, {
        provider: 'paysight',
        name: paysightName.trim(),
        ...(paysightApiKey.trim() ? { api_key: paysightApiKey.trim() } : {}),
        ...(paysightSecret.trim() ? { signing_secret: paysightSecret.trim() } : {}),
        ...(paysightProduct.trim() ? { product_id: paysightProduct.trim() } : {}),
        environment: 'production',
      }),
    onSuccess: (result) => {
      setPaysightWebhook(result.webhook_url);
      setPaysightApiKey('');
      setPaysightSecret('');
      void qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
      toast.success('Paysight conectada. Copie a URL do webhook agora.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const createGateway = useMutation({
    mutationFn: async () => {
      if (gatewayPlatform === 'vendepay') {
        return apiClient.createVendepayConnection(offerId, gatewayName.trim());
      }
      if (gatewayPlatform === 'paysight') {
        return apiClient.createGatewayConnection(offerId, {
          provider: 'paysight',
          name: gatewayName.trim(),
          environment: 'production',
        });
      }

      const parsedSettings = ExplodelyGatewaySettingsSchema.safeParse({
        vendor_id: explodelyVendorId,
        ...(explodelySellerId.trim() ? { seller_id: explodelySellerId } : {}),
        currency: explodelyCurrency,
        amount_unit: explodelyAmountUnit,
        amount_scale: explodelyAmountScale,
      });
      if (!parsedSettings.success) {
        throw new Error(
          parsedSettings.error.issues[0]?.message ?? 'Revise as configurações da Explodely.',
        );
      }
      const settings = parsedSettings.data;
      return apiClient.createGatewayConnection(offerId, {
        provider: 'explodely',
        name: gatewayName.trim(),
        vendor_id: settings.vendor_id,
        ...(settings.seller_id ? { seller_id: settings.seller_id } : {}),
        currency: settings.currency,
        // The API currently names cents "minor" and stores the divisor as a base-10 exponent.
        amount_unit: settings.amount_unit === 'cents' ? 'minor' : 'decimal',
        amount_scale: Math.log10(settings.amount_scale),
        environment: 'production',
      });
    },
    onSuccess: (result) => {
      setGatewayCreatedWebhook(
        'vendepay_webhook_url' in result ? result.vendepay_webhook_url : result.webhook_url,
      );
      setGatewayName('');
      setGatewayFormError('');
      void qc.invalidateQueries({ queryKey: ['tracking-config', offerId] });
      void qc.invalidateQueries({ queryKey: ['tracking-advanced', offerId] });
      toast.success('Conexão criada. Copie o webhook agora.');
    },
    onError: (error) => {
      const message = (error as Error).message;
      setGatewayFormError(message);
      toast.error(message);
    },
  });
  return { rotateVendepay, createVendepayConnection, savePaysightGateway, createGateway };
}
