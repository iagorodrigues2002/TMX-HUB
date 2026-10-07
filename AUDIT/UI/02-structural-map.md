# Mapa estrutural atual e blueprint de IA — TMX HUB

Data do snapshot: 2026-10-06. Escopo verificado: `packages/web/src/app`, `packages/web/src/components`, `packages/web/src/lib/api-client.ts` e `packages/web/public`. Contagem: **35 rotas `page.tsx`**, das quais **29 superfícies funcionais** e **6 aliases/rotas desativadas que só redirecionam**.

## 1. Inventário de rotas/páginas

Legenda de “nome no menu”: `—` significa que a rota não tem entrada direta na sidebar atual.

| Path | Nome no menu atual | Componente de topo | Finalidade atual |
|---|---|---|---|
| `/` | Visão geral | `HubLandingPage` + `HubShell` | Dashboard consolidado por conta/oferta, KPIs, atalhos de ofertas e catálogo resumido de ferramentas (`packages/web/src/app/page.tsx:53`). |
| `/admin` | Administração | `AdminDashboard` | Visão administrativa, usuários, convites, atividade e UTMify Geral em abas (`packages/web/src/app/admin/page.tsx:6`; `packages/web/src/components/admin/admin-dashboard.tsx:86`). |
| `/contas-meta` | Controle de contas | `MetaAccountsControl` | Meta Control: dashboards Meta, contas/campanhas, associação a ofertas e alerta Pushcut (`packages/web/src/app/contas-meta/page.tsx:9`; `packages/web/src/components/meta-control/meta-accounts-control.tsx:83`). |
| `/debug` | — | `DebugPage` inline | Diagnóstico técnico de browser/API/CORS, fora do `HubShell` (`packages/web/src/app/debug/page.tsx:16`). |
| `/help/tracking-vendepay` | — | `redirect` | Alias legado; redireciona para `/tracking` (`packages/web/src/app/help/tracking-vendepay/page.tsx:3`). |
| `/info` | — | `InfoPage` inline | Página pública/institucional de apresentação do produto (`packages/web/src/app/info/page.tsx:47`). |
| `/login` | — | `LoginForm` | Autenticação por e-mail/senha (`packages/web/src/app/login/page.tsx:17`, `:111`). |
| `/logs` | — (atalho “Atividade” no dashboard) | `LogsPage` inline | Histórico do usuário com filtros por tipo/status (`packages/web/src/app/logs/page.tsx:61`; `packages/web/src/app/page.tsx:359`). |
| `/ofertas` | Ofertas | `OfferList` | Lista, resumo, criação, edição, membros, sincronização e remoção de ofertas (`packages/web/src/app/ofertas/page.tsx:10`; `packages/web/src/components/ofertas/offer-list.tsx:40`). |
| `/ofertas/[id]` | — (drill-down de Ofertas) | `OfertaDetailPage` | Dashboard detalhado da oferta: métricas, anúncios, IA, janelas intradiárias e edição (`packages/web/src/app/ofertas/[id]/page.tsx:109`). |
| `/privacy` | — | `PrivacyPage` inline | Política de privacidade pública (`packages/web/src/app/privacy/page.tsx:5`). |
| `/recovery` | TMX Recovery | `RecoveryCenter` | Recuperação de abandono/recusa, canais, fila, métricas e envios (`packages/web/src/app/recovery/page.tsx:4`; `packages/web/src/components/recovery/recovery-center.tsx:26`). |
| `/reembolsos` | Reembolsos | `RefundsDashboard` | Dashboard financeiro agregado de reembolsos e chargebacks (`packages/web/src/app/reembolsos/page.tsx:8`; `packages/web/src/components/tracking/refunds-dashboard.tsx:44`). |
| `/register` | — | `RegisterForm` | Registro condicionado por convite (`packages/web/src/app/register/page.tsx:11`; `packages/web/src/app/register/register-form.tsx:21`). |
| `/settings` | Configurações | `SettingsClient` | Hoje mistura credenciais/n8n, oferta de destino, segurança da conta, usuários e convites (`packages/web/src/app/settings/page.tsx:6`; `packages/web/src/components/settings/settings-client.tsx:138`). |
| `/terms` | — | `TermsPage` inline | Termos de serviço públicos (`packages/web/src/app/terms/page.tsx:5`). |
| `/tools` | Ferramentas | `ToolsIndexPage` + `ToolCard` | Catálogo completo das ferramentas permitidas (`packages/web/src/app/tools/page.tsx:14`). |
| `/tools/cloaker-urls` | — | `redirect` | Rota removida; redireciona para `/tools` (`packages/web/src/app/tools/cloaker-urls/page.tsx:3`). |
| `/tools/cloner` | — (card em Ferramentas) | `UrlInputForm` | Inicia clonagem de página por URL (`packages/web/src/app/tools/cloner/page.tsx:6`). |
| `/tools/cloner/jobs/[id]` | — | `EditorShell`, `ForestPanel`, `EditPanel`, `PreviewFrame` | Editor de um job de clonagem em andamento/concluído (`packages/web/src/app/tools/cloner/jobs/[id]/page.tsx:17`). |
| `/tools/cloner/jobs/[id]/preview` | — | `PreviewPage` inline | Preview final isolado do clone (`packages/web/src/app/tools/cloner/jobs/[id]/preview/page.tsx:15`). |
| `/tools/creative-studio` | — | `redirect` | Alias legado; redireciona para `/tools/video-shield` (`packages/web/src/app/tools/creative-studio/page.tsx:3`). |
| `/tools/digi-approval` | — | `redirect` | Ferramenta retirada da UI; redireciona para `/tools` (`packages/web/src/app/tools/digi-approval/page.tsx:3`). |
| `/tools/digi-approval/[id]` | — | `redirect` | Detalhe retirado da UI; redireciona para `/tools` (`packages/web/src/app/tools/digi-approval/[id]/page.tsx:3`). |
| `/tools/funnel-clone` | — (card em Ferramentas) | `FunnelInputForm` | Inicia clonagem de funil completo (`packages/web/src/app/tools/funnel-clone/page.tsx:6`). |
| `/tools/funnel-clone/jobs/[id]` | — | `FunnelJobPage` | Status, etapas e download de um job de funil (`packages/web/src/app/tools/funnel-clone/jobs/[id]/page.tsx:32`). |
| `/tools/page-diff` | — | `redirect` | Ferramenta retirada da UI; redireciona para `/tools` (`packages/web/src/app/tools/page-diff/page.tsx:3`). |
| `/tools/upsell-analyzer` | — (card em Ferramentas) | `UpsellAnalyzer` | Analisa taxa de aceite/rejeição/não-vista de upsells (`packages/web/src/app/tools/upsell-analyzer/page.tsx:6`). |
| `/tools/video-shield` | — (card “Video Studio”) | `CreativeStudio` | Processamento unificado de vídeos e histórico de jobs (`packages/web/src/app/tools/video-shield/page.tsx:12`; `packages/web/src/components/creative-studio/creative-studio.tsx:81`). |
| `/tools/vsl` | — (card em Ferramentas) | `VslInputForm` | Inicia extração/download de VSL (`packages/web/src/app/tools/vsl/page.tsx:6`). |
| `/tools/vsl/jobs/[id]` | — | `VslJobPage` | Status, variantes e download de um job de VSL (`packages/web/src/app/tools/vsl/jobs/[id]/page.tsx:114`). |
| `/tools/webhook-tester` | — (card em Ferramentas) | `WebhookTester` | Monta, envia e inspeciona payloads de webhook (`packages/web/src/app/tools/webhook-tester/page.tsx:6`). |
| `/tracking` | “Trackeamento avançado” | `TrackingWorkspace` | Central de monitoramento, configuração e diagnóstico do tracking (`packages/web/src/app/tracking/page.tsx:9`; `packages/web/src/components/tracking/tracking-workspace.tsx:33`). |
| `/tracking/google-callback` | — | `GoogleCallback` inline | Callback OAuth do Google Ads; volta a `/tracking` (`packages/web/src/app/tracking/google-callback/page.tsx:7`). |
| `/utmify-geral` | — | `UtmifyGlobalCenter` | Configuração global UTMify; mesma superfície também montada em Administração (`packages/web/src/app/utmify-geral/page.tsx:9`). |

