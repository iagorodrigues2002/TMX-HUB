const KEY = 'tmx-hub:webhook-history:v1';
const MAX = 20;

export interface WebhookHistoryEntry {
  id: string;
  /** Timestamp (ISO). */
  at: string;
  /** Template id, eg "hotmart.purchase_approved", or null when freeform. */
  templateId: string | null;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
}

function safeRead(): WebhookHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WebhookHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(list: WebhookHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // ignore quota errors
  }
}

export function listHistory(): WebhookHistoryEntry[] {
  return safeRead();
}

export function pushHistory(entry: Omit<WebhookHistoryEntry, 'id' | 'at'>): WebhookHistoryEntry {
  const next: WebhookHistoryEntry = {
    ...entry,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
  };
  safeWrite([next, ...safeRead()]);
  return next;
}

export function clearHistory(): void {
  safeWrite([]);
}
