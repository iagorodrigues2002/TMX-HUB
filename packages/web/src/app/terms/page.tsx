import { PublicSurface } from '@/components/hub/public-surface';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Termos de Serviço | TMX HUB' };

export default function TermsPage() {
  return (
    <PublicSurface>
      <main className="min-h-screen bg-background px-6 py-16 text-foreground">
        <article className="glass-card mx-auto max-w-3xl space-y-7 rounded-2xl border border-border bg-muted p-8 md:p-12">
          <header>
            <p className="hud-label text-primary">TMX HUB</p>
            <h1 className="mt-3 text-3xl font-bold">Termos de Serviço</h1>
          </header>
          <p>
            Ao usar o TMX HUB, você concorda em utilizar a plataforma somente para atividades
            legítimas e para as quais possui autorização.
          </p>
          <section>
            <h2 className="text-lg font-semibold">Conta e acesso</h2>
            <p className="mt-2 text-muted-foreground">
              Cada usuário é responsável por proteger suas credenciais e pelos acessos realizados em
              sua conta. Administradores podem gerenciar usuários e permissões da equipe.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Integrações</h2>
            <p className="mt-2 text-muted-foreground">
              Conexões com serviços de terceiros são opcionais e dependem das permissões concedidas
              pelo usuário. O usuário é responsável por manter suas configurações e credenciais
              válidas.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Disponibilidade</h2>
            <p className="mt-2 text-muted-foreground">
              Buscamos manter o serviço disponível e seguro, mas integrações externas podem sofrer
              limitações, indisponibilidades ou mudanças fora do controle do TMX HUB.
            </p>
          </section>
          <p className="text-sm text-muted-foreground">
            Última atualização: 25 de setembro de 2026.
          </p>
        </article>
      </main>
    </PublicSurface>
  );
}
