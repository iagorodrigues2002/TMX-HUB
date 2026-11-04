'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/lib/motion-router';
import { Loader2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

/**
 * Client-side guard. Renders children only when a user is loaded; otherwise
 * shows a centered spinner and redirects to /login (preserving current path
 * via ?next=).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${next}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
