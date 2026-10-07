# Auditoria de responsividade — TMX HUB

## Resumo

A auditoria estática encontrou **14 findings: 7 de severidade alta, 6 média e 1 baixa** na faixa de 768–1200 px. O padrão dominante é a combinação de sidebar desktop de 240 px ativada em 1024 px com grids que também adensam em `md`/`lg`; a largura real do conteúdo cai para aproximadamente 752 px, mas os componentes continuam reagindo à largura total da janela. Há ainda painéis com `overflow-hidden` que cortam números, gráficos e barras, e sete tabelas cujo wrapper de scroll existe, porém não entra em ação porque a tabela não tem `min-width`. As áreas mais afetadas são shell/editor, dashboard/KPIs, ofertas e tracking/recovery.

Escopo: leitura de `packages/web/src/`, breakpoints Tailwind informados e inferência de layout. Não houve automação visual porque `overclock_browser_act` não oferece controle de viewport; nenhum arquivo de aplicação foi alterado.

## Ranking executivo

### ALTA — dados cortando ou área operacional impraticável

1. RSP-01 — sidebar expandida em 1024 px reduz o conteúdo sem coordenar os breakpoints internos.
2. RSP-02 — editor abre três painéis fixos (280 + conteúdo + 360 px) cedo demais.
3. RSP-03 — KPIs financeiros entram em quatro colunas em 768 px e escondem valores.
4. RSP-04 — tracking força quatro/seis KPIs em 1080 px dentro de uma área muito menor.
5. RSP-05 — Recovery força cinco e sete KPIs em 1024 px; moedas são cortadas.
6. RSP-06 — gráfico diário de reembolsos corta as últimas datas com `overflow-hidden`.
7. RSP-07 — cinco tabelas da oferta têm scroll externo, mas sem largura mínima o conteúdo é esmagado.

### MÉDIA — visual torto, perda de contexto ou operação desconfortável

8. RSP-08 — tabela de jobs do Video Shield comprime oito colunas.
9. RSP-09 — tabela do Upsell comprime produto/ofertas e três taxas.
10. RSP-10 — funil do Live Console mantém quatro colunas e números grandes dentro de card recortado.
11. RSP-11 — topbar pode consumir todo o breadcrumb com busca de 180 px e ações customizadas.
12. RSP-12 — cabeçalho da oferta não permite wrap estrutural para nome/ID longos.
13. RSP-13 — linhas de usuários/convites não protegem e-mail/nome longo contra os botões laterais.

### BAIXA — polish / densidade

14. RSP-14 — cards de dashboard e ferramentas ativam três colunas em `lg`, apesar da sidebar.

## Findings por área

### Shell

#### RSP-01 — ALTA — breakpoint da sidebar conflita com a largura útil

- **Local:** `packages/web/src/components/hub/sidebar.tsx:241-243`; `packages/web/src/components/hub/sidebar.tsx:270-271`; `packages/web/src/components/hub/topbar.tsx:162`; `packages/web/src/components/hub/topbar.tsx:172`; `packages/web/src/components/hub/hub-shell.tsx:22-28`.
- **Quebra:** 1024–1200 px. Em `lg`, a navegação móvel desaparece e a sidebar desktop nasce com `w-60` (240 px). O estado inicial é expandido (`false`) e só há restauração de `localStorage`, sem auto-colapso por viewport. Assim, uma janela de 1024 px entrega cerca de 752 px ao conteúdo (`1024 - 240 - 32` de padding), enquanto os filhos continuam vendo `lg` como ativo.
- **Impacto:** é a causa sistêmica dos cards/KPIs que “cabem pelo breakpoint” mas não cabem no container; o `overflow-x-hidden` de `hub-shell.tsx:78` torna o excesso invisível.
- **Fix proposto:** manter o drawer até `xl`: trocar `lg:flex` por `xl:flex` na sidebar; `lg:hidden` por `xl:hidden` no dialog e no botão Menu; `lg:inline-flex` por `xl:inline-flex` no toggle desktop. Alternativa com sidebar visível: no intervalo usar largura compacta e esconder rótulos com `w-16 xl:w-60`, `hidden xl:inline`, mas isso exige alinhar o estado React com o modo visual.

