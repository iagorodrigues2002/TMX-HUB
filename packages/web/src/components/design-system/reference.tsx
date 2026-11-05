'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataState } from '@/components/ui/data-state';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Kpi } from '@/components/ui/kpi';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  Layers3,
  LockKeyhole,
  Moon,
  MousePointer2,
  Palette,
  PanelLeft,
  RefreshCw,
  Sun,
  TableProperties,
  User,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  primitiveAudit,
  productCoverage,
  referenceMotion,
  referencePalette,
  referenceSections,
} from './reference-data';
import { ChartSpecimen, FunnelSpecimen, MapSpecimen } from './reference-data-motion';
import { LoginSpecimen } from './reference-login';
import { NumberSpecimen } from './reference-motion';
import { NotificationsSpecimen } from './reference-notifications';
import { FormSpecimen, OperationalSpecimen, TableSpecimen } from './reference-operations';
import { FullTransitionSpecimen } from './reference-screen-transition';
import styles from './reference.module.css';
import './reference-tokens.css';

const sectionIcons = [
  Palette,
  MousePointer2,
  Layers3,
  Activity,
  LockKeyhole,
  TableProperties,
  Bell,
  ClipboardList,
];

function Section({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHeading}>
        <span className={styles.sectionNumber}>{number}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function DesignSystemReference() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [motion, setMotion] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('Todos os dados desta página são demonstrativos.');
  const [scope, setScope] = useState('account');
  const [fieldState, setFieldState] = useState<'normal' | 'error' | 'success'>('normal');
  const [email, setEmail] = useState('demo@tmx.local');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const feedback = () => {
    if (busy) return;
    setBusy(true);
    setSuccess(false);
    setMessage('Atualizando o exemplo local…');
    timer.current = setTimeout(() => {
      setBusy(false);
      setSuccess(true);
      setMessage('Exemplo atualizado. Nenhuma consulta à operação foi feita.');
    }, 750);
  };
  const overlayClass = `tmx-glass-reference ${styles.overlay}`;
  const primaryStyle = { backgroundImage: 'var(--ds-action-fill)' };

  return (
    <div
      className={`tmx-glass-reference ${styles.page}`}
      data-theme={theme}
      data-motion={motion ? 'on' : 'off'}
    >
      <a className={styles.skipLink} href="#reference-main">
        Pular para o conteúdo
      </a>
      <svg
        className={styles.network}
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M0 130 200 270 430 90 600 320 850 140 1080 290 1320 80 1600 240M0 480 200 270 380 550 600 320 820 590 1080 290 1240 520 1600 240M0 480 180 810 380 550 620 880 820 590 1090 790 1240 520 1600 770M180 810 430 90M600 320 620 880M850 140 820 590M1080 290 1090 790M1320 80 1240 520" />
        {[
          [200, 270],
          [430, 90],
          [600, 320],
          [850, 140],
          [1080, 290],
          [380, 550],
          [820, 590],
          [1240, 520],
          [620, 880],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
      </svg>
      <header className={styles.topbar}>
        <Button
          variant="ghost"
          size="icon"
          className={styles.iconButton}
          aria-label="Abrir navegação da referência"
          aria-expanded={sidebar}
          aria-controls="reference-navigation"
          onClick={() => setSidebar(!sidebar)}
        >
          <PanelLeft />
        </Button>
        <a className={styles.brand} href="#foundations">
          <span>
            <Activity aria-hidden />
          </span>
          TMX HUB <small>Design system</small>
        </a>
        <span className={styles.version}>Referência 0.1 · em revisão</span>
        <div className={styles.topActions}>
          <label htmlFor="reference-motion" className={styles.motionSwitch}>
            <Checkbox
              id="reference-motion"
              className={styles.checkbox}
              checked={motion}
              onChange={(event) => setMotion(event.target.checked)}
            />
            Animações
          </label>
          <Button
            variant="ghost"
            size="icon"
            className={styles.iconButton}
            aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>
      <aside
        id="reference-navigation"
        className={styles.sidebar}
        data-open={sidebar}
        aria-label="Seções da referência"
      >
        <p className={styles.navTitle}>Referência</p>
        <nav>
          {referenceSections.map((section, index) => {
            const Icon = sectionIcons[index] ?? Layers3;
            return (
              <a key={section.id} href={`#${section.id}`} onClick={() => setSidebar(false)}>
                <span>
                  <Icon aria-hidden />
                </span>
                <span className={styles.navLabel}>{section.label}</span>
              </a>
            );
          })}
        </nav>
        <div className={styles.navFooter}>
          <span>IR</span>
          <p className={styles.navLabel}>Somente demonstração</p>
        </div>
      </aside>
      <div className={styles.scrim} aria-hidden />
      <main id="reference-main" className={styles.main}>
        <div className={styles.intro}>
          <div>
            <p className={styles.caption}>Glassy Dashboard + Liquid Glass · identidade TMX</p>
            <h1>
              Uma linguagem para
              <br />
              toda a operação.
            </h1>
            <p>
              Materiais, componentes e comportamentos para evoluir o TMX mantendo sua estrutura.
              Esta referência usa os componentes React atuais com estilos isolados.
            </p>
          </div>
          <div className={styles.introNote}>
            <Check aria-hidden />
            <strong>
              O preview como referência.
              <br />O código atual como base.
            </strong>
            <span>Sem API de negócio, dados reais ou mudanças nas telas existentes.</span>
          </div>
        </div>

        <Section
          id="foundations"
          number="01"
          title="Fundamentos"
          description="Vidro transparente, texto legível e contornos discretos. A cor sinaliza uma ação ou um resultado."
        >
          <div className={styles.palette}>
            {referencePalette.map((item) => (
              <div key={item.token} className={styles.swatch}>
                <span style={{ backgroundColor: `var(${item.token})` }} />
                <strong>{item.label}</strong>
                <code>{item.token}</code>
              </div>
            ))}
          </div>
          <div className={styles.twoColumns}>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Tipografia e densidade</CardTitle>
                <CardDescription>
                  Space Grotesk para a interface. Números tabulares; mono somente em identificadores
                  e código.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className={styles.typeTitle}>Sua operação, em uma só visão.</p>
                <p className={styles.typeNumber}>R$ 3.130,34</p>
                <p className={styles.bodyText}>
                  Texto de apoio entre 12 e 14 px, com largura confortável e contraste nos dois
                  temas.
                </p>
                <div className={styles.chips}>
                  {['4', '8', '12', '16', '24', '32'].map((value) => (
                    <span key={value}>{value}px</span>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Material e forma</CardTitle>
                <CardDescription>
                  Sem bordas neon. Menus mais sólidos; conteúdo com transparência moderada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className={styles.materialExample}>
                  <Layers3 aria-hidden />
                  <span>
                    Vidro · blur até 12px nos menus
                    <br />
                    <small>Painéis usam gradientes; a tinta do texto permanece opaca.</small>
                  </span>
                </div>
                <div className={styles.chips}>
                  {['Controle · 14px', 'Painel · 24px', 'Pílula · 999px'].map((value) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
                <p className={styles.caption}>
                  Sem backdrop-filter, usar superfície sólida. Nunca sacrificar legibilidade pelo
                  efeito.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section
          id="components"
          number="02"
          title="Componentes e interações"
          description="Os mesmos contratos do TMX, com uma nova camada visual. Teste pelo mouse, toque e teclado."
        >
          <Card className={styles.surface}>
            <CardHeader>
              <CardTitle>Botões</CardTitle>
              <CardDescription>
                Variantes, loading, confirmação e estados indisponíveis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={styles.row}>
                <Button
                  className={styles.primary}
                  style={primaryStyle}
                  onClick={() => setMessage('Ação principal demonstrada.')}
                >
                  Ação principal <ArrowUpRight aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  className={styles.secondary}
                  onClick={() => setMessage('Ação secundária demonstrada.')}
                >
                  Secundário
                </Button>
                <Button variant="ghost" className={styles.secondary}>
                  Discreto
                </Button>
                <Button
                  variant="destructive"
                  className={styles.danger}
                  onClick={() =>
                    setMessage('Ação destrutiva ilustrativa; nenhum dado foi removido.')
                  }
                >
                  Destrutivo
                </Button>
                <Button disabled className={styles.primary} style={primaryStyle}>
                  Indisponível
                </Button>
              </div>
              <div className={styles.row}>
                <Button
                  className={styles.primary}
                  style={primaryStyle}
                  onClick={feedback}
                  loading={busy}
                  loadingLabel="Atualizando…"
                  success={success}
                  successLabel="Atualizado"
                >
                  <RefreshCw aria-hidden />
                  Atualizar exemplo
                </Button>
                <span className={styles.caption}>
                  Feedback usa o Button existente, com bloqueio de cliques repetidos.
                </span>
              </div>
              <output className={styles.feedback}>{message}</output>
            </CardContent>
          </Card>
          <div className={styles.twoColumns}>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Campos e validação</CardTitle>
                <CardDescription>
                  Rótulos, ajuda, erro e sucesso continuam associados ao campo.
                </CardDescription>
              </CardHeader>
              <CardContent className={styles.formStack}>
                <FormField
                  id="reference-email"
                  label="E-mail"
                  help="Dados fictícios, sem envio."
                  error={fieldState === 'error' ? 'Revise o e-mail informado.' : undefined}
                  success={fieldState === 'success'}
                >
                  <Input
                    className={styles.input}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="off"
                  />
                </FormField>
                <FormField id="reference-disabled" label="Campo indisponível">
                  <Input
                    className={styles.input}
                    disabled
                    value="Acesso somente leitura"
                    readOnly
                  />
                </FormField>
                <div className={styles.row}>
                  {(['normal', 'error', 'success'] as const).map((state) => (
                    <Button
                      key={state}
                      variant="outline"
                      className={styles.secondary}
                      aria-pressed={fieldState === state}
                      onClick={() => setFieldState(state)}
                    >
                      {state === 'normal' ? 'Normal' : state === 'error' ? 'Erro' : 'Sucesso'}
                    </Button>
                  ))}
                </div>
                <label htmlFor="reference-notice-preference" className={styles.checkLabel}>
                  <Checkbox
                    id="reference-notice-preference"
                    className={styles.checkbox}
                    defaultChecked
                  />
                  Receber notificações da operação
                </label>
              </CardContent>
            </Card>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Listas, menus e tooltip</CardTitle>
                <CardDescription>
                  Radix mantém teclado, Esc, foco e colisão com a janela.
                </CardDescription>
              </CardHeader>
              <CardContent className={styles.formStack}>
                <p id="reference-scope-label" className={styles.fieldLabel}>
                  Escopo dos dados
                </p>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className={styles.select} aria-labelledby="reference-scope-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className={overlayClass}
                    data-theme={theme}
                    data-motion={motion ? 'on' : 'off'}
                  >
                    <SelectItem className={styles.option} value="account">
                      Minha conta · 3 ofertas · BRL
                    </SelectItem>
                    <SelectItem className={styles.option} value="offer">
                      Oferta Aurora · BRL
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className={styles.row}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className={styles.secondary}>
                        <User aria-hidden />
                        Perfil <ChevronDown aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className={overlayClass}
                      data-theme={theme}
                      data-motion={motion ? 'on' : 'off'}
                      align="start"
                    >
                      <DropdownMenuLabel className={styles.menuLabel}>
                        Perfil demonstrativo
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={styles.option}
                        onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      >
                        {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}Alternar
                        aparência
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={styles.option}
                        onSelect={() =>
                          setMessage('Nenhuma notificação real é consultada nesta referência.')
                        }
                      >
                        <Bell aria-hidden />
                        Notificações
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className={styles.tipHost}>
                    <Button
                      variant="outline"
                      size="icon"
                      className={styles.iconButton}
                      aria-label="Sobre as notificações"
                      aria-describedby="reference-tooltip"
                    >
                      <Bell />
                    </Button>
                    <span className={styles.tooltip} id="reference-tooltip" role="tooltip">
                      Somente notificações demonstrativas
                    </span>
                  </span>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className={styles.secondary}>
                      Abrir modal de exemplo
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    className={overlayClass}
                    data-theme={theme}
                    data-motion={motion ? 'on' : 'off'}
                    overlayClassName={styles.modalScrim}
                  >
                    <DialogHeader>
                      <DialogTitle>Revisar alteração</DialogTitle>
                      <DialogDescription>
                        Exemplo de modal usando o componente atual do TMX. Nenhuma alteração será
                        salva.
                      </DialogDescription>
                    </DialogHeader>
                    <p className={styles.bodyText}>
                      Tab permanece no modal. Esc fecha e devolve o foco ao botão de origem.
                    </p>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline" className={styles.secondary}>
                          Cancelar
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          className={styles.primary}
                          style={primaryStyle}
                          onClick={() =>
                            setMessage('Confirmação demonstrada. Nenhum dado foi salvo.')
                          }
                        >
                          Confirmar exemplo
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
          <Card className={styles.surface}>
            <CardHeader>
              <CardTitle>Abas e status</CardTitle>
              <CardDescription>
                Estado ativo reconhecível sem glow ou cor como único sinal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview">
                <TabsList className={styles.tabs}>
                  <TabsTrigger className={styles.tab} value="overview">
                    Visão geral
                  </TabsTrigger>
                  <TabsTrigger className={styles.tab} value="offers">
                    Ofertas
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className={styles.tabContent}>
                  Uma leitura consolidada das ofertas acessíveis.
                </TabsContent>
                <TabsContent value="offers" className={styles.tabContent}>
                  Resultados agrupados por conta, moeda e oferta.
                </TabsContent>
              </Tabs>
              <div className={styles.row}>
                <Badge variant="success" className={styles.badge} data-tone="positive">
                  <Check aria-hidden />
                  Conectado
                </Badge>
                <Badge variant="warning" className={styles.badge} data-tone="warning">
                  Atenção
                </Badge>
                <Badge variant="destructive" className={styles.badge} data-tone="negative">
                  Falha
                </Badge>
                <Badge variant="secondary" className={styles.badge}>
                  Indisponível
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="data"
          number="03"
          title="Dados, privacidade e estados"
          description="Hierarquia clara, contagem suave e feedback que explica o que aconteceu."
        >
          <div className={styles.twoColumns}>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Números e comparativos</CardTitle>
                <CardDescription>
                  Valores fictícios. A privacidade interrompe a animação imediatamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NumberSpecimen motion={motion} />
              </CardContent>
            </Card>
            <div className={styles.formStack}>
              <Kpi
                className={styles.kpi}
                label="Vendas aprovadas"
                value="18"
                icon={<Check aria-hidden />}
                hint="Componente Kpi existente · apresentação candidata"
              />
              <Kpi
                className={styles.kpi}
                label="Após retenção da reserva"
                value="R$ 2.458,64"
                icon={<Layers3 aria-hidden />}
                hint="Estimativa; não representa saldo liberado para saque."
              />
            </div>
          </div>
          <div className={styles.threeColumns}>
            <DataState
              className={styles.state}
              variant="loading"
              title="Atualizando o resumo"
              description="Aguarde a consulta do período."
            />
            <DataState
              className={styles.state}
              variant="empty"
              title="Nenhuma oferta neste escopo"
              description="Selecione outro período ou oferta."
            />
            <DataState
              className={styles.state}
              variant="error"
              title="Não foi possível atualizar o resumo"
              description="A consulta não foi concluída. Seus filtros foram preservados."
              suggestion="Tente novamente. Se continuar, envie os detalhes técnicos ao suporte."
              technicalDetails={{ statusCode: 503, requestId: 'exemplo-ficticio-001' }}
              onRetry={feedback}
              isRetrying={busy}
            />
          </div>
          <Card className={styles.surface}>
            <CardHeader>
              <CardTitle>Erros que ajudam a resolver</CardTitle>
              <CardDescription>
                Explique o que falhou, o impacto e o próximo passo. Nunca mostre apenas “Erro HTTP”.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                <li>Use linguagem direta: “Não foi possível salvar a oferta”.</li>
                <li>
                  Informe a causa somente quando confirmada: conexão, sessão expirada, falta de
                  permissão ou campo inválido. Sem diagnóstico, diga que a causa não foi
                  identificada.
                </li>
                <li>
                  Ofereça a ação adequada: revisar o campo, entrar novamente, pedir acesso ou tentar
                  novamente. Preserve os dados preenchidos e não prometa que foram salvos.
                </li>
                <li>
                  Associe erros de formulário ao campo e anuncie falhas sem depender apenas da cor.
                </li>
                <li>
                  Código HTTP e identificador da solicitação ficam em detalhes técnicos expansíveis,
                  sem expor credenciais, dados pessoais ou respostas internas do servidor.
                </li>
                <li>
                  HTTP 301 indica redirecionamento, não falha por si só. Se impedir a ação, explique
                  que ela não foi concluída; não invente uma causa nem trate todo código da mesma
                  forma.
                </li>
              </ul>
              <p>Exemplos de orientação por contexto:</p>
              <ul>
                <li>Sessão expirada: “Entre novamente para continuar”.</li>
                <li>Sem permissão: “Peça acesso ao administrador da sua empresa”.</li>
                <li>Muitas tentativas: “Aguarde antes de tentar novamente”.</li>
                <li>Campo inválido: “Informe um e-mail no formato nome@empresa.com”.</li>
              </ul>
            </CardContent>
          </Card>
        </Section>

        <Section
          id="motion"
          number="04"
          title="Movimento com função"
          description="Presença na entrada, continuidade nas atualizações e controle para quem prefere menos movimento."
        >
          <div className={styles.twoColumns}>
            <Card className={styles.surface}>
              <CardHeader>
                <CardTitle>Transição de telas</CardTitle>
                <CardDescription>
                  Entrada curta sem desfoque ou cópia da tela; números animados na ida e na volta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FullTransitionSpecimen motion={motion} />
              </CardContent>
            </Card>
            <div className={styles.motionTable}>
              {referenceMotion.map((item) => (
                <div key={item.name}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <code>{item.value}</code>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.twoColumns}>
            <MapSpecimen motion={motion} />
            <ChartSpecimen motion={motion} />
          </div>
          <FunnelSpecimen motion={motion} />
          <p className={styles.note}>
            A preferência do sistema por movimento reduzido tem prioridade sobre o botão de
            animações. Foco, leitura e estados funcionam sem efeitos.
          </p>
        </Section>

        <Section
          id="login"
          number="05"
          title="Login e acesso"
          description="E-mail e senha, sem OTP. Estados, validação e animações do preview em uma demonstração isolada."
        >
          <LoginSpecimen motion={motion} />
        </Section>

        <Section
          id="operations"
          number="06"
          title="Operação, edição e recuperação"
          description="Exemplos interativos com dados fictícios. Preservam contexto e deixam explícito o que aconteceu, o que foi salvo e o que pode ser repetido."
        >
          <TableSpecimen theme={theme} motion={motion} />
          <div className={styles.twoColumns}>
            <FormSpecimen />
            <OperationalSpecimen />
          </div>
        </Section>

        <Section
          id="notifications"
          number="07"
          title="Central de notificações"
          description="A estrutura atual com a linguagem Glassy: filtros, leitura individual e em lote, privacidade e painel lateral."
        >
          <NotificationsSpecimen theme={theme} motion={motion} />
        </Section>

        <Section
          id="coverage"
          number="08"
          title="O que já existe. O que evolui."
          description="Cobertura por família de telas e inventário inicial dos componentes. Referência candidata, ainda não pronta para adoção global."
        >
          <Card className={styles.surface}>
            <CardHeader>
              <CardTitle>Vai atender o TMX inteiro?</CardTitle>
              <CardDescription>
                A direção visual pode ser compartilhada; os padrões operacionais abaixo ainda
                precisam ser completados. Inventário estático de 44 entradas page.tsx, incluindo
                previews e páginas auxiliares, sem certificação visual de todas as rotas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                Primeiro validar tabelas, formulários, permissões e jobs. Depois aplicar a mesma
                linguagem por módulo, preservando estrutura, densidade e regras atuais.
              </p>
            </CardContent>
          </Card>
          <div className={styles.auditTable}>
            <table>
              <caption className={styles.srOnly}>Cobertura do design system no produto</caption>
              <thead>
                <tr>
                  <th scope="col">Família</th>
                  <th scope="col">Cobertura / prioridade</th>
                  <th scope="col">O que falta validar</th>
                </tr>
              </thead>
              <tbody>
                {productCoverage.map((item) => (
                  <tr key={item.area}>
                    <th scope="row">{item.area}</th>
                    <td>
                      {item.status}
                      <br />
                      <small>{item.priority}</small>
                    </td>
                    <td>{item.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            P1: necessário antes de ampliar a adoção. P2: completar antes de migrar o módulo.
            “Parcial” descreve apenas a referência, não um defeito confirmado na tela atual. A
            tabela abaixo mantém a contagem inicial de importadores como snapshot; não mede
            cobertura de migração.
          </p>
          <div className={styles.auditTable}>
            <table>
              <caption className={styles.srOnly}>Auditoria dos componentes atuais do TMX</caption>
              <thead>
                <tr>
                  <th scope="col">Componente</th>
                  <th scope="col">Importadores</th>
                  <th scope="col">Próxima adaptação</th>
                </tr>
              </thead>
              <tbody>
                {primitiveAudit.map((item) => (
                  <tr key={item.file}>
                    <th scope="row">
                      {item.name}
                      <code>{item.file}</code>
                    </th>
                    <td>{item.consumers}</td>
                    <td>{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            Esta página é uma referência candidata. APIs de negócio, permissões, navegação real e
            layout das telas não foram migrados. A documentação canônica continua em DESIGN.md.
          </p>
        </Section>
        <footer className={styles.footer}>
          <span>TMX HUB · Design system 0.1</span>
          <span>Componentes reais · dados fictícios · sem API de negócio</span>
        </footer>
      </main>
    </div>
  );
}