Arquivos de rota adicionais: o layout raiz só injeta providers/globals (`packages/web/src/app/layout.tsx:11`); `/login` tem layout próprio (`packages/web/src/app/login/layout.tsx:1`); o único `loading.tsx` explícito é o job do Cloner (`packages/web/src/app/tools/cloner/jobs/[id]/loading.tsx:1`).

## 2. Sidebar/nav atual

### 2.1 Estrutura reconstruída

Não existem grupos, sub-itens expansíveis ou badges na sidebar desktop. É uma lista plana; no mobile, os quatro primeiros itens visíveis viram a barra inferior e o restante entra no modal “Mais” (`packages/web/src/components/hub/sidebar.tsx:101-105`, `:148-223`). A ordem móvel muda conforme papel/permissões.

```text
TMX HUB (logo → /)
└─ Menu
   ├─ Visão geral              /
   ├─ Ofertas                  /ofertas
   ├─ TMX Recovery             /recovery
   ├─ Trackeamento avançado    /tracking
   ├─ Reembolsos               /reembolsos
   ├─ Controle de contas       /contas-meta
   ├─ Ferramentas              /tools
   ├─ Administração            /admin
   ├─ Configurações            /settings
   └─ Conta                    # (disabled; não renderiza)

rodapé desktop: Build v0.10.0 · ONLINE
mobile: primeiros 4 visíveis + Mais → restantes
```

Fonte da árvore: `packages/web/src/components/hub/sidebar.tsx:44-86`.

### 2.2 Classificação de cada entrada

| Entrada | Visibilidade atual | Classificação para o redesign | Motivo |
|---|---|---|---|
| Visão geral | Sempre | **manter** | É o ponto de entrada e resumo operacional. |
| Ofertas | `requiresTool: ofertas`; para não-admin só filtra quando `allowedTools` é não vazio | **manter** | Entidade central do produto (`sidebar.tsx:46`, `:92-100`). |
| TMX Recovery | Mesma regra de `ofertas` | **esconder** | Módulo explicitamente fora do novo escopo (`sidebar.tsx:47-53`). |
| Trackeamento avançado | Mesma regra de `ofertas` | **manter + reorganizar** | Módulo central; corrigir grafia para **Rastreamento** e reduzir três níveis de navegação (`sidebar.tsx:54-60`). |
| Reembolsos | Mesma regra de `ofertas` | **manter, mas duplicada** | Há versão autônoma e versão dentro de Rastreamento (`sidebar.tsx:61-67`). Manter um destino canônico. |
| Controle de contas | `adminOnly`; o `requiresTool` é efetivamente ignorado porque o filtro retorna no teste de admin primeiro | **esconder** | É Meta Control, não gestão de usuários nem account switcher (`sidebar.tsx:68-75`, `:95-100`). |
| Ferramentas | Sempre | **manter, mas duplicada** | O mesmo catálogo aparece resumido em `/` e completo em `/tools` (`sidebar.tsx:76`; `app/page.tsx:293-357`). |
| Administração | Só admin | **manter, mas consolidar** | Duplica usuários, convites, atividade e UTMify expostos em outras rotas (`sidebar.tsx:77-83`). |
| Configurações | Só admin | **manter fora da raiz ou renomear** | Após ocultar n8n/conexão/oferta, restam segurança, usuários e convites; os dois últimos já estão em Admin (`sidebar.tsx:84`; `settings-client.tsx:434-504`). |
| Conta | Marcada `disabled` e retorna `null` | **remover placeholder** | Não existe superfície clicável; perfil já aparece no topbar (`sidebar.tsx:85`, `:115`). |