#### RSP-02 — ALTA — editor de três painéis fica impraticável em largura intermediária

- **Local:** `packages/web/src/components/editor/editor-shell.tsx:28`; `packages/web/src/components/editor/editor-shell.tsx:85-90`.
- **Quebra:** 1024–1200 px. `DESKTOP_EDITOR_QUERY` muda em 1024 px e monta `grid-cols-[280px_1fr_360px]`. Com sidebar expandida, sobram ~144 px para o preview em 1024 px e ~320 px em 1200 px; as laterais usam `overflow-hidden`, então o conteúdo é recortado.
- **Impacto:** área central quase desaparece e os painéis de estrutura/edição perdem dados no uso normal.
- **Fix proposto:** só ativar o layout de três painéis em 1440 px: `hidden min-[1440px]:grid min-[1440px]:grid-cols-[280px_minmax(0,1fr)_360px]` para o desktop e `flex min-[1440px]:hidden` para o layout com dialogs. Se mantido o media query JS, alterar para `(min-width: 1440px)`.

#### RSP-11 — MÉDIA — topbar fica sem espaço para breadcrumb com ações customizadas

- **Local:** `packages/web/src/components/hub/topbar.tsx:208-233`; `packages/web/src/components/editor/editor-shell.tsx:56-68`.
- **Quebra:** 768–1023 px, sobretudo no editor. A busca passa a `sm:min-w-[180px]`; o slot direito é `shrink-0` e pode incluir status, Origem, Gerar, privacidade, tema e usuário. O breadcrumb possui `min-w-0` e trunca corretamente, mas pode ser reduzido a quase zero; com estados longos como “Baixando assets”, as ações encostam/cortam no limite da janela.
- **Impacto:** o contexto da página some e os controles da direita ficam excessivamente densos.
- **Fix proposto:** manter a busca icon-only até `xl`: no botão usar `sm:w-9 sm:min-w-0 xl:w-auto xl:min-w-[180px]`; nos textos/kbd trocar `sm:inline` por `xl:inline`. No `topbarRight` do editor, esconder rótulos secundários até `xl` (`hidden xl:inline`) ou agrupar Origem/Gerar em menu de overflow.

### Dashboard

#### RSP-03 — ALTA — KPIs financeiros em quatro colunas cortam valores

- **Local:** `packages/web/src/components/dashboard/kpi-cards.tsx:49`; `packages/web/src/components/ui/kpi.tsx:68-87`; `packages/web/src/app/globals.css:456-460`; consumidores em `packages/web/src/app/page.tsx:127-131` e `packages/web/src/app/ofertas/[id]/page.tsx:464`.
- **Quebra:** 768–1279 px; mais forte em 1024–1200 px com sidebar. `md:grid-cols-4` cria cards de ~175 px em 768 px e ~177 px dentro do shell de 1024 px. O valor pode chegar a 28 px, enquanto `.tmx-kpi-card` aplica `overflow: hidden`; valores monetários reais (`R$ 1.234.567,89`) ficam cortados.
- **Impacto:** faturamento, investimento, CPA e outras métricas perdem dígitos — dado de negócio incorreto visualmente.
- **Fix proposto:** trocar por `grid grid-cols-2 gap-3 xl:grid-cols-4`. Como defesa, adicionar `min-w-0 break-words text-[clamp(1rem,2.2vw,1.75rem)]` ao valor em `Kpi` ou remover `overflow-hidden` apenas do conteúdo textual (`overflow-visible` no bloco interno).

#### RSP-14 — BAIXA — cards gerais entram em três colunas cedo demais

