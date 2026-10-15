import type { QueryClient } from '@tanstack/react-query';
import { setPersonalStorageOwner } from './personal-storage';
import { useSelectionStore } from './selection-store';

export function resetSessionData(client: QueryClient): void {
  // Cancel first so a request started by A cannot repopulate B's cache later.
  void client.cancelQueries();
  client.clear();
  useSelectionStore.getState().clear();
  setPersonalStorageOwner(null);
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem('tmx-google-oauth'); } catch { /* optional */ }
  }
}
