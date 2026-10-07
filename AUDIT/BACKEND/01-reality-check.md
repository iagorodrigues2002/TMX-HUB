# Backend reality check — UI nova × produção Railway

Auditoria executada em **2026-10-07**, sem alteração de produção: somente `SELECT`, `GET`, leitura de logs/status e inspeção de nomes (nunca valores) de variáveis.

## Resumo

- **35 rotas front** foram enumeradas em `packages/web/src/app/**/page.tsx`, além de **22 subseções** de `/tracking` (57 superfícies de UI no total).
- A UI alcança **185 operações de API distintas por método + path**, em **162 paths**; 175 vêm de `request()`, 6 de helpers/raw do `api-client`, 3 da tela `/debug` e 1 do módulo n8n oculto.
- **7 gaps pré-push**: **2 migrations pendentes**, **3 env vars faltando**, **1 worker ainda ausente em prod** e **1 superfície de UI sem backend funcional em prod**.
- **CONFIRMADO:** os 67 GETs do `api-client` usados pela UI existem em prod (66 responderam `401`, portanto rota registrada e protegida; o único `404` foi o token fictício de convite, comportamento esperado). Health e readiness retornaram `200` com Redis, Postgres, S3 e Chromium OK.
- **CONFIRMADO:** Upsell Intelligence e UTMify Global têm schema/dados em prod; Explodely e os índices locais 071 ainda não. **Bloqueador extra:** o código atual exige `JWT_SECRET`, ausente no Railway.

### Convenções da tabela

- `SHELL` = `GET /v1/auth/me` + `GET /v1/offers` + ação opcional `POST /v1/offers/{id}/sync`, trazidas pelo `HubShell`/seletor global.
- `OK` = suporte presente; `MISSING` = backend de produção não contém a feature; `MIGRATION_PENDENTE` = rota/schema base existe, mas falta DDL local; `ENV_FALTA` = a feature falha ou o próximo boot falhará sem variável.
- **CONFIRMADO** = observado por GET/SELECT/status/log/env-name real em Railway. **INFERIDO** = verificado no código, sem disparar POST/PUT/PATCH/DELETE em produção.

## 1. Rotas front

