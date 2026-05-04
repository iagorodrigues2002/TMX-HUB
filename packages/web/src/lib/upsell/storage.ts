import type { CheckoutPlatform } from './checkout-presets';
import type { ColumnMap, FrontConfig, FunnelStepConfig } from './calc';

const STORAGE_KEY = 'tmx-hub:upsell-presets:v1';

export interface SavedPreset {
  id: string; // ulid-like id (timestamp-based)
  name: string;
  platform: CheckoutPlatform;
  frontColumns: ColumnMap;
  upsellColumns: ColumnMap;
  front: FrontConfig;
  steps: FunnelStepConfig[];
  savedAt: string;
}

function safeRead(): SavedPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedPreset[];
  } catch {
    return [];
  }
}

function safeWrite(presets: SavedPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // quota or disabled storage — ignore
  }
}

export function listPresets(): SavedPreset[] {
  return safeRead().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export function savePreset(preset: Omit<SavedPreset, 'id' | 'savedAt'>): SavedPreset {
  const all = safeRead();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // If a preset with the same name exists, replace it (overwrite semantics).
  const filtered = all.filter((p) => p.name.trim() !== preset.name.trim());
  const next: SavedPreset = { ...preset, id, savedAt: new Date().toISOString() };
  filtered.push(next);
  safeWrite(filtered);
  return next;
}

export function deletePreset(id: string): void {
  const all = safeRead();
  safeWrite(all.filter((p) => p.id !== id));
}

export function getPreset(id: string): SavedPreset | null {
  return safeRead().find((p) => p.id === id) ?? null;
}
