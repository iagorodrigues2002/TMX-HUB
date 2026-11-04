import { PublicSurface } from '@/components/hub/public-surface';
import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <PublicSurface>
      <output
        className="flex h-screen items-center justify-center text-primary"
        aria-label="Carregando editor"
      >
        <Loader2 className="h-6 w-6 animate-spin" />
      </output>
    </PublicSurface>
  );
}
