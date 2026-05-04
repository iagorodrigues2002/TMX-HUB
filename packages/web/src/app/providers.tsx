'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth-context';
import { makeQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster richColors theme="dark" position="bottom-right" />
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
