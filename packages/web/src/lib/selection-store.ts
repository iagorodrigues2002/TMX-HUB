import { create } from 'zustand';

export type SelectedEntity =
  | { kind: 'form'; id: string }
  | { kind: 'link'; id: string }
  | null;

interface SelectionState {
  selected: SelectedEntity;
  select: (entity: SelectedEntity) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selected: null,
  select: (entity) => set({ selected: entity }),
  clear: () => set({ selected: null }),
}));
