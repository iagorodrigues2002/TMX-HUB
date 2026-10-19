// ---- Digistore24 Audit types ----

export type DigiAuditStatusView = 'draft' | 'in_review' | 'approved' | 'rejected' | 'abandoned';

export type DigiItemStateView = 'pending' | 'done' | 'na';

export interface DigiAuditItemView {
  state: DigiItemStateView;
  notes?: string;
  url?: string;
}

export interface DigiAuditView {
  id: string;
  productName: string;
  offerId?: string;
  status: DigiAuditStatusView;
  items: Record<string, DigiAuditItemView>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DigiAuditWire {
  id: string;
  product_name: string;
  offer_id?: string;
  status: DigiAuditStatusView;
  items: Record<string, DigiAuditItemView>;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function fromDigiAuditWire(w: DigiAuditWire): DigiAuditView {
  return {
    id: w.id,
    productName: w.product_name,
    offerId: w.offer_id,
    status: w.status,
    items: w.items ?? {},
    notes: w.notes,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}
