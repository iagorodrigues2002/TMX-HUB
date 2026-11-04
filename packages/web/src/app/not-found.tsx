import { PublicSurface } from '@/components/hub/public-surface';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <PublicSurface>
      <main className="grid min-h-screen place-items-center px-6 py-16">
        <section
          className="glass-card w-full max-w-md p-8 text-center"
          aria-labelledby="not-found-title"
        >
          <p className="font-mono text-7xl font-semibold tracking-[-0.08em] text-foreground sm:text-8xl">
            404
          </p>
          <h1
            id="not-found-title"
            className="mt-6 text-xl font-semibold tracking-tight text-foreground"
          >
            Página não encontrada
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Este endereço não está disponível ou foi retirado da navegação.
          </p>
          <Button asChild variant="outline" className="mt-7">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Voltar à Visão geral
            </Link>
          </Button>
        </section>
      </main>
    </PublicSurface>
  );
}
