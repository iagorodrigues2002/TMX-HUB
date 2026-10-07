import { ExplodelySettingsForm } from '@/components/tracking/sections/finance/forms/explodely-settings-form';
import { PaysightSettingsForm } from '@/components/tracking/sections/finance/forms/paysight-settings-form';
import { VendepaySettingsForm } from '@/components/tracking/sections/finance/forms/vendepay-settings-form';
import { CircleDollarSign, type LucideIcon, Rocket, WalletCards } from 'lucide-react';
import type { ComponentType } from 'react';

export const GATEWAY_PROVIDERS = ['vendepay', 'paysight', 'explodely'] as const;

export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export interface GatewayAccount {
  id: string;
  provider: GatewayProvider;
  name: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  lastWebhookAt: string | null;
  propagationParam?: string;
  settings: {
    product_id?: string | null;
    vendor_id?: string | null;
    seller_id?: string | null;
    currency?: string | null;
    amount_unit?: 'decimal' | 'minor';
    amount_scale?: number;
    environment?: 'sandbox' | 'production';
  };
}

export interface GatewayFormValues {
  name: string;
  vendor_id?: string;
  secret?: string;
  api_key?: string;
  signing_secret?: string;
  product_id?: string;
  seller_id?: string;
  currency?: string;
  amount_unit?: 'decimal' | 'minor';
  amount_scale?: number;
  environment?: 'sandbox' | 'production';
  webhook_secret?: string;
}

export interface GatewaySettingsFormProps {
  account: GatewayAccount | null;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: GatewayFormValues) => Promise<void>;
}

interface GatewayRegistryEntry {
  icon: LucideIcon;
  label: string;
  description: string;
  multiAccount: boolean;
  SettingsForm: ComponentType<GatewaySettingsFormProps>;
}

export const gatewayRegistry: Record<GatewayProvider, GatewayRegistryEntry> = {
  vendepay: {
    icon: WalletCards,
    label: 'VendePay',
    description: 'Contas independentes com secret e atribuição próprios.',
    multiAccount: true,
    SettingsForm: VendepaySettingsForm,
  },
  paysight: {
    icon: CircleDollarSign,
    label: 'Paysight',
    description: 'Credenciais, produto e ambiente da conexão.',
    multiAccount: false,
    SettingsForm: PaysightSettingsForm,
  },
  explodely: {
    icon: Rocket,
    label: 'Explodely',
    description: 'Identidade do seller e normalização monetária.',
    multiAccount: false,
    SettingsForm: ExplodelySettingsForm,
  },
};
