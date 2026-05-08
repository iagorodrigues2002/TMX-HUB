import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
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
        <main className="grid min-h-screen place-items-center bg-[#04101A] text-white/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
