import type { FastifyInstance } from 'fastify';

export const invalidateOfferAnalytics = (app: FastifyInstance, offerId: string) =>
  app.hasDecorator('invalidateAnalyticsCache')
    ? app.invalidateAnalyticsCache({ offerId })
    : Promise.resolve();

export const transparentGif = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
);

export function validBrowserEventId(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

export function safeEventSourceUrl(value: string | undefined) {
  if (!value || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const cookieValue = (cookie: string | undefined, name: string) =>
  cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export function requestCountry(headers: Record<string, string | string[] | undefined>) {
  for (const name of [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'x-country-code',
  ]) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && /^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  }
  return undefined;
}
