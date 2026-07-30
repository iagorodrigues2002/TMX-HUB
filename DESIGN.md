# DESIGN.md — TMX HUB

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
