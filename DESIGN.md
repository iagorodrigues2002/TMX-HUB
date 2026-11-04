# DESIGN.md — TMX HUB

## Evolução Glassy / Liquid Glass — adoção local (03/11/2026)

A direção visual foi trabalhada em previews separados de Visão geral, Ofertas e login. A
primeira referência React está em `/preview/design-system`, com tokens opt-in em
`packages/web/src/components/design-system/reference-tokens.css`. O harness em
`mockups/design-system-reference` permite revisar o mesmo componente sem providers de negócio.

Direção adotada no aplicativo local: vidro translúcido com texto opaco e legível, contornos neutros sem neon,
ações claras com rótulo escuro, ícones Lucide consistentes, lateral sobreposta, privacidade e
movimento reduzido. A ponte semântica global está em `packages/web/src/app/design-system.css`,
ativada por `data-tmx-design="glass"` no layout. Ela alcança as rotas pelos componentes
compartilhados, preservando os contratos de negócio. Login usa e-mail e senha, sem OTP.

### Contrato visual da aplicação

A adoção cobre todas as 44 rotas registradas em
[`docs/design-system-routes.json`](docs/design-system-routes.json): 26 com shell autenticado,
9 superfícies públicas ou focadas, 2 referências e 7 redirecionamentos. Não há página de
interface dispensada dos tokens. O conteúdo importado em iframe mantém sua apresentação
original; o visual do editor e dos controles do TMX recebe o sistema.

`node scripts/audit-design-system.mjs --check` audita estilos legados sem escrever arquivos.
Os testes do frontend verificam o inventário completo das rotas e a migração das cores de
interface. Uma rota nova deve entrar nesse inventário e usar o frame apropriado.

O preview aprovado e a referência são a especificação de apresentação, incluindo tipografia,
composição e movimento. A adoção não deve manter o acabamento antigo sob uma nova paleta.
Os valores demonstrativos não fazem parte dessa especificação: as telas reais mantêm seus dados.

- Superfícies: material baseado na Glassy Dashboard v7, desfoque de 34px e saturação de 140%,
  raio de 24px, sombra dupla suave, brilho discreto no canto superior esquerdo e borda neutra.
  Vidro dentro de vidro usa sombra menor e não repete o backdrop-filter. A paleta e o fundo TMX permanecem.
- Texto: opaco; `foreground`, `muted-foreground` e cores de estado próprios para cada tema.
- Ações principais: gradiente claro com texto escuro; campos e ações secundárias usam superfície discreta.
- Desktop: lateral recolhida por padrão, expansão sobre o conteúdo por hover ou pelo controle do cabeçalho;
  desfoque e escurecimento de fundo em 520ms. A antiga preferência de fixação não é reutilizada:
  a abertura é transitória e recolhe ao sair com o mouse ou clicar fora. Foco visível por teclado
  mantém a navegação acessível até o foco sair da lateral.
- Notificações: mesmo material e transição do painel lateral; saída confirmada pelo servidor antes
  da animação e recolhimento suave do espaço. Tarefas e calls preservam as regras de permanência.
- Lateral: rótulos e controles ficam montados em uma coluna interna de largura fixa. Ao recolher,
  somente o contorno externo e a visibilidade mudam; nenhuma troca de árvore ou ajuste de fonte.
- Cabeçalho: busca central, ações circulares, logo TMX e breadcrumb; controle de ofertas permanece
  acessível nas áreas que o exigem. A navegação por teclado também pode revelar a lateral.
- Dados: contagem de 1650ms com desaceleração; ao entrar na tela parte de zero, nos filtros parte
  do valor atual. Gráfico usa geometria compartilhada com a referência, eixo lateral em HTML
  e interpolação conjunta da série e escala em 950ms. ARPU é uma faixa de largura completa.