### 2.3 Regras e shell

- `adminOnly` exige `user.role === 'admin'`. `requiresTool` só restringe não-admin quando `allowedTools.length > 0`; lista vazia equivale a acesso amplo (`packages/web/src/components/hub/sidebar.tsx:92-100`).
- Ativo: igualdade com `/` ou prefixo do path para os demais (`sidebar.tsx:110-114`).
- Topbar atual: logo/home, breadcrumb textual não clicável e slot direito (`packages/web/src/components/hub/topbar.tsx:13-80`).
- Slot direito padrão: ações da página + `UserMenu` (`packages/web/src/components/hub/hub-shell.tsx:19-27`).
- `UserMenu` atual confirma **perfil, papel, avatar, privacidade financeira e logout**; não há tema nem offer switcher global (`packages/web/src/components/hub/user-menu.tsx:8-56`).
- O shell aplica `AuthGate`, sidebar, área de conteúdo, `MicroFooter` e máscara de privacidade (`packages/web/src/components/hub/hub-shell.tsx:29-57`).

## 3. Duplicações de funcionalidade

Foram encontrados **16 grupos de duplicação**. “Ficar” indica o destino/componente canônico recomendado.

| # | A | B | Duplicação | Ficar / recomendação |
|---:|---|---|---|---|
| 1 | `TrackingPanel`: configuração, código, webhook VendePay e Meta Pixels (`packages/web/src/components/tracking/tracking-panel.tsx:14-174`, `:176-430`) | Gateways/VendePay dentro do 4568-liner (`tracking-advanced-center.tsx:1449-1568`, `:2644-2939`) | **VendePay configurável em dois lugares**, além de código/pixels misturados no painel antigo. | Ficar em **Integrações → Pagamentos & webhooks** no novo Tracking. `TrackingPanel` deve ser desmontado; não manter duas mutações para webhook/config. |
| 2 | Aba interna `Código` | Aba interna `Pixels` | Ambas executam exatamente `<TrackingPanel offerId… />` (`tracking-advanced-center.tsx:2436-2438`). O usuário troca de aba e vê a mesma tela inteira. | Dividir em `Instalação` e `Meta Pixels`, cada qual com conteúdo próprio; VendePay sai das duas. |
| 3 | Administração → Convites (`packages/web/src/components/admin/admin-dashboard.tsx:90`, `:152-154`) | Final de Configurações (`packages/web/src/components/settings/settings-client.tsx:504`) | **Duas formas de ver/criar/revogar convites**, usando o mesmo `InvitesSection`. | Ficar em **Administração → Convites**. Command palette aponta para essa aba. |
| 4 | Administração → Usuários e acessos (`admin-dashboard.tsx:89`, `:149-151`) | Configurações (`settings-client.tsx:502`) | Mesmo `UsersSection` montado em duas áreas. | Ficar em **Administração → Pessoas e acessos**. |
| 5 | `/utmify-geral` (`packages/web/src/app/utmify-geral/page.tsx:5-10`) | Administração → UTMify Geral (`admin-dashboard.tsx:92`, `:179-181`) | Mesma instância de `UtmifyGlobalCenter` por dois caminhos. | Ficar em **Integrações → UTMify global**; manter um URL canônico e redirecionar o outro. |
| 6 | `/reembolsos` + `RefundsDashboard` (`packages/web/src/app/reembolsos/page.tsx:5-8`) | Tracking → Financeiro → Reembolsos (`tracking-advanced-center.tsx:2375-2434`) | Dois relatórios de reembolso/chargeback, com filtros e densidades diferentes. | Ficar no destino financeiro canônico `/reembolsos`; dentro de Tracking usar resumo + link. |
| 7 | Tracking → Diagnosticar → `TrackingHelp offerId` (`packages/web/src/components/tracking/tracking-workspace.tsx:156-193`) | Configurar → Ajuda e testes → `TrackingHelp` sem `offerId` (`tracking-advanced-center.tsx:2439`) | O mesmo componente aparece em dois níveis; uma montagem tem contexto de oferta e a outra não. | Ficar em **Diagnóstico & testes**, sempre com `offerId`. |
| 8 | Seis `ToolCard` no dashboard (`packages/web/src/app/page.tsx:293-357`) | Sete `ToolCard` no catálogo (`packages/web/src/app/tools/page.tsx:19-110`) | Catálogo, rótulos, badges e descrições mantidos em dois arrays JSX independentes. | Ficar em `/tools`; dashboard mostra no máximo “Recentes/Favoritas” alimentado por um único `toolCatalog` compartilhado. |
| 9 | `components/dashboard/offer-list.tsx` (não importado; linka para rota inexistente `/dashboards/[id]`, `:145-219`) | `components/ofertas/offer-list.tsx` (usado em `/ofertas`, `app/ofertas/page.tsx:5-26`) | Duas implementações de lista/criação/remoção de ofertas; a primeira é legado morto com contrato antigo/n8n. | Ficar com `components/ofertas/*`; aposentar o legado após confirmar zero imports. |
| 10 | `ShieldProcessor` (`packages/web/src/components/shield/shield-processor.tsx:118`, 807 linhas; zero imports) | `CreativeStudio` (`packages/web/src/components/creative-studio/creative-studio.tsx:81`, usado em `app/tools/video-shield/page.tsx:4-43`) | Dois processadores de mídia de gerações/API diferentes. | Ficar com `CreativeStudio`; só remover o legado em lote posterior, não como parte do hide de UI. |
| 11 | Seletor de oferta em Diagnosticar (`tracking-workspace.tsx:158-178`) | Seletor de oferta em Configurar (`tracking-workspace.tsx:197-250`) | Mesmo controle e mesma fonte de dados copiados no mesmo arquivo. | Um `OfferContextSwitcher` acima das views; estado único para Monitorar/Configurar/Diagnosticar. |
| 12 | Card “Logs de toda a equipe” no overview Admin (`admin-dashboard.tsx:119-147`) | Aba “Atividade” no próprio Admin (`admin-dashboard.tsx:155-178`) | Mesma coleção `recentActivity` e mesmo row markup na mesma página. | Overview mostra 5 linhas + “Ver tudo”; lista completa fica na aba Atividade. `/logs` continua como atividade pessoal. |
| 13 | Helpers/presets de data no dashboard (`app/page.tsx:30-51`) | Clones em Ofertas, detalhe da oferta, Tracking overview e Tracking advanced (`components/ofertas/offer-list.tsx:29-43`; `app/ofertas/[id]/page.tsx:36-57`; `tracking-overview-dashboard.tsx:13-30`; `tracking-advanced-center.tsx:236-250`, `:798-803`) | Conversão São Paulo/UTC e presets reimplementados, com semântica divergente (“7 dias atrás” vs intervalo de 7 dias). | Um utilitário de data e um `DateRangeFilter`; rótulos devem distinguir **dia isolado** de **período**. |
| 14 | `Kpi`/`KpiGrid` compartilhado (`components/dashboard/kpi-cards.tsx:56-108`) | `Metric`, `Kpi` local e cards inline em Tracking, Refunds, UTMify, Admin e Recovery (`tracking-advanced-center.tsx:253-260`; `refunds-dashboard.tsx:551-581`; `utmify-global-center.tsx:440-470`; `admin-dashboard.tsx:72-84`; `tracking-panel.tsx:206-218`; `tracking-health-center.tsx:72`) | Mesmo padrão “label + número + tom + card” repetido em 6+ superfícies com tipografia/spacing divergentes. | Evoluir o primitivo existente para variantes `default`, `compact`, `financial`, `status`; não criar outra biblioteca. |
| 15 | Seis paths de redirect | Destinos canônicos | Aliases: `/help/tracking-vendepay → /tracking`, `/tools/cloaker-urls → /tools`, `/tools/creative-studio → /tools/video-shield`, `/tools/digi-approval[/id] → /tools`, `/tools/page-diff → /tools` (arquivos citados no inventário). | Manter redirects apenas por compatibilidade; não indexar em nav/⌘K. Documentar como aliases, não como páginas do produto. |
| 16 | Top tab `Acompanhar` com `TrackingOverviewDashboard` (`tracking-workspace.tsx:113-155`) | Configurar → Resultados → `Tracker` (`tracking-advanced-center.tsx:697-703`, `:1888-1895`) | Dois conceitos de “visão do tracking” sem distinção clara: overview agregado e console por oferta. | Renomear para **Visão geral** (agregado) e **Eventos ao vivo** (por oferta); offer switcher persistente explicita o contexto. |

