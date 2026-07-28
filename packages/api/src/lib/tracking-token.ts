import { createHmac, timingSafeEqual } from 'node:crypto';

interface TrackingTokenPayload {
  projectId: string;
  visitorId: string;
  journeyId: string;
  issuedAt: number;
}

const signature = (encoded: string, secret: string) =>
  createHmac('sha256', secret).update(encoded).digest('base64url');

export function createTrackingToken(
  payload: Omit<TrackingTokenPayload, 'issuedAt'>,
  secret: string,
): string {
  const encoded = Buffer.from(
    JSON.stringify({ ...payload, issuedAt: Math.floor(Date.now() / 1000) }),
  ).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function readTrackingToken(token: string, secret: string): TrackingTokenPayload | null {
  const [encoded, suppliedSignature] = token.split('.');
  if (!encoded || !suppliedSignature) return null;
  const expected = signature(encoded, secret);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<TrackingTokenPayload>;
    if (
      typeof payload.projectId !== 'string' ||
      typeof payload.visitorId !== 'string' ||
      typeof payload.journeyId !== 'string' ||
      typeof payload.issuedAt !== 'number'
    ) {
      return null;
    }
    return payload as TrackingTokenPayload;
  } catch {
    return null;
  }
}