- Navegação: o template raiz aplica o mesmo motor da referência a todas as rotas. Saída em
  300ms para escala 0,8×, entrada após 150ms em 1,5× → 1,4× → 1× durante 480ms, com
  escalonamento de 35ms e desfoque separado do material. A sequência se repete ao voltar.
  Cada card é selecionado individualmente, com origem no centro da janela. Títulos livres
  entram em escala 1,18×; controles flutuantes, em 1,3×, com desaceleração da v7.
  Cabeçalhos e textos finais fora dos cards participam da mesma sequência. O texto de saída
  desaparece antes da entrada seguinte; o conteúdo dos cards aguarda a fase inicial ampliada
  para reaparecer, evitando sobreposição entre títulos e descrições.
  As seções do tracking e da Administração incluem cabeçalho, menu de área e filtros nessa sequência.
  Nas trocas internas da Administração, título, ações e navegação permanecem parados; somente
  a área de caixas abaixo das abas reinicia. O Financeiro inclui a caixa principal de Saques,
  Despesas e os estados de carregamento, vazio e erro da Reserva na entrada dos painéis.
  Painéis montados depois da resposta da API também entram uma vez. Atualizações de texto,
  polling e o estado pendente da troca de período não reiniciam essa entrada.
  A saída mantém somente uma cópia visual inerte, recortada abaixo do cabeçalho; ela é
  descartada ao terminar, cancelar, ocultar valores, desligar efeitos ou trocar de sessão.
  Componentes e efeitos de negócio não são duplicados. Polling e filtros não reiniciam a tela.
- Carregamento de período: manter a estrutura montada, limpar valores para “—” e aguardar os
  dados completos; não substituir a tela por skeletons cinza. A contagem guarda a leitura anterior
  durante a espera. A estrutura anterior só pode ser reaproveitada dentro da mesma identidade e escopo.
- Mapa: malha com respiração de 7s e pulsos de eventos em 3,8s; pausa e movimento reduzido são respeitados.
  País desconhecido (`ZZ`) é explicado, não contado como país identificado nem convertido em ponto fictício.
- Acessibilidade: movimento reduzido, preferência de efeitos, foco e comportamento Radix mantidos;
  fallback opaco sem suporte a `backdrop-filter`. Tabelas mantêm sua rolagem local quando necessária.

O [registro da adoção local](docs/reports/design-system-local-rollout-2026-11-03.md)
documenta a validação e seus limites. A referência continua sendo uma demonstração, sem substituir
dados, permissões, filtros, cálculos financeiros ou operações reais por fixtures visuais.

O restante deste documento registra também o sistema anterior e seu escopo específico de tracking.
As divergências com a nova direção estão explicitadas na
[auditoria inicial](docs/reports/design-system-audit-2026-11-03.md). Antes de adotar o novo
sistema em outras integrações, usar os tokens e comportamentos acima; não manter
uma segunda documentação canônica de design. Em conflito com a paleta histórica abaixo,
prevalece a ponte semântica Glassy e seus temas.

### Cobertura do produto — revisão de 03/11/2026

A seção Notificações adapta a central atual: categorias com contagens da amostra,
leitura individual ou somente dos itens da categoria exibida, desfazer, atualização e
privacidade dos valores. Contorno neutro substitui o cartão todo verde; status continua
explícito em texto. Marcar como lida anima a saída com o helper existente
`animateNotificationExit` e retira vendas da lista; tarefas e calls permanecem após leitura.
Tarefas têm ação separada de concluir, que anima a saída e pode ser desfeita no exemplo.
Cartões de tarefa preservam o formato operacional: título, prazo, responsáveis, contexto,
status Pendente/Em progresso/Concluída e indicação de leitura. Trocar entre pendente e em
progresso não remove o cartão; somente concluir o retira.
Desfazer restaura a ordem original. Contagens das abas acompanham cartões visíveis e a
contagem de não lidas é independente. Movimento reduzido remove sem animação.
Após a saída, altura, padding, bordas e margens do cartão fecham em 360ms para que os
seguintes subam sem salto. Abas mantêm o shell fixo: saída de 140ms e entrada de 280ms;
cliques rápidos cancelam a troca pendente. Desfazer restaura o conteúdo da amostra.
Cabeçalho, filtros e ações
ficam fixos; lista tem rolagem local. A referência inclui drawer Radix com Escape e retorno
de foco. Os exemplos não consultam a central real nem alteram leitura/permissões.

O cabeçalho principal usa a proteção em degradê do preview: cor do canvas até 82px,
suavizando até ficar transparente em 94px (mobile: 71px/82px). Evitar uma faixa sólida
com término abrupto. Conteúdo em rolagem não pode aparecer no espaço acima da barra de vidro.

A seção Operação adiciona uma tabela com busca, ordenação, paginação, seleção por página,
ação local em lote e desfazer. Cabeçalho fixo e rolagem ficam no contêiner da tabela;
preservar navegação por teclado e não provocar overflow no documento.

O formulário demonstra DateRangeFilter existente, campos de texto, textarea, moeda e CSV
opcional de até 2 MB. Upload só valida metadados: não lê, importa ou envia conteúdo.
Salvar é simulado, bloqueia envio duplicado, preserva dados inválidos e foca o primeiro erro.
Restaurar dados alterados pede confirmação local; nenhum dado de negócio é modificado.

