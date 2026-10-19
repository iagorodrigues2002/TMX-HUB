import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type Params = { id: string; destinationId: string };

export const path = '/offers/:id/tracking/google-ads/destinations/:destinationId/oauth';

export const OAuthStatePayloadSchema = z
  .object({
    version: z.literal(1),
    user_id: z.string().min(1),
    offer_id: z.string().min(1),
    destination_id: z.string().min(1),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export function signOAuthState(payload: z.infer<typeof OAuthStatePayloadSchema>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string, secret: string) {
  const [encoded, signature, extra] = state.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    return (
      OAuthStatePayloadSchema.safeParse(
        JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
      ).data ?? null
    );
  } catch {
    return null;
  }
}
