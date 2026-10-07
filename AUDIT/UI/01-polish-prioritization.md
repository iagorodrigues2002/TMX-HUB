# Auditoria visual/UX cirúrgica — TMX HUB

Data: 2026-10-06  
Escopo: auditoria estática de `packages/web/src/app/` e `packages/web/src/components/`; sem execução do frontend.  
Critério: acessibilidade → estados de dados → navegação/responsividade → consistência do design system → polish.

## Resumo executivo

A pior ofensa é a navegação mobile truncar deliberadamente o menu nos cinco primeiros itens, deixando Ferramentas, Administração e Configurações sem rota visível para usuários elegíveis. O padrão mais recorrente é query com loading parcial, mas sem estado de erro: falhas aparecem como spinner infinito, “nenhum dado” ou KPIs zerados. Dashboard, ofertas, tracking, reembolsos, logs e UTMify Geral repetem esse risco. A segunda dívida é sistêmica: cores, tamanhos e superfícies usam dezenas de valores crus apesar de o projeto já possuir tokens semânticos. O maior ganho com menor risco é criar um estado compartilhado `DataState` (loading/empty/error/retry), corrigir o overflow do menu mobile e padronizar campos com `Label` + erro inline. A auditoria encontrou 16 offenses priorizadas: 9 altas, 6 médias e 1 baixa.

## 1. Inventário

### Rotas/páginas por palpite de uso

1. `/` — dashboard (`app/page.tsx`)
2. `/ofertas` — lista de ofertas (`app/ofertas/page.tsx`)
3. `/ofertas/[id]` — detalhe e métricas da oferta (`app/ofertas/[id]/page.tsx`)
4. `/tracking` — workspace de tracking (`app/tracking/page.tsx`)
5. `/reembolsos` — reembolsos e chargebacks (`app/reembolsos/page.tsx`)
6. `/recovery` — recovery (`app/recovery/page.tsx`)
7. `/utmify-geral` — tracking UTMify multi-oferta (`app/utmify-geral/page.tsx`)
8. `/logs` — atividade (`app/logs/page.tsx`)
9. `/contas-meta` — controle de contas (`app/contas-meta/page.tsx`)
10. `/tools` — catálogo de ferramentas (`app/tools/page.tsx`)
11. `/tools/cloner` — cloner (`app/tools/cloner/page.tsx`)
12. `/tools/cloner/jobs/[id]` — job do cloner (`app/tools/cloner/jobs/[id]/page.tsx`; possui `loading.tsx`)
13. `/tools/cloner/jobs/[id]/preview` — preview do cloner (`app/tools/cloner/jobs/[id]/preview/page.tsx`)
14. `/tools/funnel-clone` — funnel clone (`app/tools/funnel-clone/page.tsx`)
15. `/tools/funnel-clone/jobs/[id]` — job do funnel clone (`app/tools/funnel-clone/jobs/[id]/page.tsx`)
16. `/tools/vsl` — VSL downloader (`app/tools/vsl/page.tsx`)
17. `/tools/vsl/jobs/[id]` — job de VSL (`app/tools/vsl/jobs/[id]/page.tsx`)
18. `/tools/video-shield` — video shield (`app/tools/video-shield/page.tsx`)
19. `/tools/creative-studio` — creative studio (`app/tools/creative-studio/page.tsx`)
20. `/tools/digi-approval` — auditorias Digi (`app/tools/digi-approval/page.tsx`)
21. `/tools/digi-approval/[id]` — detalhe Digi (`app/tools/digi-approval/[id]/page.tsx`)
22. `/tools/cloaker-urls` — cloaker (`app/tools/cloaker-urls/page.tsx`)
23. `/tools/upsell-analyzer` — upsell analyzer (`app/tools/upsell-analyzer/page.tsx`)
24. `/tools/page-diff` — page diff (`app/tools/page-diff/page.tsx`)
25. `/tools/webhook-tester` — webhook tester (`app/tools/webhook-tester/page.tsx`)
26. `/admin` — administração (`app/admin/page.tsx`)
27. `/settings` — configurações (`app/settings/page.tsx`)
28. `/login` — login (`app/login/page.tsx`)
29. `/register` — cadastro (`app/register/page.tsx`)
30. `/help/tracking-vendepay` — ajuda VendePay (`app/help/tracking-vendepay/page.tsx`)
31. `/tracking/google-callback` — callback Google (`app/tracking/google-callback/page.tsx`)
32. `/info` — institucional (`app/info/page.tsx`)
33. `/privacy` — privacidade (`app/privacy/page.tsx`)
34. `/terms` — termos (`app/terms/page.tsx`)
35. `/debug` — debug (`app/debug/page.tsx`)

