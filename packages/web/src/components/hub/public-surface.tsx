import type { ReactNode } from 'react';
import { AmbientBackground } from './ambient-background';

/** Public and focused screens share the material without acquiring authenticated navigation. */
export function PublicSurface({ children }: { children: ReactNode }) {
  return (
    <div className="tmx-public-surface relative isolate min-h-dvh text-foreground">
      <AmbientBackground />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
