'use client';

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
  MousePointerClick,
  Radio,
  RefreshCw,
  Send,
  ShoppingCart,
  Webhook,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

const steps = [
  { id: 'railway', label: 'PostgreSQL', icon: Database },
  { id: 'projeto', label: 'Oferta', icon: Radio },
  { id: 'script', label: 'Script', icon: Code2 },
  { id: 'webhook', label: 'Webhook', icon: Webhook },
  { id: 'meta', label: 'Meta CAPI', icon: Send },
  { id: 'testes', label: 'Testes', icon: CheckCircle2 },
  { id: 'diagnostico', label: 'Diagnóstico', icon: AlertTriangle },
];

function CopyBlock({ children, label }: { children: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.08] bg-[#020b12]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70 transition hover:text-cyan-200"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-cyan-100/75">
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
    <section
      id={id}
      className="scroll-mt-8 rounded-lg border border-white/[0.07] bg-white/[0.025] p-5 md:p-7"
    >
      <header className="mb-6 flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-300">
          {icon}
        </div>
        <div>
          <p className="hud-label">Etapa {number}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">{subtitle}</p>
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
        <li key={item.id} className="flex gap-3 text-sm leading-6 text-white/65">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300/80" />
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
      <p className="mt-1 text-xs leading-5 text-white/45">{detail}</p>
    </div>
  );
}

export function TrackingHelp() {
  return (
    <div className="grid gap-8 xl:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <nav className="sticky top-6 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="hud-label px-2 pb-2">Neste guia</p>
          {steps.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-cyan-200"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[0.04] p-5">
          <div className="flex gap-3">
            <Radio className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <p className="text-sm font-medium text-cyan-100">O que estará funcionando no final</p>
              <p className="mt-1 text-sm leading-6 text-white/55">
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
          title="Adicionar PostgreSQL no Railway"
          subtitle="O tracking precisa de um banco permanente para eventos, pedidos e auditoria."
          icon={<Database className="h-5 w-5" />}
        >
          <ol className="space-y-4 text-sm leading-6 text-white/65">
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">01</span>
              No projeto do TMXHUB no Railway, clique em{' '}
              <strong className="text-white/80">+ New</strong>, escolha{' '}
              <strong className="text-white/80">Database</strong> e depois{' '}
              <strong className="text-white/80">PostgreSQL</strong>.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">02</span>
              Abra o serviço da API, entre em <strong className="text-white/80">Variables</strong> e
              crie uma referência para a variável{' '}
              <code className="text-cyan-200">DATABASE_URL</code> do PostgreSQL.
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-cyan-300/60">03</span>
              Aguarde o redeploy. A API executa a migration de tracking automaticamente ao iniciar.
            </li>
          </ol>
          <div className="mt-5">
            <CopyBlock label="Nome da variável">DATABASE_URL</CopyBlock>
          </div>
          <div className="mt-3">
            <CopyBlock label="Segredo adicional da API">
              TRACKING_ENCRYPTION_KEY=gere-um-segredo-aleatorio-com-32-ou-mais-caracteres
            </CopyBlock>
          </div>
          <Result
            title="Critério de sucesso"
            detail="O deploy da API fica verde e os logs exibem que a migration de tracking foi aplicada ou já estava atualizada."
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
          <CopyBlock label="Exemplo — use o código gerado na oferta">
            {'<script async src="https://SUA-API/v1/track/t.js?key=SUA_CHAVE"></script>'}
          </CopyBlock>
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
            <CopyBlock label="Formato — copie a URL real da oferta">
              {'https://SUA-API/v1/webhooks/vendepay?token=SEU_TOKEN_SECRETO'}
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
          id="testes"
          number="06"
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
          number="07"
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
                'Verifique DATABASE_URL, TRACKING_ENCRYPTION_KEY, o PostgreSQL e os logs da migration no Railway.',
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
