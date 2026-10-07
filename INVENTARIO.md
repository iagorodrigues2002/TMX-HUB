# Inventário técnico — TMX HUB

Levantamento estático do commit `c1e4ff2630db0fffe62094ad91572d3712a0e7e2`, sem execução de testes e sem operações em produção/Railway.

## Metadados do repositório

- Repositório: `https://github.com/iagorodrigues2002/TMX-HUB.git`
- Branch default: `main` (confirmada por `git remote show origin`).
- Último commit: `c1e4ff2630db0fffe62094ad91572d3712a0e7e2` — `fix: show full upsell purchase history` — 2026-10-05 16:52:04 -03:00 — iagorodrigues2002.
- Total de commits em `HEAD`: **484** (`git rev-list --count HEAD`).

## A) Estrutura de topo

O repositório é um **monorepo pnpm**, confirmado por `pnpm-workspace.yaml:1-2` (`packages/*`) e pelos pacotes abaixo. Não há `turbo.json`, `nx.json` ou `lerna.json`; o `package.json` raiz não declara `workspaces`, pois o workspace é configurado pelo arquivo pnpm.

Conteúdo da raiz observado com `ls -la`:

```text
.claude/  .dockerignore  .env.example  .env.production.example  .git/
.gitignore  .nvmrc  CLAUDE.md  DESIGN.md  PRODUCT.md  README.md
biome.json  docker-compose.yml  docs/  package.json  packages/
pnpm-lock.yaml  pnpm-workspace.yaml  tsconfig.base.json
```

Pacotes:

- `packages/api` — API Fastify, filas/workers, integrações e migrations.
- `packages/web` — frontend Next.js.
- `packages/core` — lógica de clonagem, extração, sanitização e assets.
- `packages/shared` — schemas e tipos compartilhados.

## B) Backend (`packages/api`)

### Inicialização

- Entry point: `packages/api/src/server.ts`. `buildApp()` cria o Fastify em `server.ts:35-41`; plugins e rotas são registrados em `server.ts:45-54`; `main()` começa em `server.ts:59-60`.
- Todas as rotas funcionais, exceto health checks, são agrupadas sob `/v1` em `packages/api/src/routes/index.ts:72-129`. As rotas públicas incluem preview e tracking (`index.ts:78-82`); as demais passam por autenticação (`index.ts:83-126`).

### Arquivos de rota registrados e responsabilidade

- `routes/health.ts` — `/healthz` e `/readyz`.
- `routes/auth.ts` — login, registro, convites e usuário atual.
- `routes/preview.ts` — preview público de clone.
- `routes/tracking-public.ts` — tracker JS, bootstrap, eventos, A/B, redirects/cliques, CTA, upsell e webhooks de pagamento.
- `routes/activity.ts` — feed de atividade.
- `routes/clones.ts` — cria, consulta e remove jobs de clonagem.
- `routes/inspect.ts` — inspeciona uma página/URL.
- `routes/forms.ts` — lista e altera formulários de clones.
- `routes/links.ts` — lista, altera e atualiza links em lote.
- `routes/builds.ts` — dispara build e consulta seu estado.
- `routes/vsl-jobs.ts` — cria jobs de VSL.
- `routes/webhook-test.ts` — testa webhooks informados pelo operador.
- `routes/funnel-jobs.ts` — cria jobs de clonagem de funil.
- `routes/offers.ts` — lista/cria ofertas e operações associadas.
- `routes/tracking-admin.ts` — administração e diagnóstico detalhado do tracking por oferta.
- `routes/google-ads-admin.ts` — destinos/rascunhos administrativos de Google Ads.
- `routes/google-ads-oauth.ts` — fluxo OAuth e conexões Google Ads.
- `routes/tiktok-ads-admin.ts` — destinos e testes do TikTok Events API.
- `routes/tracking-advanced.ts` — domínios, gateways, regras Meta, testes A/B, links de entrada e VTurb.
- `routes/tracking-overview.ts` — visão consolidada de tracking e finanças.
- `routes/refunds-dashboard.ts` — dashboard de reembolsos/chargebacks.
- `routes/niches.ts` — cadastro/listagem de nichos.
- `routes/shield-jobs.ts` — jobs de video shield e download em lote.
- `routes/media-jobs.ts` — jobs de mídia e download em lote.
- `routes/meta-admin.ts` — pixels, credenciais, testes e entregas Meta.
- `routes/meta-control.ts` — conexões, sincronização e controle de contas Meta.
- `routes/utmify-tracking-admin.ts` — configuração e diagnóstico UTMify por oferta.
- `routes/utmify-global-admin.ts` — dashboard/roteamento UTMify global, teste e replay.
- `routes/pushcut-admin.ts` — destinos e testes Pushcut.
- `routes/recovery-admin.ts` — recuperação de vendas, e-mail/Resend e automações.
- `routes/users.ts` — senhas, usuários e visão administrativa.

