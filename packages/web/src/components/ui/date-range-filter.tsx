'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DateRange, DateRangePreset } from '@/lib/date-range';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { type ReactNode, useId } from 'react';

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: readonly DateRangePreset[];
  className?: string;
  status?: ReactNode;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  max?: string;
}

export function DateRangeFilter({
  value,
  onChange,
  presets = [],
  className,
  status,
  isRefreshing = false,
  onRefresh,
  max,
}: DateRangeFilterProps) {
  const id = useId();

  const updateFrom = (from: string) => {
    if (!from) return;
    onChange({ from, to: from > value.to ? from : value.to });
  };
  const updateTo = (to: string) => {
    if (!to) return;
    onChange({ from: to < value.from ? to : value.from, to });
  };

  return (
    <div className={cn('glass-card flex flex-wrap items-end gap-3 p-3 sm:p-4', className)}>
      {presets.length > 0 && (
        <div
          className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Períodos rápidos"
        >
          {presets.map((preset) => {
            const range = preset.getRange();
            const active = value.from === range.from && value.to === range.to;
            return (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                className="h-11 shrink-0 sm:h-9"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => onChange(range)}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
      )}

      <div className="flex w-full flex-wrap items-end gap-2 xl:ml-auto xl:w-auto">
        <div className="min-w-[140px] flex-1 space-y-1 sm:flex-none">
          <Label htmlFor={`${id}-from`} className="hud-label">
            De
          </Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={value.from}
            max={value.to}
            onChange={(event) => updateFrom(event.target.value)}
            className="h-11 w-full sm:h-9 sm:w-[150px]"
          />
        </div>
        <div className="min-w-[140px] flex-1 space-y-1 sm:flex-none">
          <Label htmlFor={`${id}-to`} className="hud-label">
            Até
          </Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={value.to}
            min={value.from}
            max={max}
            onChange={(event) => updateTo(event.target.value)}
            className="h-11 w-full sm:h-9 sm:w-[150px]"
          />
        </div>
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 flex-1 gap-2 sm:h-9 sm:flex-none"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        )}
        {status && <div className="ml-auto text-right xl:ml-2">{status}</div>}
      </div>
    </div>
  );
}
