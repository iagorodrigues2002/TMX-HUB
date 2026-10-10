'use client';

import { GatewayCard } from '@/components/tracking/sections/finance/gateway-card';
import {
  GATEWAY_PROVIDERS,
  type GatewayAccount,
  type GatewayFormValues,
  type GatewayProvider,
} from '@/components/tracking/sections/finance/gateway-registry';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { apiClient, authToken } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SyzepayFeeForm } from '@/components/tracking/syzepay-fees';

interface GatewaysSectionProps {
  offerId: string;
  canManage: boolean;
}

interface UniversalGatewayResponse {
  connection: unknown;
  webhook_url?: string;
}

const isGatewayProvider = (provider: string): provider is GatewayProvider =>
  GATEWAY_PROVIDERS.some((candidate) => candidate === provider);

async function updateUniversalGateway(
  offerId: string,
  connectionId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const token = authToken.get();
  const response = await fetch(
    `/v1/offers/${encodeURIComponent(offerId)}/tracking/gateway-connections/${encodeURIComponent(connectionId)}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
  );
  if (response.ok) return;
  const problem = (await response.json().catch(() => null)) as {
    detail?: string;
    title?: string;
  } | null;
  throw new Error(problem?.detail ?? problem?.title ?? `HTTP ${response.status}`);
}

export function GatewaysSection({ offerId, canManage }: GatewaysSectionProps) {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['tracking-config', offerId],
    queryFn: () => apiClient.getTrackingConfig(offerId),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  if (config.isLoading) {
    return <DataState variant="loading" title="Carregando gateways…" />;
  }
  if (config.isError) {
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar os gateways"
        description={(config.error as Error).message}
        onRetry={() => void config.refetch()}
        isRetrying={config.isFetching}
      />
    );
  }
  if (!config.data?.configured) {
    return (
      <DataState
        variant="empty"
        title="Ative o rastreamento antes de configurar gateways"
        description="A configuração do projeto cria a base segura usada pelas conexões e webhooks."
      />
    );
  }

  const accounts: Record<GatewayProvider, GatewayAccount[]> = {
    vendepay: (config.data.vendepay?.connections ?? []).map((connection) => ({
      id: connection.id,
      provider: 'vendepay',
      name: connection.name,
      enabled: connection.enabled,
      apiKeyConfigured: false,
      secretConfigured: connection.signing_secret_configured,
      lastWebhookAt: null,
      propagationParam: connection.propagation_param,
      settings: {},
    })),
    paysight: [],
    explodely: [],
  };

  for (const connection of config.data.gateways ?? []) {
    if (!isGatewayProvider(connection.provider) || connection.provider === 'vendepay') continue;
    accounts[connection.provider].push({
      id: connection.id,
      provider: connection.provider,
      name: connection.name,
      enabled: connection.enabled,
      apiKeyConfigured: connection.api_key_configured,
      secretConfigured: connection.signing_secret_configured,
      lastWebhookAt: connection.last_webhook_at,
      settings: connection.settings as GatewayAccount['settings'],
    });
  }

  const saveAccount = async (
    provider: GatewayProvider,
    account: GatewayAccount | null,
    values: GatewayFormValues,
  ): Promise<{ webhookUrl?: string }> => {
    let webhookUrl: string | undefined;

    if (provider === 'vendepay') {
      let connectionId = account?.id;
      if (account) {
        if (values.name !== account.name) {
          await apiClient.updateVendepayConnection(offerId, account.id, { name: values.name });
        }
      } else {
        const created = await apiClient.createVendepayConnection(offerId, values.name);
        connectionId = created.connection.id;
        webhookUrl = created.vendepay_webhook_url;
      }
      if (values.secret && connectionId) {
        await apiClient.saveVendepayConnectionSigningSecret(offerId, connectionId, values.secret);
      }
    } else {
      const common = {
        name: values.name,
        environment: values.environment ?? 'production',
      };
      const body =
        provider === 'paysight'
          ? {
              ...common,
              ...(values.api_key ? { api_key: values.api_key } : {}),
              ...(values.signing_secret ? { signing_secret: values.signing_secret } : {}),
              ...(values.product_id ? { product_id: values.product_id } : {}),
            }
          : {
              ...common,
              vendor_id: values.vendor_id ?? '',
              ...(values.seller_id ? { seller_id: values.seller_id } : {}),
              currency: values.currency ?? 'USD',
              amount_unit: values.amount_unit ?? 'minor',
              amount_scale: values.amount_scale ?? 2,
              ...(values.webhook_secret ? { signing_secret: values.webhook_secret } : {}),
            };

      if (account) {
        await updateUniversalGateway(offerId, account.id, body);
      } else if (provider === 'paysight') {
        const created = await apiClient.createGatewayConnection(offerId, {
          provider,
          name: values.name,
          environment: values.environment ?? 'production',
          ...(values.api_key ? { api_key: values.api_key } : {}),
          ...(values.signing_secret ? { signing_secret: values.signing_secret } : {}),
          ...(values.product_id ? { product_id: values.product_id } : {}),
        });
        webhookUrl = created.webhook_url;
      } else {
        const currency = values.currency;
        if (currency !== 'USD' && currency !== 'BRL' && currency !== 'EUR') {
          throw new Error('Use USD, BRL ou EUR na moeda da Explodely.');
        }
        const created = (await apiClient.createGatewayConnection(offerId, {
          provider,
          name: values.name,
          vendor_id: values.vendor_id ?? '',
          ...(values.seller_id ? { seller_id: values.seller_id } : {}),
          currency,
          amount_unit: values.amount_unit ?? 'minor',
          amount_scale: values.amount_scale ?? 2,
          environment: values.environment ?? 'production',
          ...(values.webhook_secret ? { signing_secret: values.webhook_secret } : {}),
        })) as UniversalGatewayResponse;
        webhookUrl = created.webhook_url;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['tracking-config', offerId] });
    toast.success(account ? 'Settings atualizados.' : 'Conexão criada.');
    return { webhookUrl };
  };

  return (
    <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <p className="hud-label">Rastreamento avançado</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Gateways e webhooks</h2>
      <p className="mb-6 mt-2 max-w-2xl text-sm leading-6 text-white/50">
        Cada provider aparece uma vez. As contas ficam agrupadas abaixo dele e preservam suas
        configurações específicas.
      </p>
      <div className="space-y-4">
        {GATEWAY_PROVIDERS.map((provider) => (
          <GatewayCard
            key={provider}
            provider={provider}
            accounts={accounts[provider]}
            canManage={canManage}
            onSave={saveAccount}
          />
        ))}
      </div>
      {canManage &&
        (config.data.gateways ?? [])
          .filter((g) => g.provider !== 'vendepay')
          .map((g) => (
            <section key={`fees-${g.id}`} className="rounded-lg border border-white/10 p-4">
              <h3 className="text-sm font-medium">
                {g.name} · {g.provider}
              </h3>
              <SyzepayFeeForm
                id={g.id}
                offerId={offerId}
                gatewayLabel={g.provider === 'paysight' ? 'Paysight' : 'Explodely'}
                settings={g.fee_settings ?? {}}
              />
            </section>
          ))}
    </section>
  );
}