Arquivos presentes mas **não registrados** por `routes/index.ts`: `routes/digi-audits.ts` e `routes/page-diff.ts`; portanto sua exposição HTTP atual não está confirmada.

### Rotas-chave do briefing

- `GET /v1/c/:slug` — confirmada em `routes/tracking-public.ts:686`; resolve link de entrada/clique.
- `GET /v1/track/t.js?key=...` — confirmada em `routes/tracking-public.ts:530-565`; valida projeto, carrega pixels Meta/TikTok e VTurb e serve JavaScript sem cache.
- `GET /v1/link/:testId` — confirmada em `routes/tracking-public.ts:1033`; usa o mesmo handler de redirect A/B de `/v1/r/:testId` (`tracking-public.ts:1032-1033`).

### Redis, filas e workers

- Stack: `bullmq` e `ioredis`, declarados em `packages/api/package.json:29-31`.
- O plugin cria uma conexão Redis e filas dedicadas em `src/plugins/queue.ts:48-88`.
- Filas/workers confirmados: render, bundle, VSL, funnel, shield, media, Meta CAPI, UTMify delivery, UTMify web event, Pushcut e TikTok (`plugins/queue.ts:65-88`; `src/workers/*.worker.ts`).
- O servidor inicia workers em `server.ts:18-28` e a recuperação de filas/outbox em `server.ts:61-149`.

### Webhooks e integrações

- Gateways receptores confirmados: VendePay (`POST /v1/webhooks/vendepay`, `tracking-public.ts:1337`) e Paysight (`POST /v1/webhooks/paysight`, `tracking-public.ts:1888-1917`). Há replay de quarentena VendePay em `tracking-public.ts:2008`.
- O modelo administrativo também aceita `cooud` em `tracking-advanced.ts:46-47`, mas um receptor webhook Cooud não foi confirmado.
- Stripe, Mercado Pago, Pagar.me, Hotmart, Kiwify e Cakto: **não confirmados como integrações de gateway**. Hotmart/Kiwify aparecem apenas na detecção de links de checkout do tracker (`services/tracker-script.ts:3`), não como webhooks receptores.
- Destinos confirmados: Meta Conversions API/CAPI (`workers/meta.worker.ts`), TikTok Events API (`workers/tiktok.worker.ts`), UTMify Orders/Web Events (`workers/utmify-delivery.worker.ts`, `workers/utmify-web-event.worker.ts`) e Google Ads em estágio de credenciais/rascunho. A entrega Google Ads está explicitamente desabilitada por `GOOGLE_ADS_DELIVERY_ENABLED = false` em `integrations/google-ads/contracts.ts:12`.

## C) Frontend (`packages/web`)