Duplicação intencional que **não** deve virar outra implementação: `KpiGrid` já é corretamente reutilizado no dashboard e detalhe da oferta (`app/page.tsx:207`; `app/ofertas/[id]/page.tsx:511`). A consolidação deve ampliar esse primitivo, não substituí-lo.

## 4. Módulos a esconder

Regra de produto: esconder somente a UI. API client, backend, workers, tabelas e contratos permanecem.

### 4.1 TMX Recovery

Referências frontend localizadas:

- Nav desktop/mobile: `packages/web/src/components/hub/sidebar.tsx:47-53` — **seguro esconder**.
- Rota: `packages/web/src/app/recovery/page.tsx:1-5` — **seguro retornar 404/redirect por flag**, sem apagar o arquivo.
- Superfície inteira: `packages/web/src/components/recovery/recovery-center.tsx:26-846` — isolada; **seguro não montar**.
- Tipo e cliente HTTP: `packages/web/src/lib/api-client.ts:831-862`, `:2262-2319` — **manter**.
- Não foram encontradas importações/cards de Recovery no dashboard `/`, em Ofertas ou em Tracking. As ocorrências “abandoned” em `components/digi/*` descrevem status de auditoria e não são TMX Recovery.

Classificação: **isolado**. Ocultar entrada + bloquear rota cobre toda a UI conhecida.

### 4.2 Controle de Contas

O nome significa **TMX Meta Control**, não gestão de usuários e não account switcher. Ele lê múltiplos dashboards/apps Meta, sincroniza contas e campanhas, associa cada item a uma oferta e configura alertas de pagamento via Pushcut (`packages/web/src/components/meta-control/meta-accounts-control.tsx:83-267`, `:269-388`, `:391-817`).

Referências frontend localizadas:

- Nav admin-only: `packages/web/src/components/hub/sidebar.tsx:68-75` — **seguro esconder**.
- Rota: `packages/web/src/app/contas-meta/page.tsx:1-17` — **seguro retornar 404/redirect por flag**.
- Superfície: `packages/web/src/components/meta-control/meta-accounts-control.tsx:83-817` — isolada; **seguro não montar**.
- Tipos: `packages/web/src/lib/api-client.ts:1206-1276` — **manter**.
- Cliente HTTP Meta Control/Pushcut/associações: `packages/web/src/lib/api-client.ts:1429-1536` — **manter**.

Classificação: **isolado na UI**, embora internamente reúna conexão Meta, dashboard, ofertas e Pushcut.

### 4.3 “Criar conexão com TMX Hub”

Não existe botão/CTA com esse texto. O equivalente encontrado é o card read-only **“1 · Conexão TMX HUB”**, que expõe `TMX_API_URL` e o JWT `TMX_TOKEN` para integrações externas (`packages/web/src/components/settings/settings-client.tsx:268-304`). Ele faz parte de `/settings` (`packages/web/src/app/settings/page.tsx:1-10`).