O painel operacional demonstra fila, progresso, falha parcial (17 aceitos/3 pendentes),
retry somente dos pendentes, cancelamento e cenários offline/desatualizado/sem acesso/erro/vazio.
Tempos e resultados são fictícios e explicitamente rotulados. Não reutilizar essa simulação
como sinal de progresso real ou como prova de que um endpoint suporta retry/cancelamento.

A referência ainda não atende integralmente ao TMX. A seção Auditoria registra cobertura
parcial por família. Antes da adoção global, completar tabelas densas, formulários/períodos,
contexto de empresa/permissões, financeiro, jobs e estados assíncronos. Não aplicar vidro,
contagem ou transições de painéis indiscriminadamente a edição, listas e tabelas.
A [revisão de cobertura](docs/reports/design-system-product-coverage-2026-11-03.md) registra
evidências e ordem de validação; não substitui este contrato canônico nem certifica runtime.

### Transição completa de telas — referência interativa

O exemplo de Movimento reproduz a sequência atual do preview: saída dos painéis para 0,8×
(500ms, atraso de até 360ms entre blocos), início da entrada após 380ms, escala
1,5× → 1,4× → 1× (780ms, atraso de 75ms por bloco). O centro da área de demonstração é
a origem comum. Vidro tem animação própria (702ms na entrada); conteúdo vai de blur 12px
a 0px na entrada, e até 14px na saída. Camadas simultâneas preservam a sobreposição do preview.

Visão geral e Ofertas reiniciam a contagem do zero em cada entrada, inclusive na volta.
Filtros mantêm seus valores por tela e interpolam do número visível, sem zerar. Cliques rápidos
cancelam animações/timers anteriores; a tela de saída fica inert e fora da árvore acessível.
Sem movimento, a troca é imediata. Shell e rotas de produção não são modificados.

### Login — referência interativa

A seção Login demonstra e-mail e senha, sem OTP, usando os primitives existentes. Inclui
campos preenchidos com dados fictícios, validação associada ao campo, mostrar/ocultar senha,
botão bloqueado durante carregamento, falha acionável e sucesso com foco no título.
Recuperação de senha e solicitação de acesso exibem apenas orientação, sem enviar pedidos.

Reproduzir a composição do preview aprovado: painel ilustrado à esquerda, marca TMX,
cartões Visão geral/Rastreamento/Financeiro, órbitas e esfera circular de olhos claros.
À direita, formulário compacto com recuperação junto ao rótulo Senha e solicitação abaixo
do botão. Textos e proporções seguem o print de referência de 03/11/2026 às 13:57.
Reproduzir entrada (800ms), mudança de etapa (450ms), spinner e personagem
flutuante que fecha os olhos no foco da senha e reage ao sucesso. Respeitar a preferência
de movimento reduzido e o controle de animações da referência. O botão de replay cancela
conclusões pendentes e restaura a demonstração; esta seção não autentica, salva credenciais
ou cria sessões. A política real de autenticação permanece fora do escopo desta amostra.

### Movimento de dados — referência interativa

A seção Movimento inclui o mapa, gráfico e funil trabalhados no preview. O mapa reaproveita
os 176 contornos e oito pontos demonstrativos, com pulsos escalonados de 3,8s, pausa e seleção
por mouse, toque e teclado. Ao sair do mapa, limpar o destaque do país.

O gráfico interpola os valores em 950ms a partir do quadro visível; curva, área, pontos e
leitura de valores usam a mesma geometria. Trocas rápidas cancelam o frame anterior. A amostra
usa os 24 valores e segmentos retos do preview, escala dinâmica interpolada e tooltip
diretamente na área do gráfico, sem grade de botões de horários. Eixo Y em HTML preserva
as proporções da fonte; largura medida ajusta SVG e áreas de interação. Navegação por
Tab/setas e Escape continua disponível sem controles extras visíveis.

O funil usa varredura sutil, ícones e setas em sequência num ciclo de 6s. Os efeitos são
ilustrativos: não incrementam métricas nem simulam eventos reais. Oferecer pausa, respeitar
movimento reduzido e suspender efeitos quando a demonstração não estiver visível.

### Mensagens de erro — direção candidata

Nunca apresentar somente “Erro HTTP 301” ou outro código. Informar a ação que não foi
concluída, seu impacto e um próximo passo útil. Explicar a causa apenas quando confirmada;
não inferir sessão expirada, indisponibilidade ou perda de dados a partir de um código genérico.
HTTP 301 é redirecionamento e não representa falha por si só.