| Rota front | Endpoints consumidos | Status prod | Nota |
|---|---|---|---|
| `/` | `SHELL`; `GET /v1/dashboard/summary` | OK | GET **CONFIRMADO** 401 (rota protegida). |
| `/admin` | `SHELL`; `GET /v1/admin/overview`, `/v1/users`, `/v1/auth/invites`; `POST/PATCH/DELETE` de usuários e convites | OK | GETs **CONFIRMADOS**; mutações **INFERIDAS** do registro de rotas. |
| `/contas-meta` | `SHELL`; `/v1/meta-control/{connections,dashboard,sync,connection}`; atribuições de conta/campanha e Pushcut | OK | GETs **CONFIRMADOS**; tabelas `meta_*` **CONFIRMADAS**. Módulo está oculto por flag. |
| `/debug` | `GET /healthz`, `GET /readyz`, `OPTIONS /v1/clones` | OK | Health/readiness **CONFIRMADOS** 200. |
| `/help/tracking-vendepay` | nenhum; redirect para `/tracking` | OK | Puro front. |
| `/info` | nenhum | OK | Conteúdo estático. |
| `/login` | `POST /v1/auth/login`; `GET /v1/auth/me` | OK | `/auth/me` **CONFIRMADO**; login **INFERIDO**. |
| `/logs` | `SHELL`; `GET /v1/activity` | OK | GET **CONFIRMADO**. |
| `/ofertas` | `SHELL`; `GET /v1/users`, `/v1/dashboard/summary`; CRUD `/v1/offers` | OK | GETs **CONFIRMADOS**; CRUD **INFERIDO**. |
| `/ofertas/[id]` | `SHELL`; `/v1/offers/{id}/{utmify-capabilities,snapshots,intraday,intraday/range,ai-config,ai-analyses,ai-analysis-status}` e mutações de oferta/IA | OK | Todos os GETs **CONFIRMADOS**. |
| `/privacy` | nenhum | OK | Conteúdo estático. |
| `/recovery` | `SHELL`; `GET /v1/offers/{id}/recovery`; settings, channels, sync, send, bulk-send, email-webhook e test-email | OK | GET **CONFIRMADO**; tabelas `recovery_*` **CONFIRMADAS**. Oculto por flag. |
| `/reembolsos` | `SHELL`; `GET /v1/tracking/refunds-dashboard` | OK | GET **CONFIRMADO**. |
| `/register` | `GET /v1/auth/invites/{token}`; `POST /v1/auth/register` | OK | `404` com token fictício confirma handler público; cadastro **INFERIDO**. |
| `/settings` | `SHELL`; `POST /v1/auth/{change-password,admin-reset-own-password}`; ocultos: `POST /v1/offers/{id}/ingest` + arquivo n8n | OK | Endpoints de senha/ingest **INFERIDOS**. Cards TMX/n8n/oferta estão ocultos e não executam queries hoje. |
| `/terms` | nenhum | OK | Conteúdo estático. |
| `/tools` | `SHELL` | OK | Catálogo é client-side; seis ferramentas ativas e VSL Transcriber desabilitado. |
| `/tools/cloaker-urls` | nenhum; redirect `/tools` | OK | Rota removida, sem feature ativa. |
| `/tools/cloner` | `SHELL`; `POST /v1/inspect`, `POST /v1/clones` | OK | Criação **INFERIDA**; serviço API tem Chromium/S3/Redis ready. |
| `/tools/cloner/jobs/[id]` | `SHELL`; `GET /v1/clones/{id}`, forms, links, builds; `POST/PATCH` build/forms/links | OK | GETs e Swagger de clone **CONFIRMADOS**; render/bundle workers **INFERIDOS ativos**. |
| `/tools/cloner/jobs/[id]/preview` | `GET /v1/clones/{id}` e `GET /v1/clones/{id}/preview` | OK | Preview consta no OpenAPI de prod; clone GET **CONFIRMADO**. |
| `/tools/creative-studio` | nenhum; redirect `/tools/video-shield` | OK | Alias front. |
| `/tools/digi-approval` | nenhum; redirect `/tools` | OK | Código de API existe no repo, mas não é registrado; não há UI ativa. |
| `/tools/digi-approval/[id]` | nenhum; redirect `/tools` | OK | Idem. |
| `/tools/funnel-clone` | `SHELL`; `POST /v1/funnel-jobs` | OK | POST **INFERIDO**; companion GET e fila/worker no código. |
| `/tools/funnel-clone/jobs/[id]` | `SHELL`; `GET /v1/funnel-jobs/{id}` | OK | GET **CONFIRMADO**; funnel worker **INFERIDO ativo**. |
| `/tools/page-diff` | nenhum; redirect `/tools` | OK | Rota removida; `page-diff.ts` não é registrado no router. |
| `/tools/upsell-analyzer` | `SHELL`; nenhum endpoint próprio | OK | Calculadora client-side/localStorage; não requer worker. |
| `/tools/video-shield` | `SHELL`; CRUD `/v1/niches`; `/v1/shield-jobs`; `/v1/media-jobs`; downloads/bulk-download | OK | GETs `niches`, `shield-jobs`, `media-jobs` **CONFIRMADOS**; S3/Chromium/Redis ready; workers shield/media **INFERIDOS ativos**. |
| `/tools/vsl` | `SHELL`; `POST /v1/vsl-jobs` | OK | POST **INFERIDO**; ffmpeg/worker vêm no mesmo container da API. |
| `/tools/vsl/jobs/[id]` | `SHELL`; `GET /v1/vsl-jobs/{id}` | OK | GET **CONFIRMADO**; VSL worker **INFERIDO ativo**. |
| `/tools/webhook-tester` | `SHELL`; `POST /v1/webhook-test` | OK | Sem worker; rota direta **INFERIDA** do router de prod/code. |
| `/tracking` | `SHELL`; ver matriz das 22 subseções abaixo | MIGRATION_PENDENTE | Todos os GETs de tracking **CONFIRMADOS**; 071 falta e Explodely não está funcional. |
| `/tracking/google-callback` | `POST /v1/offers/{id}/tracking/google-ads/destinations/{dest}/oauth/complete` | OK | Migrations 060/061 e endpoints GET Google Ads **CONFIRMADOS**; callback POST **INFERIDO**. |
| `/utmify-geral` | `SHELL`; `GET/PUT /v1/utmify-global`; `PUT /offers`; `POST /test`, `/replay` | OK | GET **CONFIRMADO**; configuração global ativa e 16 rotas explícitas **CONFIRMADAS por SELECT**. |

