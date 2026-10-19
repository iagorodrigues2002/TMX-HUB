import type { ChecklistItem } from './checklist-data-checklist-item';

export interface ChecklistSection {
  id: string;
  title: string;
  emoji: string;
  /** Short context shown when section is open. */
  context?: string;
  items: ChecklistItem[];
}
