'use client';

import { Button } from '@/components/ui/button';
import {
  NETWORK_TRACKING_TEMPLATES,
  type NetworkTrackingTemplateId,
} from '@/lib/network-templates';
import { cn } from '@/lib/utils';
import { Check, Copy, MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface NetworkTrackingCardProps {
  network: NetworkTrackingTemplateId;
  className?: string;
}

export function NetworkTrackingCard({ network, className }: NetworkTrackingCardProps) {
  const template = NETWORK_TRACKING_TEMPLATES[network];
  const [copied, setCopied] = useState(false);
  const titleId = `${template.id}-click-tracking-title`;

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(template.urlTemplate);
      setCopied(true);
      toast.success('Template de URL copiado.');
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error('Não foi possível copiar o template.');
    }
  }

  return (
    <aside
      aria-labelledby={titleId}
      className={cn('rounded-md border border-cyan-300/15 bg-cyan-300/[0.035] p-4', className)}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md border border-cyan-300/20 bg-cyan-300/[0.08] p-2 text-cyan-200">
          <MousePointerClick aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-medium text-white/85">
            Rastreamento de clique
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-white/50">
            O TMX detecta automaticamente cliques de {template.networkName} quando a URL contém{' '}
            <code className="text-cyan-100/80">{template.urlPattern}</code> e preserva os
            identificadores até o envio da conversão.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-white/65">Campos capturados</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Identificadores capturados">
          {template.fields.map((field) => (
            <li
              key={field.name}
              className="inline-flex min-h-8 items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1.5 text-xs text-white/60"
            >
              <Check aria-hidden className="h-3.5 w-3.5 text-emerald-300" />
              <code className="font-semibold text-emerald-100">{field.name}</code>
              <span className="hidden text-white/40 sm:inline">{field.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-white/65">Template para o anúncio</p>
            <p className="mt-1 text-[11px] leading-4 text-white/40">
              Cole nos parâmetros da URL da campanha; a rede substitui as macros no clique.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            aria-label={`Copiar template de ${template.networkName} com ${template.fields
              .map((field) => field.name)
              .join(', ')}`}
            onClick={() => void copyTemplate()}
          >
            {copied ? (
              <Check aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <Copy aria-hidden className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copiado' : 'Copiar template'}
          </Button>
        </div>
        <code className="mt-2 block overflow-x-auto rounded-md border border-white/[0.06] bg-black/25 p-3 text-[11px] leading-5 text-cyan-100/85">
          {template.urlTemplate}
        </code>
      </div>
    </aside>
  );
}
