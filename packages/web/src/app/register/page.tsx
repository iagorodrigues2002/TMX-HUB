import { PublicSurface } from '@/components/hub/public-surface';
import { Loader2 } from 'lucide-react';
import { Suspense } from 'react';
import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

/**
 * RSC wrapper. `useSearchParams` no form exige Suspense boundary acima
 * pra Next 15 conseguir prerender (ou pular o prerender) sem quebrar o build.
 */
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <PublicSurface>
          <main className="grid min-h-screen place-items-center bg-background text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </main>
        </PublicSurface>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
