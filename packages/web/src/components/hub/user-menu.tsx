'use client';

import { useInterfaceTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { Eye, EyeOff, KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { isPrivate, togglePrivacy } = usePrivacy();
  const { theme, toggleTheme } = useInterfaceTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={togglePrivacy}
        aria-label={isPrivate ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
        title={isPrivate ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
        className="h-11 w-11 sm:h-9 sm:w-9"
      >
        {isPrivate ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        title={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        className="hidden h-11 w-11 sm:inline-flex sm:h-9 sm:w-9"
      >
        {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Abrir menu de ${user.name}`}
            onClick={() => setMenuOpen(true)}
            className="ml-0.5 grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-border/60 bg-muted text-[11px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent sm:h-9 sm:w-9"
          >
            {initials || '·'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 rounded-xl border-border/60 bg-popover/95 p-1 text-popover-foreground shadow-card backdrop-blur-xl"
        >
          <DropdownMenuLabel className="px-3 py-2 font-normal">
            <span className="block truncate text-[14px] font-semibold text-foreground">
              {user.name}
            </span>
            <span className="block truncate text-[13px] text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/60" />

          <DropdownMenuItem asChild className="h-11 cursor-pointer px-3 text-[13px]">
            <Link href="/settings">
              <KeyRound aria-hidden />
              Conta e segurança
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleTheme} className="h-11 cursor-pointer px-3 text-[13px]">
            {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={togglePrivacy}
            className="h-11 cursor-pointer px-3 text-[13px]"
          >
            {isPrivate ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            {isPrivate ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-border/60" />
          <DropdownMenuItem
            onSelect={logout}
            className="h-11 cursor-pointer px-3 text-[13px] text-danger focus:text-danger"
          >
            <LogOut aria-hidden />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
