'use client';

import { Button } from '@/components/ui/button';
import type { OfferView } from '@/lib/api-client';
import { Activity, Building2, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from './status-badge';

export function OfferCard({
  offer,
  onEdit,
  onDelete,
}: {
  offer: OfferView;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="glass-card flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/ofertas/${offer.id}`}
              className="truncate text-[15px] font-semibold text-white hover:text-cyan-200"
            >
              {offer.name}
            </Link>
            <StatusBadge status={offer.status} />
          </div>
          {offer.companyName && (
            <p className="flex items-center gap-1.5 text-[11px] text-white/45">
              <Building2 className="h-3.5 w-3.5" />
              {offer.companyName}
            </p>
          )}
          {offer.description && (
            <p className="line-clamp-2 text-[12px] text-white/55">{offer.description}</p>
          )}
          {offer.dashboardId && (
            <p className="truncate font-mono text-[10px] text-white/35">
              dashboard: {offer.dashboardId}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Editar oferta">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm(`Remover oferta "${offer.name}" e todos os dados?`)) onDelete();
            }}
            aria-label="Remover oferta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Button asChild size="sm" variant="outline" className="w-full">
        <Link href={`/ofertas/${offer.id}`}>
          <Activity className="h-3.5 w-3.5" />
          Abrir métricas e anúncios
        </Link>
      </Button>
    </div>
  );
}
