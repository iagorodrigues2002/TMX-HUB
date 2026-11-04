import type { QueryClient } from '@tanstack/react-query';
import { setPersonalStorageOwner } from './personal-storage';
import { clearRouteSnapshot } from './route-snapshot';
import { useSelectionStore } from './selection-store';

let sessionGeneration = 0;

/** Fence asynchronous mutations as well as queries across identity changes. */
export function getSessionGeneration(): number {
  return sessionGeneration;
}

export function resetSessionData(client: QueryClient): void {
  sessionGeneration += 1;
  // Cancel first so a request started by A cannot repopulate B's cache later.
  void client.cancelQueries();
  client.clear();
  useSelectionStore.getState().clear();
  setPersonalStorageOwner(null);
  if (typeof window !== 'undefined') {
    clearRouteSnapshot();
    try {
      window.sessionStorage.removeItem('tmx-google-oauth');
    } catch {
      /* optional */
    }
  }
}