Fontes de código: rotas em `packages/web/src/app/**/page.tsx`; catálogo em `packages/web/src/lib/tool-catalog.ts:37`; navegação em `packages/web/src/components/hub/nav-config.ts:63`; chamadas em `packages/web/src/lib/api-client.ts:1356`.

## 2. Subseções de Rastreamento (Lote C)

Todas também consomem `GET /v1/offers` pelo contexto de oferta (`tracking-offer-context.tsx:29`).

| Subseção (`view/section`) | Endpoints consumidos | Status prod | Nota |
|---|---|---|---|
| `overview/summary` | `GET /offers/{id}/tracking`; `GET /tracking/overview` | MIGRATION_PENDENTE | GETs **CONFIRMADOS**; funciona hoje, mas 071 afeta escala. |
| `overview/alerts` | `GET /offers/{id}/tracking` | OK | **CONFIRMADO**. |
| `journey/live` | `GET .../summary`, `/events`, `/orders`, `/meta-deliveries`, `/countries` | MIGRATION_PENDENTE | GETs **CONFIRMADOS**; 071 indexa events/orders. |
| `journey/funnel` | `GET .../summary`, `/page-funnel`, `/journeys` | MIGRATION_PENDENTE | GETs **CONFIRMADOS**; 071 reduz scans por visitor/evento. |
| `journey/attribution` | `GET .../attribution` | OK | **CONFIRMADO**. |
| `journey/entry-links` | `GET .../advanced`; CRUD `/entry-links`; `POST /entry-links/{id}/ab-test` | OK | GET **CONFIRMADO**; mutações **INFERIDAS**. |
| `journey/ab-tests` | `GET .../advanced`, `/ab-tests/{id}/metrics`; CRUD/control `/ab-tests` | OK | GETs **CONFIRMADOS**. |
| `upsell-intelligence/upsell-intelligence` | `GET .../upsells`, `/upsell-identities`; CRUD stages; reconcile/recover; `PUT .../result`; `GET /v1/u/{slug}/check` | OK | Migration local 069 e seus 6 índices **CONFIRMADOS** em prod; 24 stages e 1.199 identities, sem PII exposta. |
| `capture/code-pixels` | `GET .../tracking`, `/summary`, `/meta-pixels`, `/product-kinds`; setup e CRUD/testes Meta | OK | GETs/tabelas **CONFIRMADOS**. |
| `capture/domains` | `GET .../advanced`; CRUD `/domains` e verify | OK | GET/tabela **CONFIRMADOS**. |
| `destinations/meta` | `GET .../tracking`, `/advanced`, `/meta-deliveries`, `/meta-pixels`; replay/reconcile/rules/test | OK | GETs/tabelas **CONFIRMADOS**; meta worker sem erro de start. |
| `destinations/tiktok-ads` | `GET .../tracking`, `/tiktok/destinations`, `/tiktok/deliveries/{id}`; CRUD/test | OK | GETs/tabelas **CONFIRMADOS**; fila/worker **INFERIDOS ativos**. |
| `destinations/utmify` | `GET .../tracking`, `/utmify-{destination,pixel,web-events,deliveries}`, `/product-kinds`; saves/retries/reconcile/test | OK | GETs/tabelas **CONFIRMADOS**; delivery/web-event workers sem erro de start. |
| `destinations/google-ads` | `GET .../google-ads/{connection-status,destinations,oauth/accounts}`; OAuth/attach/test/CRUD | OK | GETs e migrations 060/061 **CONFIRMADOS**. |
| `destinations/vturb` | `GET .../advanced`, `/vturb/players`, `/vturb/analytics`; `PATCH /vturb` | OK | GETs e tabelas **CONFIRMADOS**. |
| `destinations/pushcut` | `GET .../pushcut-{destinations,deliveries}`; CRUD/test/retry/resend | OK | GETs/tabela **CONFIRMADOS**; worker **INFERIDO ativo**. |
| `finance/payments` | `GET .../tracking`, `/advanced`, `/vendepay/receipts`; gateway/VendePay mutations | **MISSING / MIGRATION_PENDENTE / ENV_FALTA** | VendePay/Paysight existem. Explodely da UI local não: receiver ausente em prod, migration 070 e 2 envs faltam. |
| `finance/refunds` | `GET /v1/tracking/refunds-dashboard` | OK | **CONFIRMADO**. |
| `finance/fees` | `GET/PATCH .../fee-settings` | OK | GET/tabela **CONFIRMADOS**. |
| `finance/health` | `GET .../health`; `POST .../health/alerts/{id}` | OK | GET/tabela **CONFIRMADOS**. |
| `finance/console` | mesmos GETs de `journey/live` | MIGRATION_PENDENTE | Funciona; 071 pendente para volume. |
| `finance/help` | `GET .../diagnostics`, `/tracking`, `/advanced`, `/vendepay/receipts` | OK | GETs **CONFIRMADOS**. |

