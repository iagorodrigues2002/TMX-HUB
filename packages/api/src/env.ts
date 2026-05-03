import { z } from 'zod';

const booleanFromString = z.union([z.boolean(), z.string()]).transform((v) => {
  if (typeof v === 'boolean') return v;
  return v.toLowerCase() === 'true' || v === '1';
});

const numberFromString = z.coerce.number();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // PORT is the platform-standard env var (Railway/Heroku/Fly all set it).
  // We honor PORT when present, otherwise fall back to API_PORT or 4000.
  PORT: numberFromString.optional(),
  API_PORT: numberFromString.default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('clones'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  MAX_RENDER_TIMEOUT_MS: numberFromString.default(90_000),
  MAX_ASSET_BYTES: numberFromString.default(26_214_400),
  MAX_TOTAL_BYTES: numberFromString.default(262_144_000),
  BROWSER_POOL_SIZE: numberFromString.default(3),

  WEBHOOK_SECRET: z.string().default('dev-webhook-secret-change-me-in-production'),

  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

export const env: Env = loadEnv();
