'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right md:block">
        <p className="text-[12px] font-semibold text-white/85 leading-none">{user.name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
          {user.role}
        </p>
      </div>
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.08] text-[11px] font-bold text-cyan-200"
      >
        {initials || '·'}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={logout}
        aria-label="Sair"
        title="Sair"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