O roteamento das 22 seções está em `packages/web/src/components/tracking/tracking-nav.ts:29`; os adapters ficam em `packages/web/src/components/tracking/sections/*`; os hooks compartilhados estão em `tracking-section-content.tsx:881`, `tracking-live-console.tsx:74` e `tracking-panel.tsx:36`.

## 3. Tool catalog (Lote D)

| Ferramenta | Rotas/fila/worker | Status prod | Evidência |
|---|---|---|---|
| Page Cloner | `/inspect`, `/clones*`; `render-queue`, `bundle-queue` | OK | Clone GET/OpenAPI + readiness Chromium/S3/Redis **CONFIRMADOS**; workers no processo API **INFERIDOS ativos**. |
| VSL Downloader | `/vsl-jobs*`; `vsl-queue` | OK | GET **CONFIRMADO**; worker **INFERIDO ativo**. |
| Upsell Analyzer | nenhum backend próprio | OK | Feature client-side; não depende de fila. |
| Webhook Tester | `POST /webhook-test`; sem fila | OK | Registro no router/código **INFERIDO**; não foi disparado por regra. |
| Funnel Full Clone | `/funnel-jobs*`; `funnel-queue` | OK | GET **CONFIRMADO**; worker **INFERIDO ativo**. |
| Video Studio | `/media-jobs*`, `/shield-jobs*`, `/niches*`; `media-queue`, `shield-queue` | OK | GETs + infra ready **CONFIRMADOS**; workers **INFERIDOS ativos**. |
| VSL Transcriber | nenhum | OK | Card explicitamente `disabled: true`/“Em breve”; não é feature navegável. |

Os workers de ferramentas não são serviços Railway separados: o código os inicia dentro da própria API (`packages/api/src/server.ts:325`). Produção tem somente web, API, Redis e Postgres, todos `SUCCESS`. Não houve log `worker did not start`/erro dos workers consultados; isso sustenta **INFERIDO ativo**, não heartbeat direto de cada consumer.

## 4. Reality checks especiais

### Explodely receiver

- **CONFIRMADO MISSING:** `GET /v1/webhooks/explodely` devolveu 404; como o receiver é POST-only isso isoladamente não prova ausência, mas o conjunto fecha o diagnóstico: o commit local da feature não está no `origin/main`, o schema 070 não existe em prod e não há as colunas/índices que o handler usa.
- **CONFIRMADO migration pendente:** o ledger não contém `070_explodely_gateway.sql`. As colunas `gateway`, `transaction_id`, `raw_payload`, `content_type` não existem nos receipts e os dois FKs continuam `NOT NULL`.
- **CONFIRMADO env faltando:** `EXPLODELY_REQUIRE_SIGNATURE` e `EXPLODELY_WEBHOOK_SECRET` não existem no serviço API. O default local exige assinatura; sem secret, o handler retorna 503 antes de processar (`packages/api/src/routes/webhooks-explodely.ts:95`).
- **CONFIRMADO worker ausente em prod:** `explodely-webhook-queue`/consumer foram adicionados no código local (`server.ts:19`, `server.ts:67`), mas esse backend ainda não foi publicado. Não há serviço adicional a criar: após deploy correto ele roda embutido na API.