- **Entrelaçado**: não esconder `/settings` inteiro, porque o mesmo componente contém segurança da conta, usuários e convites (`settings-client.tsx:434-504`).
- **Seguro esconder**: extrair/não renderizar o bloco `:268-304`, remover o texto introdutório de n8n `:228-240` e o alerta de host local `:242-266`.
- **Manter no código**: helpers de URL/token podem ficar até limpeza posterior; não expor token na UI modernizada.

### 4.4 Oferta de destino

É a segunda etapa do assistente n8n em Configurações: escolhe uma oferta e mostra `OFFER_ID` + URL `/v1/offers/{id}/ingest` (`packages/web/src/components/settings/settings-client.tsx:151-175`, `:306-351`). Não é o cadastro normal de ofertas.

- **Entrelaçado** em `SettingsClient`; **seguro esconder apenas o bloco** `:306-351`.
- A query de ofertas `:151-155` e o estado `:157-166` passam a ficar sem consumidor se os três cards forem ocultos; o builder deve removê-los da renderização/execução da UI, sem alterar a API.
- A criação/gestão normal de ofertas em `/ofertas` não deve ser escondida.

### 4.5 Integração n8n

Referências frontend localizadas:

- Cabeçalho/descrição da tela: `packages/web/src/components/settings/settings-client.tsx:228-240`.
- Alerta de conectividade para n8n remoto: `settings-client.tsx:242-266`.
- Card “3 · Integração n8n”, download, bloco de variáveis e tutorial: `settings-client.tsx:353-420`.
- Nota sobre expiração do token/n8n: `settings-client.tsx:422-432`.
- Asset baixável: `packages/web/public/tmx-utmify-ingest.n8n.json` — **manter no repositório**, apenas retirar o link da UI.
- Legado não montado que também fala em n8n: `packages/web/src/components/dashboard/offer-list.tsx:101-131`, `:145-219` — zero imports atuais; não reaparece ao ocultar Settings.

Classificação: **entrelaçado** em Configurações. Ocultar blocos `:228-432`; preservar `Segurança da conta` `:434-500`. Usuários/convites devem ser consolidados no Admin, não simplesmente perdidos.

### 4.6 Matriz de ocultação

| Item | Menu | Rota inteira | Bloco interno | API/client | Risco |
|---|---:|---:|---:|---:|---|
| TMX Recovery | ocultar | 404/redirect | não montar | manter | baixo |
| Controle de contas / Meta Control | ocultar | 404/redirect | não montar | manter | baixo |
| Conexão TMX HUB | não tem item próprio | manter `/settings` | ocultar | manter | médio: compartilha estado com n8n |
| Oferta de destino | não tem item próprio | manter `/settings` | ocultar | manter | médio: query/estado ficam órfãos |
| Integração n8n | não tem item próprio | manter `/settings` | ocultar | manter | médio: o título atual da página vira incorreto |

## 5. Rastreamento Avançado destrinchado

### 5.1 Arquitetura atual

`TrackingWorkspace` cria três tabs de nível 1 (`packages/web/src/components/tracking/tracking-workspace.tsx:27`, `:113-150`):

1. **Acompanhar** — `TrackingOverviewDashboard`, visão agregada (`:152-155`).
2. **Configurar** — seletor de oferta + `TrackingAdvancedCenter` (`:195-268`).
3. **Diagnosticar** — seletor de oferta + `TrackingHealthCenter` + `TrackingHelp` (`:156-193`).

Dentro de **Configurar**, `TrackingAdvancedCenter` tem:

- onboarding de cinco passos: ativar oferta, instalar captura, conectar VendePay, conectar destinos e validar jornada (`packages/web/src/components/tracking/tracking-advanced-center.tsx:1620-1657`, `:1667-1718`);
- seis áreas laterais e 18 seções (`:642-714`);
- filtro de período global exibido apenas para cinco seções (`:1793-1887`);
- 4568 linhas, com queries, mutations, formulários e renderização no mesmo arquivo.

### 5.2 Áreas e seções atuais

