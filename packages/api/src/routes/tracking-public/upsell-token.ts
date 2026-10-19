import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { env } from '../../env.js';

export type UpsellToken = {
  projectId: string;
  stageId: string;
  visitorId: string;
  journeyId: string;
  issuedAt: number;
};

export const upsellSignature = (encoded: string, secret: string) =>
  createHmac('sha256', secret).update(`upsell|${encoded}`).digest('base64url');

export function createUpsellToken(payload: Omit<UpsellToken, 'issuedAt'>) {
  const encoded = Buffer.from(
    JSON.stringify({ ...payload, issuedAt: Math.floor(Date.now() / 1000) }),
  ).toString('base64url');
  return `${encoded}.${upsellSignature(encoded, env.WEBHOOK_SECRET)}`;
}

export function readUpsellToken(token: string, request: FastifyRequest): UpsellToken | null {
  const [encoded, supplied] = token.split('.');
  if (!encoded || !supplied) return null;
  const a = Buffer.from(supplied);
  const matches = (secret: string) => {
    const expected = Buffer.from(upsellSignature(encoded, secret));
    return a.length === expected.length && timingSafeEqual(a, expected);
  };
  if (!matches(env.WEBHOOK_SECRET)) {
    if (!env.WEBHOOK_SECRET_PREV || !matches(env.WEBHOOK_SECRET_PREV)) return null;
    request.server.log.warn('Signed upsell token accepted with previous webhook secret');
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UpsellToken;
    return parsed?.projectId && parsed?.stageId && parsed?.visitorId && parsed?.journeyId
      ? parsed
      : null;
  } catch {
    return null;
  }
}