### Índices 071

- **CONFIRMADO pendente:** ledger sem `071_tracking_perf_indices.sql` e nenhum dos índices `idx_tracking_events_project_event_received`, `idx_tracking_events_project_visitor_received`, `idx_tracking_orders_project_visitor_occurred` existe.
- Impacto: sem 404/500 imediato, mas risco real de lentidão; prod tem **931.399 eventos** e **10.070 pedidos**. DDL local em `packages/api/migrations/071_tracking_perf_indices.sql:5`.

### Upsell Intelligence / migration 069

- **CONFIRMADO OK:** ledger contém `069_upsell_intelligence_performance.sql` (2026-10-05) e os seis índices dessa migration existem.
- **CONFIRMADO com dados:** 24 stages e 1.199 identities em prod. Os GETs `/tracking/upsells` e `/tracking/upsell-identities` retornaram 401, confirmando rotas protegidas registradas.

### VendePay dedup

- **CONFIRMADO:** não há duplicação estrutural no banco entre `vendepay_connections` e `tracking_gateway_connections(provider='vendepay')`: zero projetos têm as duas superfícies ativas.
- **INFERIDO/RELEASE:** a duplicação visível é front-end. O fix local filtra VendePay do array genérico em `packages/api/src/routes/tracking-advanced.ts:33` e o commit de UI não está no `origin/main`; por isso a UI atual de prod ainda pode duplicar, enquanto a UI nova local não.

### UTMify Global

- **CONFIRMADO OK:** endpoint canônico `GET /v1/utmify-global` está registrado (401 sem JWT).
- **CONFIRMADO com dados:** existe 1 destino global ativo e 16 linhas de roteamento explícito em `tracking_utmify_global_offer_routes`. Migration 068 está aplicada.

### Nova sidebar/nav

- **OK / puro front:** a nova taxonomia de seis áreas-raiz não cria dependência de backend (`packages/web/src/components/hub/nav-config.ts:40`).

### Backend sem UI

- **Nenhuma feature órfã ativa confirmada** no escopo do catálogo/nav novo. `shield-jobs` parece legado, mas ainda é renderizado no histórico do Video Studio.
- `page-diff.ts` e `digi-audits.ts` existem como arquivos de backend, porém não são registrados em `routes/index.ts`; as páginas correspondentes só redirecionam. Portanto são código morto/incompleto, não backend acessível em prod.

## 5. GAPS a resolver antes do push

### Migrations a aplicar/validar (2)

1. `070_explodely_gateway.sql` — **CONFIRMADO ausente**.
2. `071_tracking_perf_indices.sql` — **CONFIRMADO ausente**.

Observação importante: o ledger de prod já tem outros arquivos chamados `070_repair_vendepay_lifecycle_labels.sql`, `071_rws_ttk_explodely_vendepay_compat.sql` e `072_vturb_comparison_groups.sql`. O runner usa o **nome completo**, então os arquivos locais ainda serão considerados pendentes. Não confundir “número existente” com “migration aplicada”.

### Env vars a setar (3)

1. `JWT_SECRET` — **CONFIRMADO ausente e bloqueante**. O parser do código atual, executado com os nomes/variáveis de prod, encerrou com `JWT_SECRET: Required` (`packages/api/src/env.ts:44`).
2. `EXPLODELY_REQUIRE_SIGNATURE` — **CONFIRMADO ausente**; setar explicitamente conforme a política de produção, apesar do default seguro `true`.
3. `EXPLODELY_WEBHOOK_SECRET` — **CONFIRMADO ausente**; necessário quando assinatura é exigida.

