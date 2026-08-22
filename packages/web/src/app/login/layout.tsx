import type { ReactNode } from 'react';

// Keep authentication HTML out of every intermediary cache. This segment is
// intentionally server-rendered so browser profiles and authenticated proxies
// cannot remain pinned to an old API client bundle.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
