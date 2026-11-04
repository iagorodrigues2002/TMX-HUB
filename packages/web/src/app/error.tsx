'use client';

import { PublicSurface } from '@/components/hub/public-surface';
import { DataState } from '@/components/ui/data-state';

export default function ErrorPage({
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PublicSurface>
      <main className="mx-auto grid min-h-dvh max-w-xl place-items-center p-6">
        <DataState
          variant="error"
          title="Não foi possível abrir esta tela"
          description="Tente carregar novamente. Se o problema continuar, fale com o administrador do TMX."
          onRetry={reset}
        />
      </main>
    </PublicSurface>
  );
}
