'use client';

import { InterfaceThemeProvider, useInterfaceTheme } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { makeQueryClient } from '@/lib/query-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';

function AnimatedSuccessIcon() {
  return (
    <svg aria-hidden className="tmx-toast-success-icon" fill="none" viewBox="0 0 24 24">
      <title>Sucesso</title>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" />
      <path
        className="tmx-check-path"
        d="M7.5 12.5 10.5 15.5 16.75 8.75"
        pathLength="1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ThemeAwareToaster() {
  const { theme } = useInterfaceTheme();
  return (
    <Toaster
      richColors
      theme={theme}
      position="bottom-right"
      icons={{ success: <AnimatedSuccessIcon /> }}
      toastOptions={{
        classNames: {
          toast: 'tmx-toast',
          error: 'tmx-toast-error',
          success: 'tmx-toast-success',
          icon: 'tmx-toast-icon',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());

  return (
    <InterfaceThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PrivacyProvider>{children}</PrivacyProvider>
        </AuthProvider>
        <ThemeAwareToaster />
      </QueryClientProvider>
    </InterfaceThemeProvider>
  );
}
