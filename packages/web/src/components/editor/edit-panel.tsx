'use client';

import { MousePointer } from 'lucide-react';
import type { Form, Link } from '@page-cloner/shared';
import { useSelectionStore } from '@/lib/selection-store';
import { FormEditor } from './form-editor';
import { LinkEditor } from './link-editor';

interface EditPanelProps {
  jobId: string;
  forms: Form[];
  links: Link[];
}

export function EditPanel({ jobId, forms, links }: EditPanelProps) {
  const selected = useSelectionStore((s) => s.selected);

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#04101A]/40 p-6 text-center">
        <MousePointer className="h-8 w-8 text-white/25" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Selecione um forma ou link
        </p>
        <p className="max-w-[220px] text-[12px] text-white/40">
          Use a árvore à esquerda para navegar e editar elementos da página clonada.
        </p>
      </div>
    );
  }

  if (selected.kind === 'form') {
    const form = forms.find((f) => f.id === selected.id);
    if (!form) {
      return (
        <div className="flex h-full items-center justify-center bg-[#04101A]/40 p-6 text-[12px] text-white/45">
          Formulário não encontrado.
        </div>
      );
    }
    return (
      <div className="h-full bg-[#04101A]/40">
        <FormEditor jobId={jobId} form={form} />
      </div>
    );
  }

  const link = links.find((l) => l.id === selected.id);
  if (!link) {
    return (
      <div className="flex h-full items-center justify-center bg-[#04101A]/40 p-6 text-[12px] text-white/45">
        Link não encontrado.
      </div>
    );
  }
  return (
    <div className="h-full bg-[#04101A]/40">
      <LinkEditor jobId={jobId} link={link} />
    </div>
  );
}
