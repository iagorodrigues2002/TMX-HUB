// ---- Shield / Niche types ----

export interface NicheWhiteView {
  id: string;
  filename: string;
  bytes: number;
  label?: string;
  createdAt: string;
}

export interface NicheView {
  id: string;
  name: string;
  description?: string;
  whites: NicheWhiteView[];
  createdAt: string;
  updatedAt?: string;
  /** userId do criador. Útil pra mostrar "criado por…" no UI. */
  createdBy?: string;
  /** Servidor calcula: true se o usuário logado é admin OU criou o nicho. */
  canModify: boolean;
}

export interface NicheWhiteWire {
  id: string;
  filename: string;
  bytes: number;
  label?: string;
  created_at: string;
}

export interface NicheWire {
  id: string;
  name: string;
  description?: string;
  whites: NicheWhiteWire[];
  created_at: string;
  updated_at?: string;
  created_by?: string;
  can_modify?: boolean;
}

export function fromNicheWhiteWire(w: NicheWhiteWire): NicheWhiteView {
  return {
    id: w.id,
    filename: w.filename,
    bytes: w.bytes,
    label: w.label,
    createdAt: w.created_at,
  };
}

export function fromNicheWire(w: NicheWire): NicheView {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    whites: (w.whites ?? []).map(fromNicheWhiteWire),
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    createdBy: w.created_by,
    // Default true por defensividade — backend antigo (sem o campo) trata como modificável.
    canModify: w.can_modify ?? true,
  };
}