### Componentes-chave reutilizados

- Shell/navegação: `hub/hub-shell.tsx`, `hub/sidebar.tsx`, `hub/topbar.tsx`, `hub/user-menu.tsx`, `hub/micro-footer.tsx`.
- Métricas/cards: `dashboard/kpi-cards.tsx`, `ofertas/offer-card.tsx`, `tracking/tracker-kpi-row.tsx`, `hub/tool-card.tsx`.
- Listas/tabelas: `ofertas/offer-list.tsx`, `dashboard/offer-list.tsx`, `tracking/tracking-overview-dashboard.tsx`, `tracking/refunds-dashboard.tsx`, `shield/shield-jobs-history.tsx`, `digi/audit-list.tsx`.
- Forms/edição: `ofertas/offer-edit-dialog.tsx`, `ofertas/offer-member-picker.tsx`, `url-input-form.tsx`, `vsl/vsl-input-form.tsx`, `funnel/funnel-input-form.tsx`, `register/register-form.tsx`.
- Modais/primitivos: `ui/dialog.tsx`, `ui/select.tsx`, `ui/input.tsx`, `ui/button.tsx`, `ui/label.tsx`, `ui/tabs.tsx`.
- Tracking: `tracking/tracking-workspace.tsx`, `tracking/tracking-panel.tsx`, `tracking/tracking-advanced-center.tsx`, `tracking/tracking-live-console.tsx`, destinos Google/TikTok e health center.

## 2. Lista priorizada de offenses

