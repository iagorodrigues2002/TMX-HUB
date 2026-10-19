import { z } from 'zod';

export const DestinationSchema = z.object({
  name: z.string().trim().min(1).max(80).default('UTMify'),
  api_token: z.string().trim().min(16).max(4096),
  endpoint_url: z.string().url().default('https://api.utmify.com.br/api-credentials/orders'),
});

export const DestinationEnabledSchema = z.object({ enabled: z.boolean() });
