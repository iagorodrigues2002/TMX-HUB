'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { Eye, EyeOff, KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

type InterfaceTheme = 'dark' | 'light';

interface InterfaceThemeContextValue {
  theme: InterfaceTheme;
  toggleTheme: () => void;
}

const InterfaceThemeContext = createContext<InterfaceThemeContextValue | null>(null);
const THEME_STORAGE_KEY = 'tmx-ui.theme';

export function InterfaceThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<InterfaceTheme>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(saved === 'light' ? 'light' : 'dark');
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [hydrated, theme]);

  return (
    <InterfaceThemeContext
      value={{ theme, toggleTheme: () => setTheme((v) => (v === 'dark' ? 'light' : 'dark')) }}
    >
      {children}
    </InterfaceThemeContext>
  );
}

export function useInterfaceTheme() {
  const context = useContext(InterfaceThemeContext);
  if (!context) {
    throw new Error('useInterfaceTheme must be used inside InterfaceThemeProvider');
  }
  return context;
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const { isPrivate, togglePrivacy } = usePrivacy();
  const { theme, toggleTheme } = useInterfaceTheme();

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

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Abrir menu de ${user.name}`}
            className="ml-0.5 grid h-11 w-11 cursor-pointer place-items-center rounded-md border border-border/60 bg-muted text-[11px] font-semibold text-foreground transition-colors hover:bg-accent sm:h-9 sm:w-9"
          >
            {initials || '·'}
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-sm gap-3 border-border/60 p-4">
          <DialogHeader className="border-b border-border/60 pb-3 pr-12">
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription className="truncate">{user.email}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-1">
            <DialogClose asChild>
              <Button asChild variant="ghost" className="h-11 justify-start px-3">
                <Link href="/settings">
                  <KeyRound aria-hidden />
                  Conta e segurança
                </Link>
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="ghost"
              onClick={toggleTheme}
              className="h-11 justify-start px-3"
            >
              {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
              {theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={togglePrivacy}
              className="h-11 justify-start px-3"
            >
              {isPrivate ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              {isPrivate ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={logout}
              className="h-11 justify-start px-3 text-danger hover:text-danger"
            >
              <LogOut aria-hidden />
              Sair
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
