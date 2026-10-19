'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { MODE_LABELS, type ParamSlot, type SlotMode } from './cloaker-generator-support';

export function SlotRow({
  slot,
  onChange,
  onRemove,
}: {
  slot: ParamSlot;
  onChange: (p: Partial<ParamSlot>) => void;
  onRemove: () => void;
}) {
  const showLength = !['uuid', 'static', 'pick'].includes(slot.mode);
  const showStatic = slot.mode === 'static';
  const showPick = slot.mode === 'pick';

  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="grid gap-2 md:grid-cols-[160px_1fr_120px_36px] md:items-end">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">Nome</Label>
          <Input
            value={slot.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="t"
            className="h-9 font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">Tipo</Label>
          <Select value={slot.mode} onValueChange={(v) => onChange({ mode: v as SlotMode })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as SlotMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">Tamanho</Label>
          <Input
            type="number"
            min={1}
            max={64}
            value={slot.length}
            onChange={(e) => onChange({ length: Number(e.target.value) })}
            disabled={!showLength}
            className="h-9"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label="Remover slot"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showStatic && (
        <div className="mt-2 space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Valor fixo
          </Label>
          <Input
            value={slot.staticValue}
            onChange={(e) => onChange({ staticValue: e.target.value })}
            placeholder="ex: fb"
            className="h-9 font-mono"
          />
        </div>
      )}

      {showPick && (
        <div className="mt-2 space-y-1">
          <Label className="text-[10px] uppercase tracking-[0.12em] text-white/45">
            Lista de opções (separar por vírgula ou nova linha)
          </Label>
          <Input
            value={slot.staticValue}
            onChange={(e) => onChange({ staticValue: e.target.value })}
            placeholder="opt1, opt2, opt3"
            className="h-9 font-mono"
          />
        </div>
      )}
    </div>
  );
}
