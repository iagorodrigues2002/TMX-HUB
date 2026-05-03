import { z } from 'zod';

const ClientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
});

const parsed = ClientEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  // Surface a readable error during build/runtime if env is malformed.
  // eslint-disable-next-line no-console
  console.error('Invalid client env:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid NEXT_PUBLIC_* environment variables.');
}

export const env = parsed.data;
