// ---- Digistore24 Approval Audit ----

export type DigiAuditStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'abandoned';

export type DigiItemState = 'pending' | 'done' | 'na';

export interface DigiAuditItem {
  state: DigiItemState;
  notes?: string;
  /** Optional URL the user pasted for this item (e.g. sales page URL). */
  url?: string;
}

export interface DigiAudit {
  id: string;
  userId: string;
  productName: string;
  /** Optional link to a TMX HUB Offer. */
  offerId?: string;
  status: DigiAuditStatus;
  /** Per-item state map keyed by `${sectionId}:${itemId}`. */
  items: Record<string, DigiAuditItem>;
  /** Overall free-form notes for the audit. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDigiAuditRequest {
  product_name: string;
  offer_id?: string;
}

export interface UpdateDigiAuditRequest {
  product_name?: string;
  offer_id?: string;
  status?: DigiAuditStatus;
  notes?: string;
  /** Replace one item state (partial — keys not present are kept). */
  items?: Record<string, DigiAuditItem>;
}
