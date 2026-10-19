'use client';

import { toast } from 'sonner';

export type SlotMode =
  | 'alnum' // letters + digits, mixed case
  | 'lowerAlnum' // letters + digits, lowercase
  | 'hex' // 0-9 a-f
  | 'numeric' // digits only
  | 'letters' // letters only
  | 'uuid' // uuid v4
  | 'static' // fixed value
  | 'pick';

// pick from list

export interface ParamSlot {
  id: string;
  name: string;
  mode: SlotMode;
  length: number;
  staticValue: string; // for 'static' & 'pick' (CSV)
}

export const ALPHABETS: Record<Exclude<SlotMode, 'uuid' | 'static' | 'pick'>, string> = {
  alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  lowerAlnum: 'abcdefghijklmnopqrstuvwxyz0123456789',
  hex: '0123456789abcdef',
  numeric: '0123456789',
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
};

export const MODE_LABELS: Record<SlotMode, string> = {
  alnum: 'Alfanumérico (A-Z a-z 0-9)',
  lowerAlnum: 'Alfanumérico minúsculo',
  hex: 'Hexadecimal (0-9 a-f)',
  numeric: 'Numérico (0-9)',
  letters: 'Apenas letras',
  uuid: 'UUID v4',
  static: 'Valor fixo',
  pick: 'Sortear de lista (CSV)',
};

export function newSlotId(): string {
  return `s_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}

export function emptySlot(name = 't', mode: SlotMode = 'alnum', length = 8): ParamSlot {
  return { id: newSlotId(), name, mode, length, staticValue: '' };
}

export function randomFromAlphabet(alphabet: string, length: number): string {
  const out = new Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(length);
    crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out[i] = alphabet[buf[i]! % alphabet.length];
  } else {
    for (let i = 0; i < length; i++) {
      out[i] = alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return out.join('');
}

export function uuidV4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (rare path).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateValue(slot: ParamSlot): string {
  switch (slot.mode) {
    case 'uuid':
      return uuidV4();
    case 'static':
      return slot.staticValue;
    case 'pick': {
      const items = slot.staticValue
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length === 0) return '';
      const idx = randomIntLessThan(items.length);
      return items[idx]!;
    }
    default:
      return randomFromAlphabet(ALPHABETS[slot.mode], Math.max(1, slot.length));
  }
}

export function randomIntLessThan(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % max;
  }
  return Math.floor(Math.random() * max);
}

export interface BuildOpts {
  baseUrl: string;
  slots: ParamSlot[];
  count: number;
  unique: boolean;
}

export function buildUrl(base: string, slots: ParamSlot[]): string {
  const parts: string[] = [];
  for (const s of slots) {
    const name = s.name.trim();
    if (!name) continue;
    const val = generateValue(s);
    if (val === '' && s.mode !== 'static') continue;
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`);
  }
  if (parts.length === 0) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${parts.join('&')}`;
}

export function generateBatch({ baseUrl, slots, count, unique }: BuildOpts): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10 + 50;
  while (out.length < count && attempts < maxAttempts) {
    attempts++;
    const url = buildUrl(baseUrl, slots);
    if (unique) {
      if (seen.has(url)) continue;
      seen.add(url);
    }
    out.push(url);
  }
  return out;
}

export function copyText(value: string, label = 'Texto'): void {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

export function downloadText(value: string, filename: string): void {
  const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const PRESETS: Record<string, ParamSlot[]> = {
  'Token simples': [emptySlot('t', 'alnum', 10)],
  'Meta-friendly (ref + tk)': [emptySlot('ref', 'lowerAlnum', 8), emptySlot('tk', 'hex', 16)],
  'UTMs + token': [
    { ...emptySlot('utm_source', 'static', 0), staticValue: 'fb' },
    { ...emptySlot('utm_medium', 'static', 0), staticValue: 'cpc' },
    {
      ...emptySlot('utm_campaign', 'pick', 0),
      staticValue: 'pflv1, pflv2, pflv3',
    },
    emptySlot('t', 'hex', 12),
  ],
  'UUID puro': [emptySlot('id', 'uuid', 0)],
};
