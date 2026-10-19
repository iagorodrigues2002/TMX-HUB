'use client';
import type { UpsellStageKey } from '@/lib/api-client';
import type { TrackingProductKind } from '@/lib/api-client';
export const trackingDomainPreview = (value: string) => {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    ?.replace(/:\d+$/, '');
  if (!hostname) return null;
  const parts = hostname.split('.');
  const compoundSuffix = /\.(com|net|org|gov|edu)\.[a-z]{2}$/.test(hostname);
  const rootSize = compoundSuffix ? 3 : 2;
  if (parts.length < rootSize) return null;
  return `tmx.${parts.slice(-rootSize).join('.')}`;
};

export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function saoPauloDateOffset(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return saoPauloDate(date);
}

export function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.max(0, Math.round(seconds % 60))).padStart(2, '0')}`;
}

export const upsellStageNumber = (key: UpsellStageKey) => Number(key.slice('upsell_'.length));

export const upsellStageLabel = (key: UpsellStageKey) => `Upsell ${upsellStageNumber(key)}`;

export const stageKeyToProductKind = (key: UpsellStageKey): TrackingProductKind =>
  key === 'upsell_1' ? 'upsell' : key;

export const UPSELL_STAGE_OPTIONS = Array.from(
  { length: 20 },
  (_, index) => `upsell_${index + 1}` as UpsellStageKey,
);

export const UPSELL_IDENTITIES_PAGE_SIZE = 50;
