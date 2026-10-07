'use client';

import { TrackingHealthCenter } from '@/components/tracking/tracking-health-center';
import { TrackingHelp } from '@/components/tracking/tracking-help';
import { TrackingLiveConsole } from '@/components/tracking/tracking-live-console';
import {
  TrackingPeriodFilter,
  trackingDate,
  trackingDateOffset,
} from '@/components/tracking/tracking-period-filter';
import { useState } from 'react';

export function DiagnosticsSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  const [from, setFrom] = useState(() => trackingDateOffset(6));
  const [to, setTo] = useState(trackingDate);

  if (section === 'health') {
    return <TrackingHealthCenter offerId={offerId} canManage={canManage} />;
  }
  if (section === 'help') {
    return <TrackingHelp offerId={offerId} />;
  }
  return (
    <div className="space-y-3">
      <TrackingPeriodFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        title="Janela do Live Console"
      />
      <TrackingLiveConsole offerId={offerId} mode="tracker" from={from} to={to} />
    </div>
  );
}