- Next.js: `^15.0.4` (`packages/web/package.json:30`), React `^19.0.0`.
- Usa App Router em `packages/web/src/app/`; não há pasta `pages/`.
- Páginas de oferta: `src/app/ofertas/page.tsx` (lista) e `src/app/ofertas/[id]/page.tsx` (detalhe).
- O detalhe mostra métricas por oferta como vendas, receita, gasto, Initiate Checkout, CPA, taxa de conversão, ROAS e cliques (`ofertas/[id]/page.tsx:59-102`, `170-236`, `453-629`).
- Há ainda visão geral por oferta em `src/components/tracking/tracking-overview-dashboard.tsx:238-275` e KPIs de tracking em `src/components/tracking/tracker-kpi-row.tsx:20-52`.

## D) Database

- Banco: PostgreSQL, acessado pela biblioteca `postgres` (`packages/api/package.json:36`).
- Sistema de migrations: runner próprio `packages/api/scripts/migrate.mjs`; mantém ledger em `app_schema_migrations` (`migrate.mjs:87-92`) e aplica cada SQL em transação (`migrate.mjs:111-124`).
- Total: **69 migrations**, de `001_tracking_foundation.sql` a `069_upsell_intelligence_performance.sql` (`migrate.mjs:15-85`).
- Diretório: `packages/api/migrations/`.

Tabelas criadas pelas migrations (nomes estáticos encontrados em `CREATE TABLE IF NOT EXISTS`):

```text
tracking_projects, tracking_events, tracking_orders, tracking_visitors,
tracking_sessions, tracking_domains, tracking_entry_links, tracking_ab_tests,
tracking_ab_variants, tracking_ab_assignments, tracking_delivery_outbox,
tracking_utmify_destinations, tracking_utmify_global_offer_routes,
tracking_utmify_web_events, tracking_tiktok_destinations,
tracking_tiktok_deliveries, tracking_google_ads_destinations,
tracking_google_ads_credentials, tracking_google_ads_oauth_states,
tracking_google_ads_oauth_connections, tracking_pushcut_destinations,
tracking_fee_settings, tracking_product_kinds, tracking_health_alerts,
tracking_meta_rules, tracking_gateway_connections,
tracking_gateway_webhook_receipts, tracking_upsell_stages,
tracking_upsell_identities, tracking_upsell_redirects,
tracking_upsell_manual_test_results, vendepay_connections, webhook_receipts,
meta_pixels, meta_deliveries, meta_pixel_products, meta_marketing_connections,
meta_ad_accounts, meta_ad_campaigns, meta_ad_account_snapshots,
meta_account_offer_history, vturb_integrations, vturb_deliveries,
recovery_settings, recovery_channels, recovery_opportunities,
recovery_messages, recovery_message_events, recovery_test_runs,
recovery_test_events, exchange_rate_cache
```

Há também a tabela histórica `tracking_upsell_manual_restore_20260822` criada por migration e o ledger `app_schema_migrations` criado pelo runner.

### Chaves de isolamento

- `offer_id`: `tracking_projects.offer_id` é `NOT NULL UNIQUE` em `migrations/001_tracking_foundation.sql:1-4`, ligando a oferta ao projeto de tracking.
- `project_id`: é a chave de isolamento recorrente nas tabelas de tracking. Exemplos: `tracking_events` (`001:19-32`), `tracking_orders` (`001:50-64`), visitors/sessions/outbox (`004:8-70`), testes A/B (`003:30-61`) e destinos TikTok (`062:4-37`).
- Conclusão: **confirmado** que `offer_id` isola o projeto na raiz e `project_id` propaga o isolamento nas entidades de tracking. Nem toda tabela usa ambas as colunas; tabelas filhas especializadas podem isolar via FK intermediária.
- Não existem tabelas literais `offer`, `ad_click`, `page_view` ou `sale`; ofertas ficam associadas a `tracking_projects`, cliques/PageView são eventos em `tracking_events`, e vendas ficam em `tracking_orders`.

## E) Infraestrutura

