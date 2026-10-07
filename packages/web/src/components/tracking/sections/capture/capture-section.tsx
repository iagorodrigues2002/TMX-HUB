'use client';

import { NetworkCaptureParameters } from '@/components/tracking/sections/capture/network-capture-parameters';
import {
  TrackingSectionContent,
  type TrackingSectionId,
} from '@/components/tracking/sections/journey/tracking-section-content';

const CAPTURE_SECTION: Record<string, TrackingSectionId> = {
  'code-pixels': 'code',
  domains: 'domains',
};

export function CaptureSection({
  offerId,
  canManage,
  section,
}: { offerId: string; canManage: boolean; section: string }) {
  return (
    <div className="space-y-5">
      <TrackingSectionContent
        offerId={offerId}
        canManage={canManage}
        section={CAPTURE_SECTION[section] ?? 'code'}
      />
      {section === 'code-pixels' && <NetworkCaptureParameters />}
    </div>
  );
}
