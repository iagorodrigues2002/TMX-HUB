import { RouteMotion } from '@/components/hub/route-motion';
import type { ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return <RouteMotion>{children}</RouteMotion>;
}
