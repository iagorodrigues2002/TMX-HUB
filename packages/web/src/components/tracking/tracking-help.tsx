'use client';

import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Cloud,
  Code2,
  Database,
  ExternalLink,
  FlaskConical,
  Loader2,
  MousePointerClick,
  PlayCircle,
  Radio,
  RefreshCw,
  Send,
  ShoppingCart,
  Webhook,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

const steps = [
  { id: 'railway', label: 'Infraestrutura', icon: Database },
  { id: 'projeto', label: 'Oferta', icon: Radio },
  { id: 'script', label: 'Script', icon: Code2 },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'meta', label: 'Meta CAPI', icon: Send },
  { id: 'ab-test', label: 'Teste A/B', icon: FlaskConical },
  { id: 'testes', label: 'Testes', icon: CheckCircle2 },
  { id: 'diagnostico', label: 'Diagnóstico', icon: AlertTriangle },
];

function CopyBlock({
  children,
  label,
  copyable = true,
}: {
  children: string;
  label: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-cyan-100/[0.12] bg-[#020b12]">
      <div className="flex items-center justify-between border-b border-cyan-100/[0.09] bg-cyan-100/[0.025] px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {label}
        </span>
        {copyable ? (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70 transition hover:text-cyan-200"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        ) : (
          <span className="text-[10px] uppercase tracking-[0.14em] text-amber-200/65">
            apenas exemplo
          </span>
        )}
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-cyan-50/85">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Section({
  id,
  number,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="surface-panel scroll-mt-8 rounded-2xl p-5 md:p-7">
      <header className="mb-6 flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
          {icon}
        </div>
        <div>
          <p className="hud-label">Etapa {number}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Checklist({ items }: { items: Array<{ id: string; content: ReactNode }> }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-sm leading-6 text-white/75">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
          <span>{item.content}</span>
        </li>
      ))}
    </ul>
  );
}

function Result({
  title,
  detail,
  tone = 'ok',
}: {
  title: string;
  detail: string;
  tone?: 'ok' | 'warn';
}) {
  const warn = tone === 'warn';
  return (
    <div
      className={`rounded-md border p-4 ${
        warn
          ? 'border-amber-300/15 bg-amber-300/[0.04]'
          : 'border-emerald-300/15 bg-emerald-300/[0.04]'
      }`}
    >
      <p className={`text-sm font-medium ${warn ? 'text-amber-200' : 'text-emerald-200'}`}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/65">{detail}</p>
    </div>
  );
}

