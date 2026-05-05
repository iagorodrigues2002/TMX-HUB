'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiClient,
  type OfferLink,
  type OfferStatus,
  type OfferView,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_LIST, statusLabel } from './status-badge';

function newId(): string {
  // Cheap unique id for client-side rows; server doesn't enforce format.
  return `lnk_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function emptyLink(): OfferLink {
  return { id: newId(), label: '', whiteUrl: '', blackUrl: '' };
}

interface Props {
  offer: OfferView;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OfferEditDialog({ offer, open, onOpenChange }: Props) {
  const qc = useQueryClient();

  // Local form state — initialized from offer when dialog opens.
  const [name, setName] = useState(offer.name);
  const [description, setDescription] = useState(offer.description ?? '');
  const [dashboardId, setDashboardId] = useState(offer.dashboardId ?? '');
  const [status, setStatus] = useState<OfferStatus>(offer.status);
  const [fronts, setFronts] = useState<OfferLink[]>(() => normalize(offer.fronts));
  const [upsells, setUpsells] = useState<OfferLink[]>(() => normalize(offer.upsells));

  // Re-sync when the dialog (re)opens with a possibly different offer.
  useEffect(() => {
    if (!open) return;
    setName(offer.name);
    setDescription(offer.description ?? '');
    setDashboardId(offer.dashboardId ?? '');
    setStatus(offer.status);
    setFronts(normalize(offer.fronts));
    setUpsells(normalize(offer.upsells));
  }, [open, offer]);

  const mut = useMutation({
    mutationFn: () =>
      apiClient.updateOffer(offer.id, {
        name: name.trim(),
        description: description.trim(),
        dashboard_id: dashboardId.trim(),
        status,
        fronts: cleanForSubmit(fronts),
        upsells: cleanForSubmit(upsells),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Oferta atualizada.');
      onOpenChange(false);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const canSave = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar oferta</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identidade */}
          <section className="space-y-3">
            <p className="hud-label">Identidade</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="of-name">Nome</Label>
                <Input
                  id="of-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. PFL_ENG"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as OfferStatus)}>
                  <SelectTrigger id="of-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_LIST.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-desc">Descrição</Label>
              <Input
                id="of-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="opcional — nicho, idioma, observação"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-dash">UTMify dashboardId</Label>
              <Input
                id="of-dash"
                value={dashboardId}
                onChange={(e) => setDashboardId(e.target.value)}
                placeholder="ex. 69f3b5692659d80c33debea2"
                className="font-mono text-[12px]"
              />
            </div>
          </section>

          {/* Front links */}
          <LinksSection
            title="Front (LP / VSL)"
            hint="Cada item tem White (página segura) e Black (página real)."
            links={fronts}
            onChange={setFronts}
            addLabel="Adicionar Front"
          />

          {/* Upsell links */}
          <LinksSection
            title="Upsell"
            hint="Sequência pós-checkout. Cada item tem White e Black."
            links={upsells}
            onChange={setUpsells}
            addLabel="Adicionar Upsell"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!canSave || mut.isPending}>
            {mut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinksSection({
  title,
  hint,
  links,
  onChange,
  addLabel,
}: {
  title: string;
  hint?: string;
  links: OfferLink[];
  onChange: (next: OfferLink[]) => void;
  addLabel: string;
}) {
  const update = (idx: number, patch: Partial<OfferLink>) => {
    const next = links.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  };
  const remove = (idx: number) => onChange(links.filter((_, i) => i !== idx));
  const add = () => onChange([...links, emptyLink()]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">{title}</p>
          {hint && <p className="mt-0.5 text-[11px] text-white/45">{hint}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={add} type="button">
          <Plus className="h-3 w-3" />
          {addLabel}
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 bg-white/[0.01] p-4 text-center text-[12px] text-white/45">
          Nenhum link ainda. Clique em <strong>{addLabel}</strong>.
        </p>
      ) : (
        <div className="space-y-3">
          {links.map((l, i) => (
            <div
              key={l.id}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  #{i + 1}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remover link"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                    Label (opcional)
                  </Label>
                  <Input
                    value={l.label ?? ''}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder='ex. "Front PT" ou "OB Garantia"'
                    className="h-9"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-emerald-300/85">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
                      White (página safe)
                    </Label>
                    <Input
                      value={l.whiteUrl ?? ''}
                      onChange={(e) => update(i, { whiteUrl: e.target.value })}
                      placeholder="https://..."
                      className="h-9 font-mono text-[12px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-rose-300/85">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-300/70" />
                      Black (página real)
                    </Label>
                    <Input
                      value={l.blackUrl ?? ''}
                      onChange={(e) => update(i, { blackUrl: e.target.value })}
                      placeholder="https://..."
                      className="h-9 font-mono text-[12px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function normalize(arr: OfferLink[] | undefined): OfferLink[] {
  return (arr ?? []).map((l) => ({
    id: l.id || newId(),
    label: l.label ?? '',
    whiteUrl: l.whiteUrl ?? '',
    blackUrl: l.blackUrl ?? '',
  }));
}

function cleanForSubmit(arr: OfferLink[]): OfferLink[] {
  return arr
    .map((l) => ({
      id: l.id,
      ...(l.label && l.label.trim() ? { label: l.label.trim() } : {}),
      ...(l.whiteUrl && l.whiteUrl.trim() ? { whiteUrl: l.whiteUrl.trim() } : {}),
      ...(l.blackUrl && l.blackUrl.trim() ? { blackUrl: l.blackUrl.trim() } : {}),
    }))
    .filter((l) => l.label || l.whiteUrl || l.blackUrl);
}