Nunca registrar os valores. `.env.example` hoje também omite `JWT_SECRET`, apesar de ele ser obrigatório — documentação de deploy está incompleta.

### Workers a iniciar (1 ausente hoje; 0 serviços novos)

- Explodely consumer não está no backend publicado. Ele será iniciado automaticamente no processo API pelo código local; não criar um quinto serviço Railway apenas para esta entrega.
- Render, bundle, VSL, funnel, shield, media, Meta, UTMify, Pushcut e TikTok: nenhum erro de inicialização encontrado. Estado **INFERIDO ativo**, porque não foi feito heartbeat invasivo nem escrita de job.

### Rota UI que falhará em prod

- **Explodely em `Rastreamento → Financeiro → Gateways e webhooks`**: hoje a produção não suporta o receiver. Se somente a UI for publicada, a criação/uso Explodely ficará sem backend completo; se a API local for publicada sem env/migration, o receiver tende a 503/500.
- Não foi identificada outra rota da UI nova com GET 404/500: todos os 67 GETs do cliente foram reconhecidos por produção.

### Ordem segura de release (sem executar nesta auditoria)

1. Provisionar `JWT_SECRET` e os dois envs Explodely.
2. Validar/aplicar 070 e 071 (ou deixar o startup runner aplicar, com rollback/observação preparado).
3. Publicar API e confirmar `/readyz`, receiver e consumer Explodely.
4. Publicar web; então validar finance/payments, tool catalog e navegação.

O `start` da API executa migrations **antes** de carregar o servidor (`packages/api/package.json:10`). Com `JWT_SECRET` ausente, um deploy pode aplicar DDL e depois derrubar o processo; por isso env vem primeiro.

## 6. Evidência e limites

### CONFIRMADO via Railway

- Serviços `@page-cloner/web`, `@page-cloner/api`, Redis e Postgres: deployments `SUCCESS`.
- `/healthz` e `/readyz`: 200; Redis/Postgres/S3/Chromium OK.
- 67 GETs do cliente: 66×401 (rota protegida existente), 1×404 esperado para convite fictício.
- Ledger, tabelas, colunas, índices e contagens citados acima: SELECT real, sem retornar nomes de clientes, compradores, e-mails, tokens ou payloads.
- Variáveis: somente presença/ausência; nenhum valor foi lido para o relatório.
- `origin/main` aponta para o commit atualmente publicado no web; o branch local está à frente e contém Explodely/071/JWT hardening ainda não publicados.

### INFERIDO do código (por regra de segurança)

- 118 operações não-GET não foram disparadas em produção.
- Workers embutidos foram inferidos por construção no startup, readiness e ausência de erro de inicialização; a consulta direta de heartbeat do Redis público expirou e não foi repetida.
- Não foi lido JWT de navegador/usuário; portanto não se inspecionaram corpos autenticados. A existência dos GETs foi validada pelo roteamento 401 e os dados críticos pelo banco.

### Arquivos-chave

- `packages/web/src/components/hub/nav-config.ts:40` — seis áreas e módulos ocultos.
- `packages/web/src/components/tracking/tracking-nav.ts:29` — 22 subseções.
- `packages/web/src/lib/tool-catalog.ts:37` — catálogo de ferramentas.
- `packages/web/src/lib/api-client.ts:1356` — contratos HTTP.
- `packages/api/src/routes/index.ts:69` — registro real de rotas.
- `packages/api/src/server.ts:325` — workers no processo da API.
- `packages/api/scripts/migrate.mjs:15` — ledger por nome completo.
- `packages/api/migrations/069_upsell_intelligence_performance.sql:4`, `070_explodely_gateway.sql:4`, `071_tracking_perf_indices.sql:5` — DDL auditada.
- `packages/api/src/env.ts:40` — requisitos de env atuais.

Backend reality check: 35 rotas, 185 endpoints, 7 gaps (2 migrações pendentes / 3 env vars faltando / 1 worker inativo / 1 UI sem backend); relatório em AUDIT/BACKEND/01-reality-check.md