- `docker-compose.yml` na raiz.
- `packages/api/Dockerfile`.
- `packages/web/Dockerfile`.
- Não encontrados: `railway.json`, `railway.toml`, `nixpacks.toml` ou `.railway/`.
- CI: `.github/workflows/` **não encontrado**.

Variáveis em `.env.example` (somente nomes):

```text
API_PORT
API_HOST
LOG_LEVEL
REDIS_URL
DATABASE_URL
TRACKING_ENCRYPTION_KEY
META_GRAPH_API_VERSION
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_FORCE_PATH_STYLE
MAX_RENDER_TIMEOUT_MS
MAX_ASSET_BYTES
MAX_TOTAL_BYTES
BROWSER_POOL_SIZE
WEBHOOK_SECRET
PUBLIC_BASE_URL
NEXT_PUBLIC_API_URL
```

Observação: `.env.production.example` também existe, mas seus valores não foram reproduzidos neste inventário.

## F) Testes

- Framework de testes: **Vitest** (`package.json:25`; scripts em `packages/api/package.json:12-13`, `packages/core/package.json:18-19`, `packages/shared/package.json:13`).
- Playwright e `playwright-extra` são dependências de automação/browser da API e do core, não foi encontrada suíte Playwright com arquivos `*.spec.*`.
- Jest: não encontrado.
- Pastas de teste: `packages/api/test/`, `packages/core/test/`, `packages/shared/test/`.
- Arquivos: 22 testes na API, 5 no core e 2 no shared (**29 arquivos `*.test.ts`**).
- Testes não foram executados, conforme solicitado.

## G) Script do tracker (crítico para P0)

- Endpoint servidor: `packages/api/src/routes/tracking-public.ts:530-565` (`GET /v1/track/t.js`).
- Gerador principal: `packages/api/src/services/tracker-script.ts:1-4`, função `buildTrackerScript()`.
- Fluxo-chave (todo o script principal está minificado em uma template string na linha 3):
  - define `I=/v1/track/bootstrap` e `A=/v1/track/ab/assign`;
  - define `pageView=()=>send('PageView', ...)`;
  - executa `fetch(I)` para bootstrap;
  - no sucesso, espera `fetch(A)` para atribuição A/B e só então chama `pageView()`;
  - em falha do bootstrap (ou de qualquer etapa encadeada), `.catch(pageView)` dispara PageView como fallback;
  - mudanças SPA (`pushState`, `replaceState`, `popstate`) também chamam `pageView()` posteriormente.
- `XMLHttpRequest`: não encontrado no gerador; o transporte usa `navigator.sendBeacon` e fallback `fetch()`.
- Resposta à pergunta crítica: **o PageView inicial depende de bootstrap e A/B no caminho de sucesso; não é disparado incondicionalmente antes deles.** Contudo, falha no encadeamento aciona PageView via `.catch(pageView)`. Portanto, `tracker depende de bootstrap=sim` para a ordem normal, mas há fallback tolerante a falha.

## Observações do investigador

- O comentário em `server.ts:30-33` diz que autenticação era ignorada no MVP, mas o roteador atual aplica `requireAuth` às rotas protegidas (`routes/index.ts:83-98`); o comentário parece desatualizado.
- `digi-audits.ts` e `page-diff.ts` existem, porém não aparecem no registro central de rotas; podem ser código órfão ou funcionalidade temporariamente desativada.
- Google Ads possui schema, OAuth e UI administrativa, mas a entrega está explicitamente desabilitada; não deve ser tratada como destino operacional completo.
- O tracker faz o PageView aguardar duas chamadas de rede em série (bootstrap e A/B) no caminho normal; isso pode atrasar ou perder PageView se a página navegar cedo, embora o fallback cubra rejeições.
- O repositório não contém configuração Railway versionada nem workflows de CI; o modo real de deploy/CI não está confirmado a partir deste checkout.
- A cobertura deste inventário é estática no commit informado; comportamento de serviços externos, banco implantado e configurações de produção não foi verificado.
