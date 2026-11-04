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
      className={cn('rounded-md border border-border bg-accent p-4', className)}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md border border-border bg-accent p-2 text-primary">
          <MousePointerClick aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-medium text-foreground">
            Rastreamento de clique
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            O TMX detecta automaticamente cliques de {template.networkName} quando a URL contém{' '}
            <code className="text-primary">{template.urlPattern}</code> e preserva os
            identificadores até o envio da conversão.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">Campos capturados</p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Identificadores capturados">
          {template.fields.map((field) => (
            <li
              key={field.name}
              className="inline-flex min-h-8 items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs text-muted-foreground"
            >
              <Check aria-hidden className="h-3.5 w-3.5 text-success" />
              <code className="font-semibold text-success">{field.name}</code>
              <span className="hidden text-muted-foreground sm:inline">{field.description}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Template para o anúncio</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
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
        <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-accent p-3 text-[11px] leading-5 text-primary">
          {template.urlTemplate}
        </code>
      </div>
    </aside>
  );
}