- **Local:** `packages/web/src/app/page.tsx:163`; `packages/web/src/app/page.tsx:229`; `packages/web/src/app/tools/page.tsx:28`.
- **Quebra:** 1024–1200 px. `lg:grid-cols-3` reage ao viewport, não aos ~752–928 px disponíveis depois da sidebar. Os cards ainda funcionam, mas títulos, badges, métricas e descrições quebram em muitas linhas.
- **Impacto:** densidade e alturas irregulares; sem perda funcional imediata.
- **Fix proposto:** trocar `lg:grid-cols-3` por `xl:grid-cols-3` nos três grids, mantendo `md:grid-cols-2` no intervalo.

### Ofertas

#### RSP-07 — ALTA — wrappers de scroll existem, mas cinco tabelas não têm largura mínima

- **Local:** `packages/web/src/app/ofertas/[id]/page.tsx:491-492` (Anúncios); `:555-556` (Série diária); `:614-615` (Adsets); `:954-955` (desempenho intraday); `:1055-1056` (comparação de janelas).
- **Quebra:** 768–1200 px. Todos os wrappers têm `overflow-x-auto`, porém as tabelas são apenas `w-full`. O algoritmo de layout comprime 7–9 colunas para a largura do card; células monetárias, cabeçalhos e nomes quebram linha em vez de criar overflow rolável. O efeito é especialmente forte com sidebar aberta.
- **Impacto:** tabelas de dados reais tornam-se visualmente truncadas/empilhadas, e o scroll esperado não aparece.
- **Fix proposto:** adicionar largura mínima à própria tabela: `min-w-[900px]` em Anúncios e intraday; `min-w-[860px]` em Série diária; `min-w-[760px]` em Adsets; `min-w-[980px]` na comparação de janelas. Preservar os wrappers `overflow-x-auto` existentes.

#### RSP-12 — MÉDIA — nome e ID longos disputam espaço com “Editar oferta”

- **Local:** `packages/web/src/app/ofertas/[id]/page.tsx:333-350`.
- **Quebra:** 768–900 px ou qualquer largura com nome/`dashboardId` longo. O header usa `flex` sem `flex-wrap`; o bloco de texto não tem `min-w-0`, o botão não encolhe por causa de `whitespace-nowrap`, e o shell oculta overflow horizontal.
- **Impacto:** nome/ID pode avançar por baixo do botão ou ser cortado na direita.
- **Fix proposto:** no header usar `flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between`; no bloco textual, `min-w-0 flex-1`; no `h1`, `break-words`; no parágrafo do dashboard, `break-all`.

### Tracking e Recovery

#### RSP-04 — ALTA — KPIs de tracking forçam até seis colunas em 1080 px

- **Local:** `packages/web/src/app/globals.css:914-935`; `packages/web/src/components/tracking/tracking-overview-dashboard.tsx:120-194`; `packages/web/src/components/tracking/tracker-kpi-row.tsx:135-236`.
- **Quebra:** 1080–1200 px. O CSS global usa `@media (min-width: 1080px)` para quatro colunas e, com `.tmx-kpi-tier2-six`, seis colunas. Com sidebar de 240 px, o painel tem aproximadamente 808–928 px antes de paddings; seis células ficam com ~120–145 px, embora tenham 32 px de padding e valores de 22 px. Rótulos como “Taxa de reembolso/chargeback” e valores monetários estouram; `.tmx-kpi-hero` também usa `overflow: hidden`.
- **Impacto:** números financeiros e labels do funil/overview ficam cortados no intervalo reportado.
- **Fix proposto:** nos dois elementos de seis métricas adicionar `!grid-cols-2 2xl:!grid-cols-6`; para os tiers comuns, `!grid-cols-2 xl:!grid-cols-4`. Solução estrutural preferível: mover o media query de 1080 para 1440/1536 ou usar container queries.