Preservar campos e filtros, sem afirmar que dados foram salvos quando isso não foi confirmado.
Associar validações aos campos e anunciar falhas de forma acessível, sem depender apenas de
vermelho. A recuperação deve corresponder ao contexto: corrigir campo, entrar novamente,
pedir permissão ou tentar novamente; não oferecer retry indiscriminado em ações sensíveis.

Reutilizar `DataState` para falhas de carregamento. Código HTTP e identificador de solicitação
ficam em detalhes técnicos expansíveis; nunca expor credenciais, dados pessoais ou payloads
internos. Exemplo: “Não foi possível atualizar o resumo. A consulta não foi concluída.
Seus filtros foram preservados. Tente novamente”. A página de referência demonstra o padrão;
esta etapa não modifica o tratamento de erros de todas as telas.

## Escopo deste documento

Sistema visual atual do TMX HUB e regras para a evolução do módulo **Trackeamento avançado** (`/tracking`). O restante do produto herda o mesmo sistema mas não é escopo de reforma agora.

## Escolha de tema (raciocínio)

Cena física: gestor de tráfego olhando o painel em monitor 27"+ à noite, no meio de uma sessão de escala com Meta Ads/UTMify em outras abas. Ambiente escuro, foco em sinais que mudam ao vivo. Tema: **dark, sem alternativa clara**. Não porque "ferramenta é dark", mas porque o cenário força.

## Paleta (OKLCH-first)

Neutros levemente tintados na direção do accent (teal/cyan). Nunca `#000` nem `#fff`.

### Superfícies

| Token | Valor | Uso |
|---|---|---|
| `--surface-void` | `oklch(0.15 0.015 210)` (~ `#061119`) | Fundo base da página |
| `--surface-plate` | `oklch(0.21 0.022 210)` (~ `#0b1c27`) | Elevação primária (superfícies principais) |
| `--surface-inset` | `oklch(0.19 0.018 210)` | Elevação recuada (nested reads dentro de plates) |
| `--surface-scrim` | `oklch(0.13 0.015 210 / 0.72)` | Overlay / modais / dropdown |

### Accent (cyan/teal — "signal color")

| Token | OKLCH | Aproximado |
|---|---|---|
| `--signal-100` | `oklch(0.94 0.05 195)` | Texto sobre accent forte |
| `--signal-300` | `oklch(0.82 0.13 195)` | Hover / links |
| `--signal-500` | `oklch(0.73 0.16 195)` | Accent primário (`#22d3ee`-ish) |
| `--signal-700` | `oklch(0.55 0.11 195)` | Pressed / borda ativa |
| `--signal-900` | `oklch(0.36 0.07 195)` | Fundo tintado |

### Status (função, não decoração)

| Papel | Token | Uso |
|---|---|---|
| Saudável / entregue | `--pulse-lush` — `oklch(0.72 0.16 155)` | Ping de dado novo, delivered, status ok |
| Atenção / quarentena | `--pulse-ember` — `oklch(0.76 0.15 65)` | Webhook em quarentena, falhas resolvíveis |
| Perda / dead | `--pulse-scar` — `oklch(0.65 0.20 20)` | Entrega dead, chargeback, erro terminal |

### Estratégia de cor

**Committed.** O signal cyan/teal carrega ~30% da superfície (barras, indicadores ativos, HUD elements). O restante são neutros escuros tintados. Status colors aparecem discretas na maior parte do tempo e ficam saturadas só quando há algo pra olhar (webhook quarentenou agora, delivery morreu). Nunca 3 acentos disputando atenção.

## Tipografia

- **Space Grotesk** (variável, já carregada): rótulos, títulos, mensagens, tudo que é "voz humana". Peso 400 corpo, 500 medium para eyebrows/labels, 600 pra números que não precisam de mono.
- **JetBrains Mono** (nova, adicionar): IDs, timestamps, deltas numéricos, valores brutos, `event_id`, transaction_id, código de instalação. Voz de máquina. Peso 400/500.
- **Escala:** ratio 1.333 mínimo entre passos. `10px` (eyebrow uppercase, tracking 0.18em) → `12px` (body compacto) → `14px` (body) → `18px` (subtítulo) → `24px` (título de seção) → `36px` (número KPI grande).
- Largura de texto corrido cap em 65–75ch. Descrições de módulo, help text.

## Layout e ritmo

