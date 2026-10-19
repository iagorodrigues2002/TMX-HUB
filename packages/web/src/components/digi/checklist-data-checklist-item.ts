/**
 * Static checklist for Digistore24 product approval.
 * IDs are STABLE — never rename. Per-audit state is keyed by `${sectionId}:${itemId}`.
 *
 * Source: digistore24-checklist-cadastro-produto.md (Blackzada + CloakUp ops).
 */

export interface ChecklistItem {
  id: string;
  label: string;
  hint?: string;
  /** Highlight as critical — these block approval if pending. */
  critical?: boolean;
  /** Show a URL field next to the checkbox. */
  hasUrl?: boolean;
}
