'use client';

import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

export type InterfaceTheme = 'dark' | 'light';

interface InterfaceThemeContextValue {
  theme: InterfaceTheme;
  toggleTheme: () => void;
}

const InterfaceThemeContext = createContext<InterfaceThemeContextValue | null>(null);
export const THEME_STORAGE_KEY = 'tmx-ui.theme';

function applyTheme(theme: InterfaceTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

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
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [hydrated, theme]);

  return (
    <InterfaceThemeContext
      value={{
        theme,
        toggleTheme: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
      }}
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