#### RSP-05 — ALTA — Recovery usa cinco/sete colunas em `lg`

- **Local:** `packages/web/src/components/recovery/recovery-center.tsx:230-245`; `packages/web/src/components/recovery/recovery-center.tsx:701-720`; clipping herdado de `packages/web/src/app/globals.css:456-460`.
- **Quebra:** 1024–1200 px. O primeiro grid muda para cinco colunas e o segundo para sete em `lg`. No shell expandido, o card de sete colunas pode ter menos de 100 px antes do padding; “Valor recuperado” e moedas são cortados pela classe `.tmx-kpi-card`/pelas bordas do grid.
- **Impacto:** métricas de receita e conversão de e-mail perdem parte do valor.
- **Fix proposto:** primeiro grid: `grid grid-cols-2 gap-3 xl:grid-cols-5`; segundo: `grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-7`. Nos valores, adicionar `min-w-0 break-words text-base xl:text-lg`.

#### RSP-06 — ALTA — gráfico diário de reembolso corta as últimas datas

- **Local:** `packages/web/src/components/tracking/refunds-dashboard.tsx:439-488`, especialmente `overflow-hidden` em `:439` e `min-w-5` por barra em `:448`.
- **Quebra:** 768–1200 px com períodos de ~30 dias ou maiores. Cada barra exige ao menos 20 px mais gap; 30 dias passam de 770 px, mas o card útil tem ~650–700 px e o wrapper descarta o excesso com `overflow-hidden`.
- **Impacto:** dias mais à direita desaparecem; o usuário interpreta uma série incompleta.
- **Fix proposto:** trocar o wrapper por `mt-7 overflow-x-auto pb-2`; na faixa das barras adicionar `min-w-[780px]` (ou `min-w-max`) e manter `h-60`. Se a janela puder exceder 30 dias, calcular largura por quantidade ou agrupar pontos.

#### RSP-10 — MÉDIA — funil visual mantém quatro colunas dentro de card recortado

- **Local:** `packages/web/src/components/tracking/tracking-live-console.tsx:456-520`; cards repetidos em `:522-550`.
- **Quebra:** 768–1100 px e com números reais longos. O wrapper é `overflow-hidden`; cabeçalhos e resultados usam `grid-cols-4`, e os resultados sobem para `md:text-3xl`. Contagens de muitos dígitos excedem a célula, especialmente quando a sidebar está aberta.
- **Impacto:** valores de Visita/Checkout/Pedido/Comprador podem perder dígitos; a segunda fileira replica a mesma densidade em `md:grid-cols-4`.
- **Fix proposto:** no funil usar um filho `min-w-[640px]` e trocar o wrapper para `overflow-x-auto`; como alternativa, aplicar `text-base sm:text-xl xl:text-3xl break-words` nos valores. Na fileira inferior, trocar `md:grid-cols-4` por `grid-cols-2 xl:grid-cols-4`.

### Admin e formulários

#### RSP-13 — MÉDIA — identidades longas não encolhem antes das ações

- **Local:** `packages/web/src/components/settings/users-section.tsx:161-217`, sobretudo e-mail em `:192`; `packages/web/src/components/settings/invites-section.tsx:308-353`, sobretudo identidade/badges em `:311-331`.
- **Quebra:** 768–900 px e dados com e-mail/nome longo. A coluna principal tem `min-w-0`, mas o texto não recebe `truncate`/`break-all`; no convite, a linha de identidade é `flex` sem wrap enquanto Copiar/Revogar permanecem `shrink-0`.
- **Impacto:** identificadores avançam contra os botões ou são cortados pelo `.glass-card`/shell.
- **Fix proposto:** usuários: adicionar `truncate` ou `break-all` ao e-mail. Convites: usar `flex flex-wrap items-center gap-2`; no `<p>` de identidade, `min-w-0 flex-1 truncate`; no layout externo, `flex-col sm:flex-row`; nas ações, `w-full flex-row sm:w-auto sm:flex-col`.

