import { CHECKLIST } from './checklist-data';

export function totalCriticalItems(): number {
  return CHECKLIST.reduce((acc, s) => acc + s.items.filter((i) => i.critical).length, 0);
}
