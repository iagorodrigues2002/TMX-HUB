import { z } from 'zod';
import { zodToProblem } from '../../lib/problem.js';

export const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

export function mergeAdvancedGateways<
  TGateway extends Record<string, unknown>,
  TVendepayConnection extends Record<string, unknown>,
>(gateways: TGateway[], vendepayConnections: TVendepayConnection[]) {
  return [
    ...gateways.filter((gateway) => gateway.provider !== 'vendepay'),
    ...vendepayConnections.map((connection) => ({
      ...connection,
      provider: 'vendepay' as const,
      managed: true as const,
    })),
  ];
}

export const DomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, '').split('/')[0] ?? '')
    .pipe(z.string().min(3).max(253)),
  kind: z.enum(['source', 'tracking']).default('source'),
});

export const MetaRulesSchema = z.object({
  attributed_only: z.boolean(),
  minimum_amount_minor: z.number().int().min(0),
});

export const UpsellManualResultSchema = z.object({
  result: z.enum(['worked', 'failed']),
});

export const GatewaySchema = z.object({
  provider: z.enum(['vendepay', 'cooud']),
  propagation_param: z.string().trim().min(1).max(32).default('src'),
});

export const AbSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['checkout', 'presell']),
  traffic_a: z.number().int().min(1).max(99).default(50),
  variants: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        gateway: z.string().trim().max(40).nullable().optional(),
        destination_url: z.string().url().nullable().optional(),
      }),
    )
    .length(2),
});

export const AbControlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('select_winner'), variant_id: z.string().min(8).max(40) }),
  z.object({
    action: z.literal('update_config'),
    name: z.string().trim().min(2).max(120),
    traffic_a: z.number().int().min(1).max(99),
    variants: z
      .array(
        z.object({
          id: z.string().min(8).max(40),
          label: z.string().trim().min(1).max(80),
          destination_url: z.string().url().max(4096),
        }),
      )
      .length(2),
  }),
]);

export const EntryLinkSchema = z.object({
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
  traffic_source: z
    .enum(['meta', 'google', 'tiktok', 'native', 'organic', 'email', 'other'])
    .default('other'),
});

export const EntryLinkUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  destination_url: z.string().url().max(4096),
  traffic_source: z
    .enum(['meta', 'google', 'tiktok', 'native', 'organic', 'email', 'other', 'unknown'])
    .optional(),
});

export const EntryLinkAbSchema = z.object({
  name: z.string().trim().min(2).max(120),
  traffic_a: z.number().int().min(1).max(99).default(50),
  variants: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        destination_url: z.string().url().max(4096),
      }),
    )
    .length(2),
});

export const VturbConfigSchema = z
  .object({
    enabled: z.boolean(),
    analytics_api_token: z.string().trim().min(20).max(512).optional(),
    endpoint_url: z.string().url().max(2048).optional().or(z.literal('')),
    player_id: z.string().trim().max(128).optional().nullable(),
    comparison_group_id: z.string().trim().max(128).optional().nullable(),
    conversion_param: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_]{1,32}$/)
      .default('vtid'),
  })
  .refine((value) => !(value.player_id && value.comparison_group_id), {
    message: 'Selecione uma VSL ou um teste A/B, nunca os dois.',
    path: ['comparison_group_id'],
  });

export type VturbPlayer = { id: string; name: string; pitch_time: number; duration: number };

export type VturbComparisonGroup = {
  id: string;
  name: string;
  player_ids: string[];
  players: Array<{
    player_id: string;
    traffic_percentage: number;
    started_at: string | null;
    locked: boolean;
  }>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export const ProductKindSchema = z.object({
  product_id: z.string().trim().min(1).max(256),
  kind: z.string().regex(/^(front|upsell|upsell_[2-9][0-9]*)$/),
  label: z.string().trim().max(120).nullable().optional(),
});

export const UpsellStageSchema = z.object({
  stage_key: z.string().regex(/^upsell_[1-9][0-9]*$/),
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
  connection_destinations: z
    .record(z.string(), z.string().url().max(4096))
    .default({})
    .refine(
      (urls) =>
        !urls['gateway:syzepay'] || urls['gateway:syzepay'].toLowerCase().startsWith('https://'),
      'A URL SyzePay deve usar HTTPS.',
    ),
});

export const UpsellStageUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
  connection_destinations: z
    .record(z.string(), z.string().url().max(4096))
    .default({})
    .refine(
      (urls) =>
        !urls['gateway:syzepay'] || urls['gateway:syzepay'].toLowerCase().startsWith('https://'),
      'A URL SyzePay deve usar HTTPS.',
    ),
  enabled: z.boolean().optional(),
});

export function parsed<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw zodToProblem(result.error);
  return result.data;
}