| Área atual | Seção | Finalidade verificada | Duplicação / problema de comunicação |
|---|---|---|---|
| Resultados | Tracker | Console de eventos/sinais por oferta via `TrackingLiveConsole mode="tracker"` (`:1888-1895`). | “Tracker” é jargão e parece duplicar Acompanhar. Renomear **Eventos ao vivo**. |
| Resultados | Funil | Jornada e conversão via `TrackingLiveConsole mode="funnel"` (`:1896-1903`). | Nome genérico; usar **Jornada do funil**. |
| Resultados | Upsell Intelligence | Configura etapas/URLs por conta VendePay, scripts, connect/accept rate e reconciliação de vendaId (`:1904-2365`). | Mistura configuração e análise; separar **Configurar upsells** de **Desempenho de upsells**. Inglês desnecessário. |
| Resultados | Campanhas e anúncios | Atribuição de campanhas/anúncios (render começa em `:2367`). | Nome aceitável; deixar explícito “Atribuição”. |
| Captura e links | Código | Hoje monta o painel legado completo (`:2436-2438`). | Duplicação total com Pixels e inclui VendePay. Renomear **Instalação** e mostrar somente snippet/status. |
| Captura e links | Domínios | Cadastro, verificação e DNS/subdomínio de tracking (`:2440-2642`; título `:2442-2443`). | “source” vs “tracking” é técnico; apresentar **Domínio da página** / **Subdomínio TMX**. |
| Captura e links | Testes A/B | Na mesma seção cria/edita links de entrada, converte link em A/B e gerencia testes (`:3846-4210`). | O rótulo esconde “Links de entrada”. Dividir em duas seções irmãs. |
| Integrações | Gateways | VendePay, gateways universais/Paysight, webhooks, secrets, homologação e receipts (`:2644-2939`). | É o destino correto da configuração VendePay, hoje duplicada no painel legado. Renomear **Pagamentos & webhooks**. |
| Integrações | Pixels | Monta exatamente o mesmo `TrackingPanel` de Código (`:2436-2438`). | Duplicação total. Extrair só CRUD/teste de pixels como **Meta Pixels**. |
| Integrações | Envio ao Meta | Regras de atribuição/valor mínimo, auditoria e replay/reconciliação CAPI (`:2941-3098`). | Separar claramente **Regras de envio** de **Entregas Meta** dentro da mesma página. |
| Integrações | Envio à UTMify | Pixel web, API de vendas, entregas, retries e classificação front/upsell (`:3116-3500`). | Escopo grande; nome curto **UTMify** com subtabs “Configuração”, “Entregas”, “Produtos”. |
| Integrações | Conversões vTurb | Config/player analytics, retenção, pitch e conversão (`:267-640`, montagem `:4212-4219`). | Métrica de jornada está escondida entre integrações. Mostrar resultado como **Retenção da VSL** em Jornada; configuração fica em Integrações. |
| Integrações | Google Ads | OAuth/destinos/ações de conversão por oferta (`:3100-3106`; `google-ads-destinations.tsx:1-169`). | “Destino” e “conexão” se misturam; usar estados Conectado/Rascunho/Ativo. |
| Integrações | TikTok Ads | Pixels + Events API + teste por oferta (`:3108-3114`; `tiktok-destinations.tsx:1-253`). | Mesmo padrão de Google; deve compartilhar IA e estados, não necessariamente o mesmo form. |
| Financeiro | Reembolsos e chargeback | Resumo/lista por oferta/período (`:2375-2434`). | Duplica `/reembolsos`; usar resumo com deep-link para o relatório canônico. |
| Financeiro | Taxas e líquido | Percentuais fixos/variáveis por gateway para líquido (`:3742-3844`). | Nome aceitável; renomear **Taxas do gateway** e explicar efeito nos KPIs. |
| Automações | Notificações Pushcut | CRUD/teste/retry de destinos Pushcut por oferta (`:3502-3740`). | Uma área raiz com só uma seção é desperdício de navegação. Mover para Integrações → Alertas. |
| Diagnóstico | Ajuda e testes | Tutoriais e validações (`:2439`). | Duplica a tab Diagnosticar e perde `offerId`; manter apenas uma versão contextual. |

Problemas transversais:

- A grafia visível é “Trackeamento” na sidebar, breadcrumb, H1 e rodapé do módulo (`sidebar.tsx:55`; `app/tracking/page.tsx:11`; `tracking-workspace.tsx:69-74`; `tracking-advanced-center.tsx:4561-4564`). Padronizar **Rastreamento**.
- Há três níveis concorrentes: tabs do workspace → áreas → botões de seção. Em viewport menor, dois níveis viram carrosséis horizontais (`tracking-workspace.tsx:113-150`; `tracking-advanced-center.tsx:1719-1755`).
- O onboarding de cinco passos navega para seções, mas “Ativar oferta” e “Instalar captura” apontam ambos para `code` (`tracking-advanced-center.tsx:1620-1632`).
- A tela consulta/configura uma oferta, mas Acompanhar é agregado e o seletor só aparece em duas tabs; o contexto muda sem persistência visual.
- Empty/loading/error ainda são implementados manualmente em várias subseções, apesar de existir `DataState` (`packages/web/src/components/ui/data-state.tsx:8-61`).

### 5.3 Organização proposta para Rastreamento

Usar um único header compacto com `OfferContextSwitcher`, período quando aplicável e status da integração. Abaixo, cinco grupos estáveis; persistir grupo/seção na URL (`?offer=…&view=…`) para deep-link e ⌘K.

```text
Rastreamento
├─ Visão geral
│  ├─ Resumo da operação          (overview agregado ou da oferta selecionada)
│  └─ Saúde e alertas             (status + incidentes; sem tutorial duplicado)
├─ Jornada
│  ├─ Eventos ao vivo             (antigo Tracker)
│  ├─ Jornada do funil            (antigo Funil)
│  ├─ Atribuição de campanhas     (Campanhas e anúncios)
│  ├─ Upsells                     (métricas; configuração abre drawer/página própria)
│  └─ Retenção da VSL             (resultado vTurb)
├─ Captura
│  ├─ Instalação                  (script + status)
│  ├─ Domínios                    (página/subdomínio)
│  ├─ Links de entrada            (CRUD de links TMX)
│  └─ Testes A/B                  (experimentos e métricas)
├─ Destinos
│  ├─ Pagamentos & webhooks       (VendePay/Paysight; fonte única)
│  ├─ Meta Pixels                 (CRUD/testes)
│  ├─ Entregas Meta               (regras, fila, replay)
│  ├─ UTMify                      (pixel, vendas, produtos, entregas)
│  ├─ Google Ads
│  ├─ TikTok Ads
│  ├─ vTurb                       (somente configuração)
│  └─ Alertas Pushcut
└─ Financeiro e diagnóstico
   ├─ Reembolsos                  (resumo + abrir relatório completo)
   ├─ Taxas do gateway
   └─ Diagnóstico & testes        (uma única instância, sempre com offerId)
```

Componente-alvo: `TrackingAdvancedCenter` vira coordenador de navegação/contexto com menos de ~250 linhas. Cada seção passa a possuir suas queries/mutations e seu estado de formulário; isso evita o estado global atual de dezenas de campos (`tracking-advanced-center.tsx:720-806`) e torna ownership/testes previsíveis.

## 6. Nova IA/nav proposta

### 6.1 Árvore de produto — 6 áreas-raiz

