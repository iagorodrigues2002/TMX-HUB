'use client';

import {
  AlertTriangle,
  ChevronRight,
  Cloud,
  Code2,
  ExternalLink,
  FlaskConical,
  MousePointerClick,
  Radio,
  RefreshCw,
  Send,
  ShoppingCart,
  Webhook,
} from 'lucide-react';
import { renderTroubleshooting } from './tracking-help-render-troubleshooting';
import { Checklist, CopyBlock, Result, Section, steps } from './tracking-help-support';
import { TestCenter } from './tracking-help-test-center';

export function TrackingHelp({ offerId = '' }: { offerId?: string }) {
  return (
    <div className="min-w-0">
      <nav className="surface-panel sticky top-2 z-20 mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl p-2">
        <p className="hud-label hidden shrink-0 self-center px-2 2xl:block">Neste guia</p>
        {steps.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-white/65 transition hover:bg-cyan-100/[0.07] hover:text-cyan-100"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </nav>

      <div className="min-w-0 space-y-5">
        <TestCenter offerId={offerId} />
        <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.07] p-5 shadow-[0_16px_40px_rgba(0,0,0,.16)]">
          <div className="flex gap-3">
            <Radio className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <p className="text-sm font-medium text-cyan-100">O que estará funcionando no final</p>
              <p className="mt-1 text-sm leading-6 text-white/75">
                O TMXHUB identificará o visitante, registrará a entrada na página e no checkout,
                anexará o identificador ao parâmetro <code className="text-cyan-200">src</code> da
                Vendepay e associará a venda recebida pelo webhook à jornada correta.
              </p>
            </div>
          </div>
        </div>

        {renderInfrastructureHelp()}

        <Section
          id="projeto"
          number="02"
          title="Criar o tracking da oferta"
          subtitle="Cada oferta recebe uma chave pública, um script de instalação e um webhook secreto."
          icon={<Radio className="h-5 w-5" />}
        >
          <Checklist
            items={[
              {
                id: 'open-offer',
                content: (
                  <>
                    Abra <strong className="text-white/80">Ofertas</strong> e entre na oferta que
                    receberá o tracking.
                  </>
                ),
              },
              {
                id: 'create-tracking',
                content: (
                  <>
                    Na área <strong className="text-white/80">Tracking Vendepay</strong>, clique em{' '}
                    <strong className="text-white/80">Criar configuração</strong>.
                  </>
                ),
              },
              {
                id: 'save-secrets',
                content:
                  'Guarde o script e a URL do webhook exibidos. O token do webhook é mostrado na criação e deve ser tratado como segredo.',
              },
            ]}
          />
          <div className="mt-5 rounded-md border border-amber-300/15 bg-amber-300/[0.04] p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <AlertTriangle className="h-4 w-4" /> Uma configuração por oferta
            </p>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Não reutilize o script ou o webhook entre ofertas. Isso faria visitas e vendas
              entrarem no funil errado.
            </p>
          </div>
        </Section>

        <Section
          id="script"
          number="03"
          title="Instalar o script na página"
          subtitle="Cole o código antes do fechamento de </head> em todas as páginas que antecedem o checkout."
          icon={<Code2 className="h-5 w-5" />}
        >
          <CopyBlock label="Exemplo — use o código gerado na oferta" copyable={false}>
            {'<script async src="https://theminex.com/v1/track/t.js?key=SUA_CHAVE"></script>'}
          </CopyBlock>
          <div className="mt-4">
            <CopyBlock label="Parâmetros da URL · Meta Ads">
              {
                'utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&placement={{placement}}&site_source_name={{site_source_name}}'
              }
            </CopyBlock>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/50">
            Cole a linha acima no campo <strong className="text-white/75">Parâmetros da URL</strong>{' '}
            do anúncio, sem adicionar <code className="text-cyan-200">?</code> no início. O{' '}
            <code className="text-cyan-200">fbclid</code> é acrescentado automaticamente pelo Meta;
            o TMX captura esse valor, cria o <code className="text-cyan-200">_fbc</code> e preserva
            todos os parâmetros no checkout.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Result
              title="PageView"
              detail="É enviado automaticamente quando a página abre. O visitante recebe um identificador _tmx persistente."
            />
            <Result
              title="InitiateCheckout"
              detail="É enviado ao clicar em um link de checkout. O script adiciona src=IDENTIFICADOR à URL da Vendepay."
            />
          </div>
          <p className="mt-5 text-xs leading-5 text-white/40">
            Se usar o Page Cloner, confira o HTML publicado depois da clonagem: scripts de terceiros
            podem ser removidos durante a limpeza. O código do TMXHUB deve existir na versão final
            da página.
          </p>
        </Section>

        <Section
          id="webhook"
          number="04"
          title="Configurar o webhook na Vendepay"
          subtitle="A Vendepay avisará o TMXHUB quando o estado de uma transação mudar."
          icon={<Webhook className="h-5 w-5" />}
        >
          <ol className="space-y-4 text-sm leading-6 text-white/65">
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">01</span>
              Copie a URL de webhook gerada na configuração da oferta.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">02</span>
              No painel da Vendepay, abra a integração de webhooks e crie um endpoint com essa URL.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">03</span>
              Habilite todos os eventos de pagamento disponíveis, especialmente aprovado, pendente,
              recusado, reembolso, cancelamento e chargeback.
            </li>
          </ol>
          <div className="mt-5">
            <CopyBlock label="Formato ilustrativo — não use esta URL" copyable={false}>
              {'https://theminex.com/v1/webhooks/vendepay?token=SEU_TOKEN_SECRETO'}
            </CopyBlock>
          </div>
          <p className="mt-4 flex gap-2 text-xs leading-5 text-white/40">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" />
            Nunca publique essa URL em páginas ou documentos públicos. Quem tiver o token poderá
            tentar enviar eventos para a integração.
          </p>
        </Section>

        <Section
          id="meta"
          number="05"
          title="Conectar o Meta Conversions API"
          subtitle="Cada oferta pode enviar Purchase server-side para um ou mais pixels."
          icon={<Send className="h-5 w-5" />}
        >
          <ol className="space-y-4 text-sm leading-6 text-white/65">
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">01</span>
              No Events Manager, abra o pixel e gere um token da Conversions API.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">02</span>
              Em Test Events, copie também o Test Event Code durante a homologação.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">03</span>
              Cadastre Pixel ID, token e código de teste na oferta. O token é validado no Meta e
              armazenado criptografado.
            </li>
          </ol>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Result
              title="Deduplicação"
              detail="Cada Purchase recebe um event_id determinístico por transação e pixel."
            />
            <Result
              title="Retries automáticos"
              detail="Falhas temporárias entram em fila com backoff e permanecem auditáveis."
            />
          </div>
          <p className="mt-4 text-xs leading-5 text-white/40">
            Depois que o teste aparecer no Events Manager, remova o Test Event Code para que os
            próximos eventos sejam tratados como produção.
          </p>
        </Section>

        <Section
          id="ab-test"
          number="06"
          title="Criar e validar um teste A/B"
          subtitle="Distribua visitantes entre dois destinos e compare checkouts, compras, conversão e receita."
          icon={<FlaskConical className="h-5 w-5" />}
        >
          <ol className="space-y-4 text-sm leading-6 text-white/75">
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300">01</span>
              Abra <strong className="text-white">Testes A/B</strong>, dê um nome claro ao
              experimento e informe as URLs completas das variantes A e B.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300">02</span>
              Escolha a divisão de tráfego. Comece com 50/50; use uma distribuição diferente apenas
              quando uma variante representar risco operacional.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300">03</span>
              Abra a landing em duas janelas anônimas diferentes e clique no checkout. Confirme que
              cada janela mantém o mesmo destino ao recarregar.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300">04</span>
              Verifique se as URLs finais preservam UTMs e{' '}
              <code className="text-cyan-200">src</code>. As métricas começam a aparecer no cartão
              do experimento.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300">05</span>
              Não escolha uma vencedora apenas por cliques. Aguarde compras suficientes, compare
              conversão e receita por visitante e então fixe a variante vencedora.
            </li>
          </ol>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Result
              title="Atribuição persistente"
              detail="O visitante recebe uma variante uma única vez e continua nela durante toda a jornada."
            />
            <Result
              title="Troca segura de checkout"
              detail="O TMX altera somente o destino do CTA, preservando parâmetros de campanha e identificação."
            />
          </div>
        </Section>

        <Section
          id="testes"
          number="07"
          title="Testar a jornada completa"
          subtitle="Faça os testes nesta ordem. Assim, qualquer falha fica localizada em uma etapa."
          icon={<MousePointerClick className="h-5 w-5" />}
        >
          <div className="space-y-3">
            {[
              {
                icon: Cloud,
                title: '1. PageView',
                text: 'Abra a landing em uma janela anônima. Recarregue apenas uma vez e confirme o evento PageView no painel da oferta.',
              },
              {
                icon: MousePointerClick,
                title: '2. InitiateCheckout',
                text: 'Clique no CTA. Confirme que a URL do checkout contém src= e que o evento InitiateCheckout apareceu.',
              },
              {
                icon: ShoppingCart,
                title: '3. Venda',
                text: 'Faça uma compra de teste na Vendepay. Use o menor valor permitido e confirme que o pedido foi associado ao mesmo visitante.',
              },
              {
                icon: RefreshCw,
                title: '4. Mudança de status',
                text: 'Quando possível, reembolse o teste e confirme que o mesmo pedido mudou de status, sem criar uma duplicata.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="flex gap-4 rounded-md border border-white/[0.06] bg-black/10 p-4"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300/70" />
                <div>
                  <p className="text-sm font-medium text-white/80">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {renderTroubleshooting()}

        <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-white/75">Ainda não encontrou a causa?</p>
            <p className="mt-1 text-xs text-white/40">
              Registre o horário do teste, oferta, ID da transação e status retornado pela Vendepay.
            </p>
          </div>
          <a
            href="/logs"
            className="flex shrink-0 items-center gap-2 text-xs font-medium text-cyan-200/75 hover:text-cyan-200"
          >
            Abrir logs <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        <p className="flex items-center justify-center gap-2 py-4 text-[10px] uppercase tracking-[0.18em] text-white/25">
          <ExternalLink className="h-3 w-3" />
          Tracking first-party · Vendepay · TMXHUB
        </p>
      </div>
    </div>
  );
}

import { renderInfrastructureHelp } from './tracking-help-render-infrastructure-help';
