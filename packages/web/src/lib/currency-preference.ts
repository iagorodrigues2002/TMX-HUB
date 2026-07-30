'use client';

import { useEffect, useState } from 'react';

export type DisplayCurrency = 'BRL' | 'USD';

const STORAGE_KEY = 'tmx-hub:tracking-currency';
const DEFAULT: DisplayCurrency = 'BRL';

function readStored(): DisplayCurrency {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'USD' || raw === 'BRL' ? raw : DEFAULT;
}

/**
 * Small hook that persists the operator's preferred display currency for
 * the tracking module. Every KPI/table that shows revenue reads from the
 * same source of truth via useDisplayCurrency(). Cross-tab sync via the
 * `storage` event keeps two open tabs coherent.
 */
export function useDisplayCurrency(): [DisplayCurrency, (next: DisplayCurrency) => void] {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(DEFAULT);

  useEffect(() => {
    setCurrencyState(readStored());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setCurrencyState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setCurrency = (next: DisplayCurrency) => {
    setCurrencyState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Nudge other listeners in the same tab (the storage event doesn't
      // fire in the tab that wrote it).
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next }));
    }
  };

  return [currency, setCurrency];
}

export function formatMoney(minor: string | number | undefined, currency: DisplayCurrency): string {
  const value = Number(minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number.isFinite(value) ? value : 0);
  }
}
