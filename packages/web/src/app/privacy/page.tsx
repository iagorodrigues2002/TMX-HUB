import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de Privacidade | TMX HUB' };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#020d13] px-6 py-16 text-white">
      <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-cyan-300/15 bg-white/[0.03] p-8 md:p-12">
        <header><p className="hud-label text-cyan-200">TMX HUB</p><h1 className="mt-3 text-3xl font-bold">Política de Privacidade</h1></header>
        <p>O TMX HUB trata dados estritamente para fornecer ferramentas de operações, analytics e integrações solicitadas pelos usuários autorizados.</p>
        <section><h2 className="text-lg font-semibold">Dados tratados</h2><p className="mt-2 text-white/70">Podemos tratar dados de autenticação, configurações de integração, métricas operacionais e dados de conversão enviados pelas plataformas conectadas.</p></section>
        <section><h2 className="text-lg font-semibold">Uso e compartilhamento</h2><p className="mt-2 text-white/70">Os dados são usados para executar as funções escolhidas no TMX HUB. Quando o usuário conecta uma plataforma, dados necessários são enviados à respectiva plataforma somente para cumprir a ação autorizada.</p></section>
        <section><h2 className="text-lg font-semibold">Segurança e contato</h2><p className="mt-2 text-white/70">Aplicamos controles técnicos e de acesso compatíveis com a finalidade do serviço. Para dúvidas sobre privacidade, entre em contato pelo e-mail de suporte exibido no consentimento do Google.</p></section>
        <p className="text-sm text-white/45">Última atualização: 25 de setembro de 2026.</p>
      </article>
    </main>
  );
}
