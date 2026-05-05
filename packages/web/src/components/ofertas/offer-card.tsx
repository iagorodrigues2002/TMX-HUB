'use client';

import Link from 'next/link';
import { Activity, Copy, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { OfferLink, OfferView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error(`Não consegui copiar ${label}.`),
  );
}

interface LinkRowProps {
  index: number;
  group: 'Front' | 'Upsell';
  link: OfferLink;
}

function LinkRow({ index, group, link }: LinkRowProps) {
  const title = link.label?.trim() || `${group} ${index + 1}`;
  const hasWhite = !!link.whiteUrl;
  const hasBlack = !!link.blackUrl;

  return (
    <div className="rounded-md border border-white/[0.06] bg-black/15 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
          {title}
        </p>
        <div className="flex items-center gap-1 text-[10px] text-white/35">
          <span className={hasWhite ? 'text-emerald-300/80' : ''}>W</span>
          <span>·</span>
          <span className={hasBlack ? 'text-rose-300/80' : ''}>B</span>
        </div>
      </div>
      <div className="grid gap-1.5">
        <UrlRow color="white" url={link.whiteUrl} />
        <UrlRow color="black" url={link.blackUrl} />
      </div>
    </div>
  );
}

function UrlRow({ color, url }: { color: 'white' | 'black'; url?: string }) {
  const dotClass = color === 'white' ? 'bg-emerald-300/70' : 'bg-rose-300/70';
  const empty = !url;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="w-3 shrink-0 text-[9px] uppercase tracking-[0.12em] text-white/40">
        {color === 'white' ? 'W' : 'B'}
      </span>
      {empty ? (
        <span className="flex-1 italic text-white/30">vazio</span>
      ) : (
        <span className="flex-1 truncate font-mono text-white/75" title={url}>
          {url}
        </span>
      )}
      {!empty && (
        <>
          <button
            type="button"
            onClick={() => copy(url!, color === 'white' ? 'White URL' : 'Black URL')}
            className="text-white/45 hover:text-cyan-300"
            title="Copiar"
          >
            <Copy className="h-3 w-3" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-white/45 hover:text-cyan-300"
            title="Abrir"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </div>
  );
}

export function OfferCard({
  offer,
  onEdit,
  onDelete,
}: {
  offer: OfferView;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const fronts = offer.fronts ?? [];
  const upsells = offer.upsells ?? [];

  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/ofertas/${offer.id}`}
              className="truncate text-[15px] font-semibold text-white hover:text-cyan-200"
            >
              {offer.name}
            </Link>
            <StatusBadge status={offer.status} />
          </div>
          {offer.description && (
            <p className="line-clamp-2 text-[12px] text-white/55">{offer.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label="Editar oferta"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`Remover oferta "${offer.name}" e todos os snapshots?`)) onDelete();
            }}
            aria-label="Remover oferta"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Fronts */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="hud-label">Front ({fronts.length})</p>
        </div>
        {fronts.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/[0.01] px-3 py-3 text-center text-[11px] italic text-white/35">
            sem links de front
          </p>
        ) : (
          <div className="space-y-2">
            {fronts.map((l, i) => (
              <LinkRow key={l.id} index={i} group="Front" link={l} />
            ))}
          </div>
        )}
      </div>

      {/* Upsells */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <p className="hud-label">Upsell ({upsells.length})</p>
        </div>
        {upsells.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/[0.01] px-3 py-3 text-center text-[11px] italic text-white/35">
            sem links de upsell
          </p>
        ) : (
          <div className="space-y-2">
            {upsells.map((l, i) => (
              <LinkRow key={l.id} index={i} group="Upsell" link={l} />
            ))}
          </div>
        )}
      </div>

      <Button asChild size="sm" variant="outline" className="mt-auto w-full">
        <Link href={`/ofertas/${offer.id}`}>
          <Activity className="h-3.5 w-3.5" />
          Abrir métricas
        </Link>
      </Button>
    </div>
  );
}
