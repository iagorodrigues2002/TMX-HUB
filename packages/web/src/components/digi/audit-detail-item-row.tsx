'use client';

import { Input } from '@/components/ui/input';
import type { DigiAuditItemView } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { StateToggle } from './audit-detail-support';
import type { ChecklistItem } from './checklist-data';

export function ItemRow({
  item,
  state,
  onChange,
}: {
  item: ChecklistItem;
  state: DigiAuditItemView | undefined;
  onChange: (patch: Partial<DigiAuditItemView>) => void;
}) {
  const current = state?.state ?? 'pending';
  const [showNotes, setShowNotes] = useState(!!state?.notes);
  const [localNote, setLocalNote] = useState(state?.notes ?? '');
  const [localUrl, setLocalUrl] = useState(state?.url ?? '');

  useEffect(() => {
    setLocalNote(state?.notes ?? '');
    setLocalUrl(state?.url ?? '');
  }, [state?.notes, state?.url]);

  return (
    <div
      className={cn(
        'rounded-md border p-2.5',
        item.critical ? 'border-warning/30 bg-warning/10' : 'border-border bg-muted',
      )}
    >
      <div className="flex items-start gap-2">
        <StateToggle current={current} onChange={(s) => onChange({ state: s })} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-[12.5px] leading-snug',
              current === 'done' && 'text-muted-foreground line-through decoration-white/40',
              current === 'na' && 'text-muted-foreground',
              current === 'pending' && 'text-foreground',
            )}
          >
            {item.label}
            {item.critical && (
              <span className="ml-1.5 inline-block rounded-sm border border-warning/30 bg-warning/10 px-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-warning">
                crítico
              </span>
            )}
          </p>
          {item.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</p>}
          {item.hasUrl && (
            <Input
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              onBlur={() => {
                if (localUrl !== (state?.url ?? '')) onChange({ url: localUrl });
              }}
              placeholder="https://..."
              className="mt-1.5 h-7 font-mono text-[11px]"
            />
          )}
          {showNotes ? (
            <textarea
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              onBlur={() => {
                if (localNote !== (state?.notes ?? '')) onChange({ notes: localNote });
              }}
              placeholder="anotação"
              rows={2}
              className="mt-1.5 w-full rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-primary"
            >
              + nota
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
