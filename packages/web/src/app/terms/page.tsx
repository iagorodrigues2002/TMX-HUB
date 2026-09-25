import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Termos de Serviço | TMX HUB' };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#020d13] px-6 py-16 text-white">
      <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-cyan-300/15 bg-white/[0.03] p-8 md:p-12">
        <header><p className="hud-label text-cyan-200">TMX HUB</p><h1 className="mt-3 text-3xl font-bold">Termos de Serviço</h1></header>
        <p>Ao usar o TMX HUB, você concorda em utilizar a plataforma somente para atividades legítimas e para as quais possui autorização.</p>
        <section><h2 className="text-lg font-semibold">Conta e acesso</h2><p className="mt-2 text-white/70">Cada usuário é responsável por proteger suas credenciais e pelos acessos realizados em sua conta. Administradores podem gerenciar usuários e permissões da equipe.</p></section>
        <section><h2 className="text-lg font-semibold">Integrações</h2><p className="mt-2 text-white/70">Conexões com serviços de terceiros são opcionais e dependem das permissões concedidas pelo usuário. O usuário é responsável por manter suas configurações e credenciais válidas.</p></section>
        <section><h2 className="text-lg font-semibold">Disponibilidade</h2><p className="mt-2 text-white/70">Buscamos manter o serviço disponível e seguro, mas integrações externas podem sofrer limitações, indisponibilidades ou mudanças fora do controle do TMX HUB.</p></section>
        <p className="text-sm text-white/45">Última atualização: 25 de setembro de 2026.</p>
      </article>
    </main>
  );
}
