import { CHECKLIST } from './checklist-data';

// Helpers
export function totalItems(): number {
  return CHECKLIST.reduce((acc, s) => acc + s.items.length, 0);
}
