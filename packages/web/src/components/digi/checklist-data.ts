import { checklist_affiliation } from './checklist-data-checklist-affiliation';
import { checklist_cloaker } from './checklist-data-checklist-cloaker';
import { checklist_delivery } from './checklist-data-checklist-delivery';
import { checklist_domains } from './checklist-data-checklist-domains';
import { checklist_ipn } from './checklist-data-checklist-ipn';
import { checklist_launch } from './checklist-data-checklist-launch';
import { checklist_monitor } from './checklist-data-checklist-monitor';
import { checklist_pages } from './checklist-data-checklist-pages';
import { checklist_pre } from './checklist-data-checklist-pre';
import { checklist_product } from './checklist-data-checklist-product';
import { checklist_rotator } from './checklist-data-checklist-rotator';
import type { ChecklistSection } from './checklist-data-checklist-section';

export const CHECKLIST: ChecklistSection[] = [
  checklist_pre,
  checklist_domains,
  checklist_cloaker,
  checklist_product,
  checklist_affiliation,
  checklist_rotator,
  checklist_pages,
  checklist_delivery,
  checklist_ipn,
  checklist_launch,
  checklist_monitor,
];
export type { ChecklistItem } from './checklist-data-checklist-item';
export type { ChecklistSection } from './checklist-data-checklist-section';
export { itemKey } from './checklist-data-item-key';
export { RED_FLAG_ACTION } from './checklist-data-red-flag-action';
export { RED_FLAGS } from './checklist-data-red-flags';
export { totalCriticalItems } from './checklist-data-total-critical-items';
export { totalItems } from './checklist-data-total-items';
