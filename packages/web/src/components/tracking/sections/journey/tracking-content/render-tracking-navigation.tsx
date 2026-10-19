'use client';
import { cn } from '@/lib/utils';
import { renderTrackingSections } from './render-tracking-sections';
import type { TrackingContentContext } from './tracking-content-context';
import { sections } from './tracking-navigation';
import { trackingAreas } from './tracking-navigation';
export function renderTrackingNavigation(context: TrackingContentContext) {
  const { setSection, activeArea } = context;
  return (
    <div className="min-w-0">
      <aside className="hidden">
        {trackingAreas.map(({ id, label, icon: Icon, sections: areaSections }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(areaSections[0]!)}
            className={cn(
              'flex min-h-11 w-auto shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white/70 2xl:mb-1 2xl:w-full 2xl:gap-3 2xl:text-sm',
              activeArea.id === id &&
                'border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,.08)]',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </aside>
      {renderTrackingSections(context)}
    </div>
  );
}