function TestCenter({ offerId }: { offerId: string }) {
  const test = useMutation({
    mutationFn: async () => {
      if (!offerId) throw new Error('Selecione uma oferta para executar os testes.');
      const [diagnostics, config, advanced, receipts] = await Promise.all([
        apiClient.getTrackingDiagnostics(offerId),
        apiClient.getTrackingConfig(offerId),
        apiClient.getAdvancedTracking(offerId),
        apiClient.listVendepayReceipts(offerId),
      ]);
      const liveDomains = advanced.domains.filter((domain) => domain.status === 'live').length;
      return [
        {
          label: 'Banco e migrations',
          ok: diagnostics.database === 'ready' && diagnostics.migrations === 'ready',
          detail:
            diagnostics.database === 'ready' && diagnostics.migrations === 'ready'
              ? `Estrutura v${diagnostics.schema_version ?? '?'} pronta`
              : diagnostics.detail,
        },
        {
          label: 'Criptografia',
          ok: diagnostics.encryption === 'ready',
          detail:
            diagnostics.encryption === 'ready'
              ? 'Segredos protegidos'
              : 'Chave de criptografia indisponível',
        },
        {
          label: 'Tracker da oferta',
          ok: config.configured && Boolean(config.project?.public_key),
          detail: config.configured ? 'Chave pública e script disponíveis' : 'Tracking não criado',
        },
        {
          label: 'Vendepay',
          ok: Boolean(config.vendepay?.configured && config.vendepay.enabled),
          detail: config.vendepay?.configured
            ? `${receipts.receipts.length} webhook(s) registrado(s)`
            : 'Webhook ainda não configurado',
        },
        {
          label: 'Domínios',
          ok: liveDomains > 0,
          detail:
            liveDomains > 0
              ? `${liveDomains} domínio(s) recebendo eventos`
              : 'Nenhum domínio confirmou PageView',
        },
        {
          label: 'Fila do Meta',
          ok: diagnostics.meta.failed === 0,
          detail:
            diagnostics.meta.failed === 0
              ? `${diagnostics.meta.pending} entrega(s) pendente(s), nenhuma falha`
              : `${diagnostics.meta.failed} entrega(s) com falha`,
        },
      ];
    },
  });
  return (
    <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hud-label text-emerald-200">Central de homologação</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            Testar a instalação automaticamente
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
            Verifica infraestrutura, tracker, Vendepay, domínios e fila do Meta sem criar uma venda
            real ou disparar conversões.
          </p>
        </div>
        <Button disabled={!offerId || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Executar diagnóstico
        </Button>
      </div>
      {test.isError && <p className="mt-4 text-sm text-red-200">{test.error.message}</p>}
      {test.data && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {test.data.map((item) => (
            <div
              key={item.label}
              className="flex gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-3"
            >
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              )}
              <div>
                <p className="text-sm font-medium text-white/85">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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

        <Section
          id="railway"
          number="01"
          title="Infraestrutura automática"
          subtitle="Banco, migrations e criptografia são administrados pelo próprio TMXHUB."
          icon={<Database className="h-5 w-5" />}
        >
          <Checklist
            items={[
              {
                id: 'managed-db',
                content:
                  'O PostgreSQL é provisionado uma única vez pela operação do TMXHUB e fica disponível para todas as ofertas autorizadas.',
              },
              {
                id: 'managed-migrations',
                content:
                  'As migrations são executadas automaticamente antes de cada inicialização da API.',
              },
              {
                id: 'managed-health',
                content:
                  'A própria tela mostra a saúde do banco, da estrutura e da criptografia. Você não precisa acessar o Railway.',
              },
            ]}
          />
          <Result
            title="Nenhuma ação externa necessária"
            detail="Se algum componente ficar indisponível, o TMXHUB exibe o diagnóstico e a operação técnica corrige a infraestrutura sem expor credenciais."
          />
        </Section>

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

        <Section
          id="diagnostico"
          number="08"
          title="Status, quarentena e troubleshooting"
          subtitle="Use o estado recebido e o diagnóstico do webhook para encontrar o ponto exato da falha."
          icon={<AlertTriangle className="h-5 w-5" />}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Result title="Pago" detail="Pagamento confirmado. Conta como venda aprovada." />
            <Result
              title="Pendente"
              detail="Pedido criado, mas o pagamento ainda não foi confirmado."
            />
            <Result
              title="Recusado ou cancelado"
              detail="A transação existe, porém não deve entrar no faturamento."
              tone="warn"
            />
            <Result
              title="Reembolso ou chargeback"
              detail="A venda foi revertida. Esse estado tem prioridade e não volta para pendente."
              tone="warn"
            />
            <Result
              title="Sem atribuição"
              detail="A venda chegou, mas sem src válido. Revise o link do CTA e a propagação do identificador."
              tone="warn"
            />
            <Result
              title="Quarentena"
              detail="O webhook chegou, mas faltam dados essenciais ou o formato não foi reconhecido. Consulte o motivo e preserve o payload para ajuste."
              tone="warn"
            />
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-white/[0.07]">
            {[
              [
                'Nenhum PageView',
                'Confirme o script no HTML final, a chave pública, bloqueadores e erros no console do navegador.',
              ],
              [
                'Sem src no checkout',
                'O CTA deve ser um link clicável. Confirme se outro script substitui a URL depois do clique.',
              ],
              [
                'Webhook 401',
                'A URL foi copiada incompleta ou o token não corresponde à oferta. Gere uma nova configuração se o segredo vazou.',
              ],
              [
                'Webhook em quarentena',
                'Abra os diagnósticos. Normalmente falta ID da transação ou o payload da Vendepay mudou.',
              ],
              [
                'Venda duplicada',
                'Não altere o ID da transação. Retries normais atualizam o mesmo pedido de forma idempotente.',
              ],
              [
                'Tracking indisponível',
                'Consulte o diagnóstico automático na área de tracking. Não é necessário acessar o Railway.',
              ],
              [
                'Purchase não aparece no Meta',
                'Confira Pixel ID, token, Test Event Code e a entrega Meta no painel. Falhas temporárias são reenviadas automaticamente.',
              ],
            ].map(([problem, action], index) => (
              <div
                key={problem}
                className={`grid gap-1 p-4 md:grid-cols-[180px_1fr] md:gap-5 ${
                  index ? 'border-t border-white/[0.06]' : ''
                }`}
              >
                <p className="text-xs font-medium text-white/75">{problem}</p>
                <p className="text-xs leading-5 text-white/40">{action}</p>
              </div>
            ))}
          </div>
        </Section>

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
