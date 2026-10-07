'use client';

import { InterfaceThemeProvider, useInterfaceTheme } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { PrivacyProvider } from '@/lib/privacy-context';
import { makeQueryClient } from '@/lib/query-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';

function ThemeAwareToaster() {
  const { theme } = useInterfaceTheme();
  return <Toaster richColors theme={theme} position="bottom-right" />;
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
