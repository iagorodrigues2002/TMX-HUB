'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

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
      <div className="grid min-h-screen place-items-center bg-[#04101A] text-white/40">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
