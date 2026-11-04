'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FunnelStepConfig } from '@/lib/upsell/calc';
import { X } from 'lucide-react';

export function FunnelRow(props: {
  step: FunnelStepConfig;
  onChange: (patch: Partial<FunnelStepConfig>) => void;
  onRemove?: () => void;
  tone?: 'front';
}) {
  const isFront = props.tone === 'front';
  return (
    <div
      className={`grid items-end gap-3 rounded-md border p-3 md:grid-cols-[80px_1fr_1fr_auto] ${
        isFront ? 'border-border bg-accent' : 'border-border bg-muted'
      }`}
    >
      <div>
        <Label className="hud-label">Etapa</Label>
        <p
          className={`mt-1 text-[13px] font-semibold uppercase tracking-[0.14em] ${
            isFront ? 'text-primary' : 'text-foreground'
          }`}
        >
          {props.step.name}
        </p>
      </div>
      <div>
        <Label className="hud-label">Produto</Label>
        <Input
          value={props.step.product}
          onChange={(e) => props.onChange({ product: e.target.value })}
          placeholder="(vazio = qualquer)"
        />
      </div>
      <div>
        <Label className="hud-label">Ofertas (vírgula)</Label>
        <Input
          value={props.step.offers.join(', ')}
          onChange={(e) =>
            props.onChange({
              offers: e.target.value
                .split(',')
                .map((o) => o.trim())
                .filter((o) => o.length > 0),
            })
          }
          placeholder="ex: OFF01, OFF01B"
        />
      </div>
      <div className="flex items-end">
        {props.onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remover etapa ${props.step.name}`}
            onClick={props.onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