### UI-001 — Menu mobile oculta rotas válidas

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/hub/sidebar.tsx:112-135`
- **Descrição:** a navegação móvel aplica `.slice(0, 5)` à lista autorizada. Em contas admin, Ferramentas, Administração e Configurações ficam fora do menu; em outras combinações, qualquer item depois do quinto desaparece.
- **Impacto no usuário:** funcionalidades existentes se tornam inalcançáveis no mobile sem digitar URL.
- **Fix proposto:** manter quatro destinos primários e adicionar um quinto item “Mais” que abre `Sheet`/drawer com todos os demais links autorizados. Preservar `aria-current`, foco inicial no título e retorno de foco ao fechar. Não mudar IA nem ordem do desktop.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-002 — Falha do dashboard vira spinner infinito

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/app/page.tsx:59-64,151-159`
- **Descrição:** a query não lê `isError`; o branch `summaryLoading || !summary` mantém spinner quando a requisição termina sem dados por erro.
- **Impacto no usuário:** indisponibilidade parece carregamento eterno, sem explicação ou recuperação.
- **Fix proposto:** distinguir `isLoading`, `isError` e sucesso. No erro, renderizar card compacto com mensagem humana e botão “Tentar novamente”; manter dados antigos visíveis em refetch e usar spinner apenas no botão. Aplicar `aria-live="polite"` ao status.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-003 — Tracking converte erro em empty state falso

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/tracking/tracking-overview-dashboard.tsx:31-35,83-92`
- **Descrição:** depois do loading, `!overview.data?.accounts.length` cobre tanto resposta vazia quanto query rejeitada; o usuário recebe “Nenhum pedido pago”.
- **Impacto no usuário:** uma falha operacional pode ser interpretada como ausência real de vendas.
- **Fix proposto:** inserir branch `overview.isError` antes do empty state, com mensagem, retry e preservação do filtro. Só mostrar “nenhum pedido” quando a resposta válida trouxer `accounts.length === 0`.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-004 — Reembolsos mostra zeros quando a API falha

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/tracking/refunds-dashboard.tsx:25-33,54-59`
- **Descrição:** `report.isError` e `offers.isError` são ignorados; os fallbacks `?? 0` transformam erro em KPIs financeiros zerados e selects vazios.
- **Impacto no usuário:** decisão financeira pode ser tomada sobre um dado falso, com risco maior que um simples defeito visual.
- **Fix proposto:** bloquear o corpo de KPIs em erro inicial e renderizar estado de erro com retry; em refetch, manter os últimos dados com indicador “Atualizando”. Tratar erro da lista de ofertas dentro do filtro, sem invalidar o relatório já carregado.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-005 — UTMify Geral nasce com dados falsos e ações sem estado de carga/erro

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/utmify/utmify-global-center.tsx:12-23,48-68`
- **Descrição:** antes da query, KPIs exibem `0`/`100%`, o formulário exibe defaults editáveis e não há branch de loading/error; uma falha é visualmente idêntica a uma configuração nova.
- **Impacto no usuário:** o operador pode acreditar que a integração está saudável ou tentar salvar sobre um estado que nunca foi carregado.
- **Fix proposto:** reservar skeleton para KPIs e formulário, renderizar erro com retry, e habilitar edição apenas após sucesso da configuração. Derivar `deliveryRate` somente de dados válidos; usar “—” quando não houver amostra.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-006 — Queries de ofertas podem travar ou esvaziar a tela sem diagnóstico

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/ofertas/offer-list.tsx:51-66,125-146`; `packages/web/src/app/ofertas/[id]/page.tsx:128-163,446-456`
- **Descrição:** lista, resumo, detalhe, snapshots e intraday não possuem tratamento uniforme de erro; `!summary` mantém spinner e `!data` vira “Sem dados”.
- **Impacto no usuário:** a principal área do produto não distingue oferta vazia, permissão, indisponibilidade e falha de integração.
- **Fix proposto:** adotar um componente comum de estado por query e mensagens específicas por origem. Mostrar retry local por seção para snapshots/intraday sem derrubar o cabeçalho da oferta; no resumo, nunca usar ausência de `data` como sinônimo de loading.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-007 — Inputs críticos da UTMify não têm label acessível nem erro inline

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/utmify/utmify-global-center.tsx:60-68`
- **Descrição:** nome, token, Pixel ID e endpoint usam apenas placeholder; validação do Pixel ID apenas desabilita o botão, sem explicar o motivo.
- **Impacto no usuário:** leitores de tela perdem o nome do campo após digitação e usuários não entendem por que não conseguem salvar.
- **Fix proposto:** trocar por `Label` + `Input` com `id`, texto auxiliar e `aria-describedby`. Exibir erro inline do Pixel ID e campos obrigatórios, mantendo o toast apenas para erro de submissão. Preservar o layout em duas colunas.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-008 — Editor fica sem controles laterais no mobile

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/components/editor/editor-shell.tsx:60-78`
- **Descrição:** painéis esquerdo e direito usam `hidden ... lg:block`; o próprio TODO confirma que o fallback mobile ainda não existe.
- **Impacto no usuário:** edição/inspeção fica incompleta abaixo de `lg`, não apenas menos confortável.
- **Fix proposto:** expor dois botões no toolbar mobile que abrem cada painel em `Dialog`/`Sheet` Radix. Reusar o conteúdo existente, com foco, ESC e retorno de foco; não duplicar estado nem lógica do editor.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-009 — Dashboard sem empty state de contas