```text
TMX HUB
├─ Visão geral                         /
├─ Ofertas                             /ofertas
│  ├─ Todas as ofertas                 /ofertas
│  ├─ Detalhe                          /ofertas/[id]
│  └─ Reembolsos                       /reembolsos
├─ Rastreamento                        /tracking
│  ├─ Visão geral                      /tracking?view=overview
│  ├─ Jornada                          /tracking?view=journey
│  ├─ Captura                          /tracking?view=capture
│  └─ Diagnóstico                      /tracking?view=diagnostics
├─ Integrações                         /tracking?view=destinations
│  ├─ Pagamentos & webhooks
│  ├─ Meta
│  ├─ UTMify
│  ├─ Google Ads
│  ├─ TikTok Ads
│  ├─ vTurb
│  └─ Alertas Pushcut
├─ Ferramentas                         /tools
│  ├─ Page Cloner
│  ├─ VSL Downloader
│  ├─ Upsell Analyzer
│  ├─ Webhook Tester
│  ├─ Funnel Full Clone
│  └─ Video Studio
└─ Administração [admin]               /admin
   ├─ Visão geral
   ├─ Pessoas e acessos
   ├─ Convites
   ├─ Atividade
   └─ Conta e segurança                /settings

Ocultos: Recovery, Meta Control, Conexão TMX/n8n/oferta de destino.
Aliases antigos: fora da sidebar e fora do ⌘K.
```

Comportamento inspirado em Linear/Vercel/Supabase:

- sidebar desktop com 240 px expandida e 56–64 px colapsada; ícone + tooltip no estado colapsado;
- somente uma área expandida por vez; persistir estado localmente;
- cabeçalhos de grupo discretos, sem cards decorativos dentro da sidebar;
- item ativo por fundo sutil + texto forte, sem glow;
- no mobile, drawer único; não depender da posição dos “quatro primeiros” conforme permissão;
- `nav-config.ts` único com label, href, icon, keywords, role/tool gate e filhos. Sidebar e ⌘K consomem a mesma fonte.

### 6.2 Command palette (⌘K)

Implementar conceitualmente com os primitives existentes (`Dialog`, busca local e roteamento); **sem dependência npm nova**.

Destinos:

- ir para qualquer área/rota canônica;
- abrir oferta por nome/empresa;
- abrir seção de Rastreamento por nome e oferta atual;
- abrir ferramenta;
- abrir Pessoas, Convites ou Atividade (admin).

Ações:

- `Criar oferta`;
- `Trocar oferta atual`;
- `Atualizar dados` da superfície ativa;
- `Sincronizar oferta` quando permitido;
- `Ocultar/mostrar valores financeiros`;
- `Alternar tema` quando o tema claro for implementado;
- `Abrir perfil/segurança` e `Sair`.

Não indexar rotas de redirect, módulos ocultos ou ações sem permissão. Exibir shortcut no topbar e aceitar `/` como foco de busca quando nenhum input estiver ativo.

### 6.3 Topbar

Estado atual confirmado: perfil/role/avatar, privacidade e logout existem; tema e offer switcher global não (`packages/web/src/components/hub/user-menu.tsx:8-56`). Proposta:

- esquerda: botão de colapso + breadcrumb clicável;
- centro/esquerda: **offer switcher contextual** apenas em `/ofertas/[id]`, `/tracking`, `/reembolsos` e integrações por oferta; não mostrar em Ferramentas/Admin;
- centro/direita: trigger “Buscar ou executar… ⌘K”;
- direita: privacidade financeira, tema, notificações/status somente quando houver dado real, menu de perfil;
- no menu de perfil: Conta e segurança, tema, privacidade, logout. Remover “Conta” disabled da sidebar.

### 6.4 Política de breadcrumb

- Não usar em páginas-raiz: `/`, `/ofertas`, `/tracking`, `/tools`, `/admin`.
- Usar breadcrumb clicável a partir de profundidade 2: `Ofertas / Café Expresso 7 Dias`, `Ferramentas / Cloner / Job …`, `Rastreamento / Destinos / Meta`.
- O último segmento é texto; anteriores são links. Em mobile, mostrar “← pai” + título atual.
- Não codificar labels em cada página como arrays soltos; derivar do mesmo mapa de rotas/nav e permitir override para IDs dinâmicos. O breadcrumb atual é apenas texto (`topbar.tsx:59-77`).

### 6.5 Densidade e tokens de layout

- body: `text-[13px]`/`text-sm`; metadado: `text-xs`; labels auxiliares: `text-[11px]` sem tracking excessivo;
- título de seção: `text-base font-semibold`; H1 de página: `text-xl` ou `text-2xl`, não `text-4xl` em dashboard operacional;
- conteúdo: `p-4` padrão; `p-3` em rows/cards compactos; `gap-3`; seções principais `space-y-4`;
- controles: 36 px desktop, 40–44 px touch/mobile;
- borda: `border border-border/60`; fundo em um ou dois níveis, sem glow como sinal padrão;
- radius: `rounded-lg` para painéis, `rounded-md` para controles; reservar `rounded-xl/2xl` para modais/hero excepcional;
- largura: remover heroes altos; título, contexto, filtros e CTA devem caber no primeiro viewport.

### 6.6 Empty/loading/error

Reusar `DataState` como contrato único (`packages/web/src/components/ui/data-state.tsx:8-61`):

- `loading`: skeleton/loader com o mesmo footprint do conteúdo; não trocar a página inteira por spinner quando já há cache;
- `empty`: título factual + próxima ação única;
- `error`: mensagem curta + retry; se há dado stale, manter o dado e mostrar aviso inline;
- tabelas/listas: estado dentro do container com altura mínima estável;
- queries de seção: não desmontar nav/header em loading/error;
- remover variantes manuais equivalentes em Tracking, Settings, Admin e integrações à medida que cada arquivo for tocado.

## 7. Plano de execução em 4 lotes sem conflito de arquivo

O contrato comum deve ser fechado antes de iniciar: `nav-config`/URLs canônicas, query params de Tracking (`offer`, `view`, `section`) e flags de visibilidade. Cada arquivo abaixo tem um único lote dono.

