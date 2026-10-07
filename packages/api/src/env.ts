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
  DATABASE_URL: z.string().optional(),
  TRACKING_ENCRYPTION_KEY: z.string().min(32).optional(),
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v25.0'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('clones'),
  // Production validation below rejects short/default credentials. Development
  // keeps the docker-compose MinIO defaults so a local checkout can boot.
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  MAX_RENDER_TIMEOUT_MS: numberFromString.default(90_000),
  MAX_ASSET_BYTES: numberFromString.default(26_214_400),
  MAX_TOTAL_BYTES: numberFromString.default(262_144_000),
  BROWSER_POOL_SIZE: numberFromString.default(3),
  READYZ_SKIP_OPTIONAL: booleanFromString.default(false),

  WEBHOOK_SECRET: z
    .string()
    .min(32)
    .refine((s) => s !== 'dev-webhook-secret-change-me-in-production', {
      message: 'WEBHOOK_SECRET must not use the development default',
    })
    .default('dev-webhook-secret-replace-before-going-live'),
  WEBHOOK_SECRET_PREV: z.string().min(1).optional(),
  EXPLODELY_REQUIRE_SIGNATURE: booleanFromString.default(true),
  EXPLODELY_WEBHOOK_SECRET: z.string().optional(),
  // Opt-in because historical webhook replay may depend on the original PII.
  WEBHOOK_PAYLOAD_SCRUB: booleanFromString.default(false),

  // Auth — JWT signing secret. Required in every environment.
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((secret) => secret !== 'dev-jwt-secret-change-me-in-production', {
      message: 'must not use the development default',
    }),
  // Bootstrap admin (created on first boot if no users exist).
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('Admin'),
  // Allow self-registration via /v1/auth/register. Off by default — TMX HUB
  // is intended for invited operators.
  ALLOW_REGISTRATION: booleanFromString.default(false),

  // Accept any string so Railway template refs like "https://${{DOMAIN}}"
  // don't crash on startup if the variable isn't resolved yet.
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  TRACKING_PUBLIC_BASE_URL: z.string().url().default('https://theminex.com'),
  YOUTUBE_REWARDS_WEBHOOK_URL: z.string().url().optional(),
  YOUTUBE_REWARDS_WEBHOOK_SECRET: z.string().min(24).optional(),
  YOUTUBE_REWARDS_SITE_BYPASS_TOKEN: z.string().optional(),
  RAILWAY_PROJECT_TOKEN: z.string().optional(),
  RAILWAY_PROJECT_ID: z.string().default('3704cd93-6011-4e5f-be52-f229b499b018'),
  RAILWAY_ENVIRONMENT_ID: z.string().default('bbb09ce3-96ce-44d4-8a3c-d8c8f25f558b'),
  RAILWAY_API_SERVICE_ID: z.string().default('a8bb8afa-b7a3-4b41-827d-d91fd3a283a4'),

  // Brevo (Sendinblue) — transactional email for invite flow.
  // Optional in dev (skipped with warning); required in production.
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().default('convites@theminex.com'),
  BREVO_SENDER_NAME: z.string().default('TMX Hub'),
  // Base URL for the invite accept link — e.g. https://app.theminex.com/invite
  INVITE_ACCEPT_URL_BASE: z.string().default('http://localhost:3100/invite'),

  // AssemblyAI — used by /v1/shield-jobs to verify the protected output is
  // un-transcribable. Optional; if missing, verification is silently skipped.
  ASSEMBLYAI_API_KEY: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;

  for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const) {
    if (value[key].length < 16 || value[key] === 'minioadmin') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be at least 16 characters and must not use the MinIO default`,
      });
    }
  }
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