- **Severidade:** ALTA
- **Arquivo:** `packages/web/src/app/page.tsx:151-160`
- **Descrição:** uma resposta válida com `summary.accounts = []` renderiza apenas um contêiner vazio, sem orientação.
- **Impacto no usuário:** primeira experiência parece quebrada e não aponta a criação/configuração de oferta.
- **Fix proposto:** adicionar empty state contextual: título, causa provável e CTA para `/ofertas` quando permitido. Diferenciar “nenhuma oferta” de “sem dados no período” se o payload permitir; caso contrário, usar texto neutro e não inventar diagnóstico.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-010 — Números de tracking alinhados à esquerda

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/components/tracking/tracking-overview-dashboard.tsx:213-260`; `packages/web/src/components/tracking/refunds-dashboard.tsx:70-72`
- **Descrição:** cabeçalhos e células de pedidos, moeda, taxas e totais herdam `text-left`; `mono-num` resolve largura do glifo, mas não alinhamento de coluna.
- **Impacto no usuário:** comparação vertical de valores e varredura de anomalias ficam mais lentas.
- **Fix proposto:** aplicar `text-right tabular-nums` em todos os `th`/`td` quantitativos, mantendo nomes/datas à esquerda. Criar uma pequena variante de célula numérica para evitar divergência entre as tabelas.
- **Esforço:** 30min
- **Risco de regressão:** baixo

### UI-011 — Paleta semântica duplicada (red/rose, slate/zinc/stone)

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/components/tracking/tracking-overview-dashboard.tsx:248-257`; `packages/web/src/components/tracking/refunds-dashboard.tsx:55-72`; `packages/web/src/app/info/page.tsx:65-71`
- **Descrição:** o censo encontrou `cyan` 635, `emerald` 240, `amber` 203, `rose` 114, `red` 87, `zinc` 24, `slate` 18, `stone` 7 e `orange` 4 ocorrências. Status destrutivo alterna red/rose e neutros alternam três famílias.
- **Impacto no usuário:** estados equivalentes mudam de tom/contraste entre telas e o tema fica mais caro de manter.
- **Fix proposto:** mapear success/warning/danger/info e quatro níveis de texto para os tokens existentes; migrar red/rose para `danger` e slate/zinc/stone para níveis semânticos de foreground. Fazer por componente, com revisão de contraste, sem troca global cega.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-012 — Valores arbitrários contornam tokens já existentes

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/app/globals.css:8-57`; maiores concentrações em `tracking-advanced-center.tsx` (17), `app/ofertas/[id]/page.tsx` (16), `tracking/refunds-dashboard.tsx` (10), `meta-accounts-control.tsx` (8), `editor/edit-panel.tsx` (6)
- **Descrição:** foram encontrados 121 usos do recorte auditado de hex/tamanho/radius arbitrário em 46 arquivos. Exemplos: `bg-[#071720]`, `bg-[#04101A]`, `text-[#031516]`, `inset-[7px]`, apesar de tokens `bg-base`, `bg-elevated`, `accent-on` e raios definidos.
- **Impacto no usuário:** superfícies quase iguais parecem desalinhadas e mudanças de tema não propagam.
- **Fix proposto:** começar pelas cores exatas já tokenizadas (`#04101A`, `#071720`, `#031516`) e substituí-las por utilitários semânticos. Manter larguras realmente contextuais; extrair apenas valores repetidos, evitando transformar toda medida única em token.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-013 — Escala tipográfica fragmentada e texto crítico abaixo de 12 px

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/app/page.tsx:73-86`; `packages/web/src/components/hub/topbar.tsx:41-61`; `packages/web/src/app/ofertas/[id]/page.tsx:481-491,1063-1066`
- **Descrição:** 30 arquivos usam cinco ou mais tamanhos distintos; os piores são `info/page.tsx` (11), `app/page.tsx` (10), `tracking-advanced-center.tsx` e quatro outros (9). Há labels/tabelas a 9–10 px ao lado de 11/12/13/14 px.
- **Impacto no usuário:** hierarquia perde previsibilidade e metadados ficam difíceis de ler, sobretudo em telas densas.
- **Fix proposto:** reduzir a UI de produto a uma escala curta (10 somente para HUD decorativo, 12 meta/tabela, 14 corpo/controle, 16 subtítulo, 24/32 título). Elevar cabeçalhos de tabela de 9 px para 10–12 px e usar peso/cor, não novos tamanhos, para hierarquia.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-014 — Breadcrumb é texto, não navegação, e some no mobile

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/components/hub/topbar.tsx:58-76`; ausente no dashboard em `packages/web/src/app/page.tsx:69`
- **Descrição:** segmentos são `<span>`, portanto “OFERTAS › nome” não permite voltar; o nav inteiro usa `hidden ... md:flex`.
- **Impacto no usuário:** rotas aninhadas perdem orientação e retorno rápido, especialmente em jobs e detalhe de oferta.
- **Fix proposto:** aceitar objetos `{label, href?}` e renderizar ancestrais como `Link`, mantendo o último como texto com `aria-current`. No mobile, mostrar apenas ancestral imediato + atual, com truncamento, em vez de ocultar tudo.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-015 — Formulários usam validação nativa/toast de forma inconsistente

- **Severidade:** MÉDIA
- **Arquivo:** `packages/web/src/components/settings/settings-client.tsx:443-460`; `packages/web/src/components/ofertas/offer-list.tsx:77-112`; `packages/web/src/components/utmify/utmify-global-center.tsx:63-68`
- **Descrição:** a árvore praticamente não usa `react-hook-form`; erros aparecem por `required`, botão desabilitado ou toast, sem contrato comum de mensagem junto ao campo.
- **Impacto no usuário:** correção de erro exige tentativa e descoberta; leitores de tela não recebem associação consistente.
- **Fix proposto:** criar um padrão leve `FormField`/`FieldError` compatível com RHF, mas aplicável também a estado local. Migrar primeiro senha, criação de oferta e UTMify; usar `aria-invalid`, `aria-describedby` e uma mensagem por campo.
- **Esforço:** 2h
- **Risco de regressão:** médio

### UI-016 — Lixo de desenvolvimento permanece no frontend

- **Severidade:** BAIXA
- **Arquivo:** `packages/web/src/components/editor/editor-shell.tsx:78`; `packages/web/src/components/editor/forest-panel.tsx:17`; `packages/web/src/components/shield/shield-processor.tsx:263`
- **Descrição:** há dois TODOs e um `console.error` de runtime no recorte auditado. Não foi encontrado `Lorem ipsum`.
- **Impacto no usuário:** baixo visualmente, mas console ruidoso e dívida sem rastreamento reduzem a qualidade operacional.
- **Fix proposto:** converter TODOs em issues rastreáveis (o fallback mobile já é UI-008) e encaminhar falha de ZIP ao logger/telemetria do produto, mantendo o toast para o usuário. Remover comentário depois de existir rastreamento.
- **Esforço:** 30min
- **Risco de regressão:** baixo

## 3. Auditoria por dimensão

- **A — Tokens:** 121 ocorrências no recorte de hex/tamanho/radius arbitrário, em 46 arquivos. Maiores focos: `tracking-advanced-center.tsx` 17; `app/ofertas/[id]/page.tsx` 16; `tracking/refunds-dashboard.tsx` 10; `meta-accounts-control.tsx` 8; `editor/edit-panel.tsx` 6; `tracking-workspace.tsx`, `recovery-center.tsx` e `app/info/page.tsx` 5 cada. Espaçamento arbitrário explícito foi raro: `ui/dialog.tsx:37` e `hub/sidebar.tsx:114`.
- **B — Tipografia:** 30 arquivos têm 5+ tamanhos; extremos listados em UI-013. Mistura recorrente de `text-[9px]`, `[10px]`, `[11px]`, `[12px]`, `[13px]`, `[14px]`, `text-xs` e `text-sm` no mesmo contexto.
- **C — Espaçamento:** não há explosão de `p-[Npx]`/`m-[Npx]`/`gap-[Npx]`; o principal desvio é tamanho/posição arbitrária e densidade inconsistente entre cards (`p-3` a `p-8`).
- **D — Cores:** famílias duplicadas confirmadas: red+rose para perigo e slate+zinc+stone para neutros; cyan/emerald/amber dominam sem abstração semântica completa.
- **E — Empty:** dashboard de contas não trata array vazio; UTMify confunde ausência pré-load com vazio; tracking overview possui empty, mas também o usa para erro. Logs, histórico Shield e listas principais têm empty explícito.
- **F — Loading:** spinners existem em boa parte das telas; faltam estados reservados em UTMify Geral. Dashboard/ofertas podem manter spinner indefinidamente ao falhar. Apenas a rota do job do cloner possui `loading.tsx` de App Router.
- **G — Erro:** ignorado em dashboard, logs, ofertas, tracking overview, reembolsos, UTMify, Digi list/detail e diversas subqueries de tracking; settings users/invites e `JobStatus` são bons precedentes locais.
- **H — Forms:** labels são razoáveis em auth/settings, mas há grupos importantes baseados em placeholder e quase nenhum erro inline padronizado; RHF não é usado na superfície auditada.
- **I — Tabelas:** oferta detalhada alinha métricas à direita corretamente; overview de tracking e reembolsos não. Tabelas largas, em geral, possuem `overflow-x-auto`.
- **J — Modais/sheets:** `ui/dialog.tsx:28-47` garante overlay, scroll, close visível e Radix cuida do foco. Não há primitive Sheet; isso bloqueia um fallback elegante para editor/menu mobile. Tamanhos variam por override, mas sem ofensa crítica adicional.
- **K — Acessibilidade:** skip link e foco global existem; botões icon-only inspecionados têm labels em oferta/user menu. A maior falha encontrada são inputs sem label na UTMify e texto de 9–10 px com baixa opacidade. Contraste exato não foi medido por não rodar/renderizar o front.
- **L — Navegação:** breadcrumb existe em 20 páginas HubShell, mas é não interativo e some antes de `md`; páginas institucionais/auth não usam o shell por desenho.
- **M — Responsividade:** tabelas largas auditadas usam scroll; sidebar vira bottom nav, mas o corte em cinco itens quebra alcance. Editor oculta painéis sem fallback.
- **N — Microinterações:** cards clicáveis principais usam `group`, hover e transition. Não foram encontrados `<div onClick>`/`<article onClick>` no recorte; o risco maior é `transition-all` pontual, não ausência sistêmica de hover.
- **O — Dev:** dois TODOs e um `console.error`; nenhum Lorem ipsum encontrado.

## Dívida de design system

- Extrair `DataState` com variantes loading/empty/error/retry e regra explícita para preservar stale data durante refetch.
- Consolidar tokens semânticos `surface`, `foreground` (4 níveis), `success`, `warning`, `danger` e proibir red/rose ou slate/zinc/stone diretos fora da camada de tokens.
- Definir escala tipográfica curta para produto denso e uma variante oficial de tabela (`numeric`, `meta`, `header`) com `tabular-nums` e alinhamento.
- Criar `FormField` + `FieldError` com contrato de label, ajuda, `aria-invalid` e `aria-describedby`, independente de RHF ou estado local.
- Adicionar primitive `Sheet`/drawer e padrão de navegação mobile “4 destinos + Mais”, reutilizável também no editor.

## Limites da auditoria

Análise exclusivamente estática, sem `pnpm dev`, build, screenshots ou medição automatizada de contraste. Não foram validados estados que dependem de payload real, ordem de foco em browser ou comportamento visual por breakpoint. Nenhum componente, token ou configuração foi alterado.