- Grid do módulo tracking: coluna lateral fixa 220px (menu de seções) + área principal fluida. Sem containers desnecessários.
- Espaçamento em passos de 4px, mas com ritmo variado: título → conteúdo tem `24px`, entre linhas de tabela `8px`, entre seções `48px`. Espaçamento uniforme é monotonia.
- **Zero card grid idêntico.** KPI row atual (6 tiles iguais) vira uma HUD strip variável: número mestre grande, satélites pequenos, delta como barra.
- Fundo animado do módulo: uma malha sutil de linhas de contorno (SVG) reagindo lentamente ao scroll/tempo, no `--surface-void`. Amplitude baixa, quase subliminar. Nunca compete com o conteúdo.

## Motion

Curva padrão: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart). Durações:

- Entrada de dado novo (delivery, order): `220ms`
- Hover reveal: `160ms`
- Transição de aba/estado: `280ms`
- Pulso de "sinal ao vivo" (dot piscando quando dado chega): `1200ms` loop, opacidade 0.6 → 1 → 0.6

Regras:
- Nunca animar `width`/`height`/`top`/`left`. Só `opacity`, `transform`, `filter`.
- Sem bounce, sem elastic.
- Movimento no fundo (malha) usa `transform` em SVG, não repaint. Prefers-reduced-motion desativa **completamente** o movimento ambiente; movimentos funcionais (pulso ao chegar dado) ficam mais curtos mas continuam.

## Componentes-chave (mudanças previstas em `/tracking`)

### KPI row (topo do Tracker)
- **Antes:** 6 cards idênticos: Visitas, Connect Rate, Checkouts, Compradores, Faturamento, Perda de dados.
- **Depois:** 2 tiers. Tier primário destaca 2 números (Compradores front, Faturamento) com escala grande + delta ao lado. Tier secundário é uma barra HUD contínua com os outros 4 sinais em unidades pequenas, cada um com pulso quando atualiza.

### Tabela de "Últimos webhooks"
- **Antes:** lista de linhas iguais, cada uma diz "Sem transação reconhecida · timestamp · quarantined".
- **Depois:** linha densa com timestamp mono à esquerda, evento em texto (badge de estado tintado, sem side-stripe), payload preview inline com expand, ação inline (replay). Cor de linha muda por estado, não por borda lateral.

### Mapa por país
- **Antes:** mapa mundi estático azul/cyan, legenda "Menos / Mais".
- **Depois:** mesmo mapa base, mas pings emitindo do país quando um PageView/Checkout/Sale acontece "ao vivo" (pulse anel expandindo). Toggle PageView/Checkout/Venda permanece.

### Diagnóstico "Saúde automática"
- **Antes:** 3 quadrados grandes verdes ("PostgreSQL ready", "Estrutura do banco ready", "Criptografia ready") + bloco cinza.
- **Depois:** painel HUD compacto com barra de sistemas na esquerda (uma linha por serviço, com dot pulsando conforme heartbeat), detalhe expansível à direita. Estado "warning" faz o dot piscar em ember, não muda o layout.

### Empty / loading
- Loading atual: `Loader2` spinning + "Carregando sinais…". OK, mantém, mas o spinner vira uma barra de "scan" horizontal fininha atravessando o container (mais radar, menos SaaS).
- Empty: uma linha de texto seca dizendo o que fazer, não um card com ilustração.

## Absolute bans (locais neste módulo)

- Nenhum `border-left` ou `border-right` colorido como accent. Se um estado precisa de destaque, muda a cor do fundo tintado ou o número na frente.
- Nenhum gradiente em texto (o painel atual tem alguns em botões, ficam; texto puro não).
- Glassmorphism só em overlays de menu/dropdown, nunca em cards de conteúdo.
- Sem "hero metric template" clichê SaaS.

## Componentes já existentes (do sistema atual, ficam)

`.hud-label`, `.hud-label-strong`, `.status-dot`, `.status-dot-cyan` — sobrevivem como primitivos. Serão complementados por novos: `.pulse`, `.signal-strip`, `.hud-panel`, `.mono-num`.

## AI slop test

Categoria = "dashboard de tracking de campanhas ads". Primeiro reflexo seria "dark blue + laranja/verde de status + card grid". Nosso design foge disso: **teal saturado como cor mestre (não azul), tipografia partida entre sans e mono (não uma só), HUD com movimento contextual (não card grid), status como pulso (não pill badge)**. Passa o teste de primeiro nível. Segundo nível — o "não-SaaS que virou terminal-cyberpunk clichê" — evitamos com: densidade real (não fake ASCII), Space Grotesk (não fonte monoespaçada pixel-perfect retrô), teal calmo (não neon rosa/verde saturado).
