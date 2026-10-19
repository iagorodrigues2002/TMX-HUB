'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Send } from 'lucide-react';
import type { TrackingContentContext } from './tracking-content-context';
import { saoPauloDate } from './tracking-helpers';
export function renderTrackingDates(context: TrackingContentContext) {
  const {
    section,
    datePresets,
    trackingFrom,
    trackingTo,
    setTrackingFrom,
    setTrackingTo,
    isRefreshingTracking,
    refreshTracking,
    canManage,
    reconcileInitiateCheckouts,
  } = context;
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/[0.08] bg-black/15 p-3">
      <div>
        <p className="hud-label">
          {section === 'ab' ? 'Período dos resultados A/B' : 'Período do trackeamento'}
        </p>
        <p className="mt-1 text-xs text-white/40">
          Dados históricos separados por dia · horário de São Paulo
        </p>
      </div>
      <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto">
        <div
          className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Datas rápidas"
        >
          {datePresets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant={
                trackingFrom === preset.from && trackingTo === preset.to ? 'default' : 'outline'
              }
              className="h-10 shrink-0"
              onClick={() => {
                setTrackingFrom(preset.from);
                setTrackingTo(preset.to);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <label htmlFor="tracking-from" className="min-w-[150px] flex-1 space-y-1 sm:flex-none">
          <span className="hud-label block">Data inicial</span>
          <Input
            id="tracking-from"
            type="date"
            value={trackingFrom}
            max={trackingTo}
            onChange={(event) => setTrackingFrom(event.target.value || trackingTo)}
            className="h-11 w-full sm:w-[160px]"
          />
        </label>
        <label htmlFor="tracking-to" className="min-w-[150px] flex-1 space-y-1 sm:flex-none">
          <span className="hud-label block">Data final</span>
          <Input
            id="tracking-to"
            type="date"
            value={trackingTo}
            min={trackingFrom}
            max={saoPauloDate()}
            onChange={(event) => setTrackingTo(event.target.value || trackingFrom)}
            className="h-11 w-full sm:w-[160px]"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 flex-1 gap-2 sm:flex-none"
          disabled={isRefreshingTracking}
          onClick={() => void refreshTracking()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshingTracking && 'animate-spin')} />
          Atualizar
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 flex-1 gap-2 sm:flex-none"
            disabled={reconcileInitiateCheckouts.isPending}
            onClick={() => reconcileInitiateCheckouts.mutate()}
          >
            <Send className="h-3.5 w-3.5" />
            Reconciliar ICs
          </Button>
        )}
      </div>
    </div>
  );
}
