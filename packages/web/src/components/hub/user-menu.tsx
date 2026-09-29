'use client';

import { Eye, EyeOff, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { Button } from '@/components/ui/button';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { isPrivate, togglePrivacy } = usePrivacy();
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={togglePrivacy}
        aria-label={isPrivate ? 'Mostrar dados sensíveis' : 'Ocultar dados sensíveis'}
        title={isPrivate ? 'Mostrar dados' : 'Ocultar dados'}
        className={isPrivate ? 'border border-cyan-300/25 bg-cyan-300/[0.09] text-cyan-100' : undefined}
      >
        {isPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <div className="hidden text-right md:block">
        <p className="text-[12px] font-semibold text-white/85 leading-none">
          {isPrivate ? 'Dados ocultos' : user.name}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/40">
          {user.role}
        </p>
      </div>
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.08] text-[11px] font-bold text-cyan-200"
      >
        {isPrivate ? '••' : initials || '·'}
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