### Lote A — shell, nav e command palette

**Arquivos tocados**

- `packages/web/src/components/hub/sidebar.tsx`
- `packages/web/src/components/hub/topbar.tsx`
- `packages/web/src/components/hub/hub-shell.tsx`
- `packages/web/src/components/hub/user-menu.tsx`
- `packages/web/src/app/globals.css`
- novos: `packages/web/src/components/hub/command-palette.tsx`, `offer-context-switcher.tsx`, `nav-config.ts`, `packages/web/src/lib/ui-visibility.ts`

**Entrega**

- sidebar colapsável, 6 áreas-raiz, grupos/sub-itens e gates centralizados;
- módulos ocultos ausentes da nav;
- topbar denso, breadcrumbs clicáveis, perfil/tema/contexto;
- ⌘K usando `Dialog` existente e o mesmo `nav-config`.

**Risco**: médio — regressão de active state, permissões, mobile e foco/teclado. **Estimativa**: 1,5–2,5 dias.

### Lote B — esconder módulos e sanear Configurações

**Arquivos tocados**

- `packages/web/src/app/recovery/page.tsx`
- `packages/web/src/app/contas-meta/page.tsx`
- `packages/web/src/app/settings/page.tsx`
- `packages/web/src/components/settings/settings-client.tsx`
- novos: `packages/web/src/components/settings/account-security.tsx` e, se necessário, `packages/web/src/app/not-found.tsx`

**Entrega**

- Recovery e Meta Control retornam `notFound()` ou redirect estável quando as flags de A estão desligadas;
- cards Conexão TMX, Oferta de destino e n8n não são renderizados;
- `/settings` vira **Conta e segurança**; usuários/convites deixam de ser montados ali, pois o canônico é Admin;
- nenhuma exclusão em `api-client`, backend, workers, DB ou asset n8n.

**Risco**: médio — `SettingsClient` compartilha query/estado entre os três cards; remover só JSX deixaria requests e secrets no client. **Estimativa**: 0,75–1,25 dia.

### Lote C — redesign de Rastreamento Avançado

**Arquivos tocados**

- `packages/web/src/app/tracking/page.tsx`
- `packages/web/src/components/tracking/tracking-workspace.tsx`
- `packages/web/src/components/tracking/tracking-advanced-center.tsx`
- `packages/web/src/components/tracking/tracking-panel.tsx`
- `packages/web/src/components/tracking/tracking-help.tsx`
- `packages/web/src/components/tracking/tracking-live-console.tsx`
- `packages/web/src/components/tracking/tracking-health-center.tsx`
- `packages/web/src/components/tracking/google-ads-destinations.tsx`
- `packages/web/src/components/tracking/tiktok-destinations.tsx`
- `packages/web/src/components/tracking/refunds-dashboard.tsx`
- novos sob `packages/web/src/components/tracking/sections/{overview,journey,capture,destinations,finance,diagnostics}/`
- novos: `tracking-nav.ts`, `tracking-period-filter.tsx`, `tracking-offer-context.tsx`

**Entrega**

- coordenador pequeno + 5 grupos/18 capacidades repartidas;
- contexto de oferta único e deep-links por query param;
- VendePay com uma única UI em Pagamentos & webhooks;
- Código e Pixels deixam de renderizar o mesmo painel;
- Links de entrada separados de Testes A/B;
- Diagnóstico/Help único com `offerId`;
- Reembolsos vira resumo/deep-link, sem segundo relatório completo.

**Risco**: alto — maior superfície de queries/mutations, permissões `canManage`, invalidação de cache e secrets one-time. Migrar seção por seção sem mudar contratos HTTP. **Estimativa**: 4–6 dias.

### Lote D — consolidar duplicações fora de Tracking

**Arquivos tocados**

- `packages/web/src/app/page.tsx`
- `packages/web/src/app/tools/page.tsx`
- `packages/web/src/components/admin/admin-dashboard.tsx`
- `packages/web/src/app/utmify-geral/page.tsx`
- `packages/web/src/components/dashboard/kpi-cards.tsx`
- `packages/web/src/components/ofertas/offer-list.tsx`
- `packages/web/src/app/ofertas/[id]/page.tsx`
- novos: `packages/web/src/lib/tool-catalog.ts`, `packages/web/src/lib/date-range.ts`, `packages/web/src/components/ui/date-range-filter.tsx`
- legado a marcar/depreciar após prova de zero imports: `packages/web/src/components/dashboard/offer-list.tsx`, `packages/web/src/components/shield/shield-processor.tsx`

**Entrega**

- um catálogo de ferramentas para Home/Tools;
- Admin como destino único de usuários, convites e atividade completa;
- UTMify global com URL canônico único;
- um primitivo KPI/metric e um filtro de período compartilhados;
- aliases antigos permanecem redirects, fora da IA.

**Risco**: médio — diferenças legítimas de métricas/presets não podem ser achatadas; separar configuração de apresentação. **Estimativa**: 1,5–2,5 dias.

### Ordem de integração

1. A e B podem começar em paralelo usando o contrato fechado de `ui-visibility.ts`; A é o único dono dos arquivos `hub/*`, B é o único dono de Settings/rotas ocultas.
2. C roda em paralelo sem tocar shell, Admin, Home ou Tools.
3. D roda em paralelo sem tocar Settings nem qualquer arquivo `tracking/*`.
4. Merge recomendado: A → B → D → C; smoke final em desktop/mobile para admin e usuário restrito.

## 8. Limites do mapeamento

- Verificação feita por código atual; não houve alteração do frontend, backend, workers ou banco.
- Não foram auditados contratos backend/DB além dos métodos consumidos pelo frontend.
- O dev local e as credenciais seeded não foram necessários para identificar rotas/ownership; comportamentos condicionais foram derivados do código de auth/nav.
- O único arquivo criado por esta auditoria é este relatório.

