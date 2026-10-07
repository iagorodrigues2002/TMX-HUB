'use client';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

const TIME_ZONE = 'America/Sao_Paulo';

export function trackingDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function trackingDateOffset(daysAgo: number) {
  const [year, month, day] = trackingDate().split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! - daysAgo, 12)).toISOString().slice(0, 10);
}

interface TrackingPeriodFilterProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  title?: string;
  action?: React.ReactNode;
}

export function TrackingPeriodFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onRefresh,
  isRefreshing = false,
  title = 'Período dos dados',
  action,
}: TrackingPeriodFilterProps) {
  const presets = [
    { label: 'Hoje', from: trackingDateOffset(0), to: trackingDateOffset(0) },
    { label: 'Ontem', from: trackingDateOffset(1), to: trackingDateOffset(1) },
    { label: '7 dias', from: trackingDateOffset(6), to: trackingDateOffset(0) },
    { label: '30 dias', from: trackingDateOffset(29), to: trackingDateOffset(0) },
  ];

  return (
    <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/15 p-3">
      <div className="min-w-48">
        <p className="text-sm font-semibold text-white/85">{title}</p>
        <p className="mt-1 text-xs text-white/45">Horário de São Paulo</p>
      </div>
      <div className="flex w-full flex-wrap items-end gap-2 xl:w-auto">
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="Datas rápidas">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={from === preset.from && to === preset.to ? 'default' : 'outline'}
              className="h-10 shrink-0"
              onClick={() => {
                onFromChange(preset.from);
                onToChange(preset.to);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <FormField id="tracking-period-from" label="Data inicial" className="min-w-40 flex-1">
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(event) => onFromChange(event.target.value || to)}
          />
        </FormField>
        <FormField id="tracking-period-to" label="Data final" className="min-w-40 flex-1">
          <Input
            type="date"
            value={to}
            min={from}
            max={trackingDate()}
            onChange={(event) => onToChange(event.target.value || from)}
          />
        </FormField>
        {onRefresh && (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Atualizar
          </Button>
        )}
        {action}
      </div>
    </section>
  );
}
