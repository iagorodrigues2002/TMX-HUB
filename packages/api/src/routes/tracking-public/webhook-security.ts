import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/secret-box.js';

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export const rawWebhookBodies = new WeakMap<FastifyRequest, Buffer>();

export async function captureRawWebhookBody(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: Readable,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks);
  rawWebhookBodies.set(request, rawBody);
  return Readable.from(rawBody);
}

export function webhookSignatureRequired() {
  // Compatibility default for local/dev; production should set this to true.
  return /^(1|true)$/i.test(process.env.WEBHOOK_SIGNATURE_REQUIRED?.trim() ?? 'false');
}

export function webhookSignatureIsValid(
  rawBody: Buffer,
  suppliedSignature: string | string[] | undefined,
  secret: string,
) {
  const supplied = Array.isArray(suppliedSignature) ? suppliedSignature[0] : suppliedSignature;
  if (!supplied) return false;
  const candidate = supplied
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(candidate, 'hex'));
}

export function verifyGatewayWebhook(input: {
  provider: 'vendepay' | 'paysight';
  request: FastifyRequest;
  encryptedSecret: string | null | undefined;
}) {
  // Temporary operator-controlled compatibility mode; URL-token validation
  // still runs before this function and stored signing secrets are retained.
  if (
    input.provider === 'vendepay' &&
    /^(1|true)$/i.test(process.env.VENDEPAY_SIGNATURE_DISABLED?.trim() ?? 'false')
  ) {
    return { accepted: true as const, secret: null };
  }
  const suppliedSignature =
    input.request.headers[`x-${input.provider}-signature`] ?? input.request.headers['x-signature'];
  if (!input.encryptedSecret) {
    if (webhookSignatureRequired()) {
      input.request.log.error(
        { provider: input.provider },
        'Webhook signature is required but the connection has no signing secret',
      );
      return { accepted: false as const, error: 'signature_not_configured' };
    }
    input.request.log.warn(
      { provider: input.provider, signature_present: Boolean(suppliedSignature) },
      'Webhook accepted without HMAC because the connection has no signing secret',
    );
    return { accepted: true as const, secret: null };
  }
  if (!env.TRACKING_ENCRYPTION_KEY) {
    input.request.log.error(
      { provider: input.provider },
      'Webhook signing secret cannot be decrypted because TRACKING_ENCRYPTION_KEY is unset',
    );
    return { accepted: false as const, error: 'signature_unavailable' };
  }
  let secret: string;
  try {
    secret = decryptSecret(input.encryptedSecret, env.TRACKING_ENCRYPTION_KEY);
  } catch (error) {
    input.request.log.error(
      { error, provider: input.provider },
      'Webhook signing secret could not be decrypted',
    );
    return { accepted: false as const, error: 'signature_unavailable' };
  }
  const rawBody = rawWebhookBodies.get(input.request);
  if (!rawBody || !webhookSignatureIsValid(rawBody, suppliedSignature, secret)) {
    input.request.log.warn(
      { provider: input.provider, signature_present: Boolean(suppliedSignature) },
      'Webhook rejected because its HMAC signature is invalid',
    );
    return { accepted: false as const, error: 'invalid_signature' };
  }
  return { accepted: true as const, secret };
}