Os formulários principais de criação/edição de oferta, configurações e senha fazem reflow aceitável: grids começam em uma coluna e sobem para duas/três, e `DialogFooter` empilha botões abaixo de `sm`. Não foi encontrado dialog/sheet/drawer com largura fixa superior ao viewport.

### Ferramentas

#### RSP-08 — MÉDIA — tabela de jobs do Video Shield comprime oito colunas

- **Local:** `packages/web/src/components/shield/shield-jobs-history.tsx:264-305`.
- **Quebra:** 768–1200 px. O wrapper tem `overflow-x-auto`, mas a tabela é apenas `w-full`; oito colunas (status, arquivo, nicho, compressão, tamanho, data e ações) são comprimidas. A célula de arquivo usa `truncate`, porém sem largura mínima estável da tabela.
- **Impacto:** status/metadados ficam apertados e ações dominam a largura disponível.
- **Fix proposto:** adicionar `min-w-[900px]` à tabela (`w-full min-w-[900px] text-[12px]`).

#### RSP-09 — MÉDIA — tabela de resultados do Upsell não aciona scroll

- **Local:** `packages/web/src/components/upsell/upsell-analyzer.tsx:333-367`.
- **Quebra:** 768–900 px. O wrapper permite scroll, mas a tabela não tem `min-width`; a coluna “Produto · Ofertas” cede espaço às três taxas e quebra excessivamente.
- **Impacto:** leitura comparativa fica torta, embora ainda utilizável.
- **Fix proposto:** adicionar `min-w-[640px]` à tabela; na coluna textual, `min-w-64` ou `max-w-md break-words`.

## Verificações que passaram

- **Tabelas:** foram localizadas 14 ocorrências de `<table>` e **14/14** estão dentro de `overflow-x-auto`. O defeito remanescente é largura mínima ausente em sete delas (RSP-07/08/09), não ausência do wrapper.
- **Dialogs:** `packages/web/src/components/ui/dialog.tsx:37` limita a largura a `calc(100% - 1rem)` e a altura ao viewport; `DialogFooter` empilha em telas menores (`:57-61`). `OfferEditDialog`, command palette, menu do usuário e dialogs do editor herdam essa proteção.
- **Sidebar móvel:** `packages/web/src/components/hub/sidebar.tsx:270-276` usa `min(88vw, 360px)`, altura dinâmica e scroll vertical. O problema é o momento da troca para desktop, não a largura do drawer.
- **Breadcrumb:** `packages/web/src/components/hub/topbar.tsx:98-138` usa `min-w-0` e `truncate`; texto longo não cria overflow próprio. Pode, porém, perder quase todo o espaço por pressão das ações (RSP-11).
- **Offer switcher:** `packages/web/src/components/hub/offer-context-switcher.tsx:118-139` continua visível como ícone abaixo de `sm` e como controle limitado a `min(30vw, 240px)` acima de `sm`; `SelectTrigger` aplica `line-clamp-1`. Não há evidência estática de sumiço em 768–1200 px.
- **Tracking refatorado:** as seções `overview`, `finance`, `diagnostics`, `destinations` e `capture` são roteadores leves; o risco está concentrado nos componentes compartilhados `tracking-overview-dashboard`, `tracker-kpi-row`, `tracking-live-console` e no CSS de tiers.

## Ordem sugerida de correção

1. Ajustar o breakpoint da sidebar (RSP-01) e do editor (RSP-02).
2. Corrigir todos os grids de KPI que ativam colunas por viewport (RSP-03/04/05).
3. Remover cortes explícitos em gráficos e garantir largura mínima nas tabelas (RSP-06/07/08/09/10).
4. Endurecer topbar e textos longos (RSP-11/12/13).
5. Adiar três colunas de cards para `xl` (RSP-14).
