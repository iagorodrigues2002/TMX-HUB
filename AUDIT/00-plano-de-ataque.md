# Plano de Ataque — Consolidação de Segurança TMX HUB

> **Gerado em:** 2026-10-06 · **Read-only** — nenhum código foi alterado neste documento
> **Fontes:** `AUDIT/01-multitenant-bola-bfla.md`, `AUDIT/02-webhooks-segredos-env.md`, `AUDIT/03-destinos-pii-lgpd.md`
> **Score bruto:** 33 findings → **29 únicos** após dedup de 4 duplicatas

---

## 1. Resumo executivo

33 findings identificados em 3 fatias de auditoria. Após eliminação de 4 duplicatas por causa raiz, restam **29 itens únicos**: 2 CRIT / 11 HIGH / 12 MED / 4 LOW, distribuídos em 7 fases.

**Dois riscos críticos ativos agora:** (1) qualquer manager de oferta pode listar, anexar e usar o refresh token OAuth Google de outro tenant — sem elevar privilégios, apenas com acesso autenticado ao painel; (2) um manager pode apontar o worker UTMify para host controlado por ele e receber token decriptado + PII de compradores.

**Risco de infraestrutura imediato:** produção não possui `JWT_SECRET` configurado no Railway, caindo no fallback público `dev-jwt-secret-change-me-in-production` — essa mesma chave assina JWTs e cifra credenciais UTMify/IA armazenadas no Redis.

**Sunsets externos urgentes:** TikTok Events API 1.0 (endpoint atual `/pixel/track/`) teve sunset anunciado para H2 2024 — já passou. Google Ads v22 tem sunset previsto para outubro de 2026 — este mês.

**Dedup realizado:**

| Colapsado | Canônico | Motivo |
|-----------|----------|--------|
| SEC-A-001 | **SEC-C-002** (CRIT) | Mesmos arquivos/linhas, mesma causa raiz; C-002 mais completo |
| SEC-B-001 + SEC-B-002 | **SEC-C-004** (HIGH) | C-004 cobre os dois gateways (VendePay + Paysight) |
| SEC-B-006 | **SEC-C-008** (HIGH) | C-008 é superset; inclui mais tabelas além de `webhook_receipts` e `tracking_orders` |

---

## 2. TOP 5 para fazer HOJE

| # | Finding | Sev | Esforço | Razão impacto/esforço |
|---|---------|-----|---------|----------------------|
| 1 | **SEC-B-003** — JWT_SECRET obrigatório | HIGH | 15 min | Fecha forja de JWT offline + comprometimento de toda cifra Redis; zero dependência |
| 2 | **SEC-A-006** — `/v1/tracking` no TOOL_PATH_MAP | MED | 5 min | 1 linha fecha BFLA de dashboards financeiros para usuários sem a ferramenta |
| 3 | **SEC-C-001** — Allowlist UTMify (SSRF) | CRIT | 1 h | Fecha exfiltração de token + PII; fix em Zod schema + worker |
| 4 | **SEC-C-002** — OAuth Google Ads: ownership obrigatório | CRIT | 2–4 h | Fecha cross-tenant de refresh token; requer migration + filtro |
| 5 | **SEC-C-005** — TikTok Events API 1.0 → 2.0 | HIGH | 2–4 h | Sunset já passou (H2 2024); compras podem parar de ser contabilizadas |

---

## 3. Fases de Ataque

### FASE 0 — Hotfix cross-cutting
> Fixes de 1–3 linhas sem dependência de migration. Executar em paralelo em menos de 1 hora.

---

#### Fase 0 · Item 1

- **Finding canônico:** SEC-B-003 — JWT_SECRET público e previsível em produção
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/env.ts:40-47` · `packages/api/src/plugins/auth.ts:59-78` · `packages/api/src/services/offer-store.ts:100-107,279-313,501-520`
- **Patch strategy:** Mudar o `default` de `JWT_SECRET` de `'dev-jwt-secret-change-me-in-production'` para `undefined`. Adicionar guard em `env.ts`: `if (process.env.NODE_ENV === 'production' && !JWT_SECRET) throw new Error('JWT_SECRET required in production')`. Criar variável `OFFER_STORE_ENCRYPTION_KEY` separada (também obrigatória) para que a chave de JWT não duplique como chave de cifragem AES do `OfferStore`. Atualizar `.env.example` com ambos os nomes.
- **Tipo:** código puro + infra (Railway: criar as duas variáveis)
- **Esforço:** 15 min
- **Risco de regressão:** Baixo — a API simplesmente não sobe sem a variável; força ação consciente antes do deploy.
- **Teste:** boot com `NODE_ENV=production` sem `JWT_SECRET` deve lançar exceção no startup; com valor de ≥32 bytes deve subir normalmente.
- **Pré-requisitos:** humano cria as variáveis no Railway antes do deploy (ver Ação H1)

---

#### Fase 0 · Item 2

- **Finding canônico:** SEC-A-006 — Gate de ferramentas não cobre `/v1/tracking`
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/routes/index.ts:93-94`
- **Patch strategy:** Adicionar `'/v1/tracking': 'ofertas'` (ou capability `tracking` separada) ao `TOOL_PATH_MAP`. Se tracking for uma ferramenta separável de `ofertas`, criar o token corretamente; caso contrário a adição de uma linha é suficiente.
- **Tipo:** código puro
- **Esforço:** 5 min
- **Risco de regressão:** Médio — usuários com JWT antigo sem `ofertas` no campo `tools` perdem acesso imediato; verificar se há JWTs em circulação sem a ferramenta antes de subir.
- **Teste:** JWT sem `ofertas` deve receber 403 em `GET /v1/tracking/overview`; JWT com `ofertas` continua passando normalmente.
- **Pré-requisitos:** confirmar que nenhum usuário ativo acessa tracking sem a ferramenta `ofertas`

---

#### Fase 0 · Item 3

- **Finding canônico:** SEC-A-005 — Idempotency-Key de clone é global (vazamento cross-tenant por colisão)
- **IDs correlatos:** amplificado por SEC-A-002
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/routes/clones.ts:90,100,108` · `packages/api/src/services/job-store.ts:15,168`
- **Patch strategy:** Alterar a chave Redis de `idem:<header>` para `idem:<userId>:<header>`. Incluir `userId` no valor armazenado e, no hit de cache, rejeitar com 409 se o owner não corresponde ao chamador.
- **Tipo:** código puro
- **Esforço:** 30 min
- **Risco de regressão:** Baixo — apenas muda o namespace; idem-keys existentes expiram por TTL natural.
- **Teste:** mesma Idempotency-Key enviada por dois usuários distintos com mesmo body deve ser tratada como primeira criação para cada um.
- **Pré-requisitos:** pode ser implementado em paralelo com Fase 1 · Item 4 (SEC-A-002)

---

#### Fase 0 · Item 4

- **Finding canônico:** SEC-B-009 — URL completa de callback gravada em logs
- **IDs correlatos:** SEC-C-011 (redaction parcial, coberto completamente na Fase 5 · Item 2)
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/lib/logger.ts:6-19` · `packages/api/src/services/webhook.ts:15-40`
- **Patch strategy:** Adicionar `'webhook'`, `'webhookUrl'`, `'*.webhook'`, `'*.webhookUrl'`, `'*.token'`, `'*.access_token'` à lista de paths de redaction do pino. Em `webhook.ts`, substituir `logger.child({ webhook: webhookUrl })` por `logger.child({ webhook_host: new URL(webhookUrl).hostname })`.
- **Tipo:** código puro
- **Esforço:** 20 min
- **Risco de regressão:** Baixo — apenas reduz o que é logado.
- **Teste:** chamar `webhook.ts` com URL contendo `?token=abc` e verificar que o log não contém `abc`.
- **Pré-requisitos:** —

---

#### Fase 0 · Item 5

- **Finding canônico:** SEC-B-013 — E-mail do admin bootstrap logado em claro
- **IDs correlatos:** —
- **Severidade:** LOW
- **Arquivo:linha:** `packages/api/src/plugins/auth.ts:39-53`
- **Patch strategy:** Substituir `{ email: env.ADMIN_EMAIL }` por `{ email_domain: env.ADMIN_EMAIL.split('@')[1] }` no log de bootstrap.
- **Tipo:** código puro
- **Esforço:** 5 min
- **Risco de regressão:** Nenhum.
- **Teste:** log de inicialização não contém o endereço de e-mail completo.
- **Pré-requisitos:** —

---

### FASE 1 — Vazamento ativo
> CRITs e HIGHs que estão sangrando dados cross-tenant agora. Prioridade máxima após Fase 0.

---

#### Fase 1 · Item 1

- **Finding canônico:** SEC-C-002 — Conexões OAuth Google globais listáveis e anexáveis entre tenants
- **IDs correlatos:** SEC-A-001 (mesmo finding, perspectiva A)
- **Severidade:** CRITICAL
- **Arquivo:linha:** `packages/api/migrations/061_google_ads_oauth.sql:19-25` · `packages/api/src/routes/google-ads-oauth.ts:28-41` (listagem sem filtro) · `google-ads-oauth.ts:141-155` (attach sem ownership)
- **Patch strategy:** Migration que adiciona coluna `owner_account_id` (FK para a tabela de accounts/users) em `tracking_google_ads_oauth_connections`, preenchida com `connected_by` já existente no backfill. Alterar `GET connection-status` (`oauth.ts:28-41`) para `WHERE owner_account_id = $currentAccountId`. Alterar `POST .../oauth/attach` (`oauth.ts:141-155`) para incluir `AND owner_account_id = $currentAccountId` no `EXISTS`/`UPDATE`. Na listagem, retornar apenas `id` e nome mascarado — nunca o email da identidade Google para usuários que não são o owner. Adicionar testes A→B: attach de conexão alheia deve retornar 404.
- **Tipo:** código + migration
- **Esforço:** 2–4 h
- **Risco de regressão:** Alto — listagem muda para usuários com conexões históricas; migration de backfill pode deixar conexões sem owner se `connected_by` for NULL. Testar em staging antes de produção.
- **Teste:** usuário B tenta listar e anexar conexão criada por A → lista vazia e 404, respectivamente.
- **Pré-requisitos:** ambiente de staging disponível (Ação H9)

---

#### Fase 1 · Item 2

- **Finding canônico:** SEC-C-001 — Endpoint UTMify arbitrário permite SSRF e exfiltra token + PII
- **IDs correlatos:** —
- **Severidade:** CRITICAL
- **Arquivo:linha:** `packages/api/src/routes/utmify-tracking-admin.ts:7-10,30-57` · `packages/api/src/routes/utmify-global-admin.ts:7-13,98-130` · `packages/api/src/workers/utmify-delivery.worker.ts:142-173`
- **Patch strategy:** No schema Zod de criação/edição de destino UTMify, substituir `z.string().url()` por refinamento que extrai o hostname e compara com allowlist estrita de hosts UTMify conhecidos (ex: `['app.utmify.com.br', 'api.utmify.com.br']`). No worker, revalidar o host antes de construir o fetch, usar `redirect: 'manual'` e falhar se a resposta for redirect. Nunca incluir `x-api-token` em request para host fora da allowlist.
- **Tipo:** código puro
- **Esforço:** 1 h
- **Risco de regressão:** Médio — clientes com URL de endpoint UTMify legada fora da allowlist precisarão atualizar o destino.
- **Teste:** salvar URL `http://169.254.169.254/` retorna 422; URL para host arbitrário retorna 422; URL UTMify válida passa.
- **Pré-requisitos:** confirmar hosts válidos do UTMify com o time de produto antes de fixar a allowlist (Ação H6)

---

#### Fase 1 · Item 3

- **Finding canônico:** SEC-C-004 — Webhooks VendePay/Paysight sem HMAC (signing secret ignorado)
- **IDs correlatos:** SEC-B-001 (VendePay) · SEC-B-002 (Paysight)
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/routes/tracking-public.ts:1336-1360` (VendePay) · `tracking-public.ts:1888-1904` (Paysight) · `packages/api/src/routes/tracking-admin.ts:1083-1103` (store VendePay) · `tracking-admin.ts:978-1013` (store Paysight)
- **Patch strategy:** Adicionar plugin Fastify de captura de raw body (`addContentTypeParser` com `parseAs: 'buffer'`) para os dois endpoints de webhook. Antes de parsear: (1) carregar `signing_secret_encrypted` da conexão e decriptar; (2) computar HMAC-SHA256 sobre o raw body; (3) comparar com o header de assinatura do provedor usando `timingSafeEqual`; (4) rejeitar com 401 se header de assinatura estiver ausente quando secret está configurado. Adicionar validação de janela de timestamp e nonce/event ID. Conexões sem secret configurado mantêm o comportamento token-only (retrocompat durante migração).
- **Tipo:** código puro
- **Esforço:** 4–8 h
- **Risco de regressão:** Alto — todos os webhooks ativos param se o Fastify não entregar o raw body corretamente. Testar exaustivamente em staging.
- **Teste:** payload com HMAC correto passa; corpo alterado retorna 401; timestamp expirado retorna 401; conexão sem secret usa fallback token-only.
- **Pré-requisitos:** confirmar esquema de assinatura exato de VendePay e Paysight com documentação de cada provedor (Ação H5)

---

#### Fase 1 · Item 4

- **Finding canônico:** SEC-A-002 — BOLA em família de clones (leitura, mutação, build, download, exclusão)
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/services/job-store.ts:18,70,96` · `packages/api/src/routes/clones.ts:153,169` · `routes/forms.ts:53,80` · `routes/links.ts:54,82,113` · `routes/builds.ts:54,91`
- **Patch strategy:** Adicionar campo `userId` a `CloneMetadata` e `BuildMetadata`. No `POST /clones`, passar `req.user.sub` para `createClone`. Criar helper `assertCloneOwner(id, userId)` que busca o clone, retorna 404 se não existe e 403 se o owner não bate. Aplicar esse helper como primeiro passo em todas as 9 ocorrências listadas. Para builds, validar ownership do clone antes de criar/ler. Registros existentes: marcar como `legacy_no_owner` e bloquear acesso via API até reassociação manual por admin.
- **Tipo:** código puro (store é Redis; sem migration de banco)
- **Esforço:** 4–8 h
- **Risco de regressão:** Médio — clones existentes sem `userId` ficam inacessíveis via API até reassociação.
- **Teste:** criar clone como usuário A; usuário B tenta ler, alterar forms/links, buildar e deletar → todos retornam 404.
- **Pré-requisitos:** —

---

#### Fase 1 · Item 5

- **Finding canônico:** SEC-A-003 — BOLA em jobs VSL e Funnel
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/routes/vsl-jobs.ts:9,32` · `packages/api/src/services/vsl-job-store.ts:12,26` · `routes/funnel-jobs.ts:31,57` · `services/funnel-job-store.ts:13,35`
- **Patch strategy:** Adicionar `userId` aos modelos `VslJobStore` e `FunnelJobStore`. Nos `POST` handlers, passar `req.user.sub` na criação. Nos `GET` handlers, substituir `get(id)` por `getAndAssertOwner(id, req.user.sub)` que retorna 404 se não existe ou se owner não bate.
- **Tipo:** código puro (Redis store)
- **Esforço:** 2–3 h
- **Risco de regressão:** Baixo — jobs existentes sem owner perdem acesso, mas são efêmeros; jobs completados/expirados não são reutilizados.
- **Teste:** criar VSL job como A; B tenta `GET /vsl-jobs/<id-A>` → 404.
- **Pré-requisitos:** —

---

### FASE 2 — Endpoints legados em sunset
> Urgente por deadline externo. Independente de code base das fases anteriores; pode ser paralelizado.

---

#### Fase 2 · Item 1

- **Finding canônico:** SEC-C-005 — TikTok Events API 1.0 com sunset já passado (H2 2024)
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/workers/tiktok.worker.ts:90-97`
- **Patch strategy:** Migrar endpoint de `https://business-api.tiktok.com/open_api/v1.3/pixel/track/` para `https://business-api.tiktok.com/open_api/v1.3/event/track/`. Adaptar o envelope de payload para Events API 2.0: adicionar `event_source`, `event_source_id` e array `data[]`. Preservar `event_id` para deduplicação. Testar com Test Events do TikTok em ambiente não-produtivo antes de subir.
- **Tipo:** código puro
- **Esforço:** 2–4 h
- **Risco de regressão:** Médio — schema muda; payloads mal formatados são rejeitados silenciosamente pelo provedor.
- **Teste:** fixture de payload 2.0 valida schema de resposta; Test Events TikTok confirma aceitação; nenhum literal `/pixel/track/` permanece no código.
- **Pré-requisitos:** —

---

#### Fase 2 · Item 2

- **Finding canônico:** SEC-C-012 — Google Ads fixado em v22 com sunset outubro 2026
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/integrations/google-ads/google-ads-api.ts:46-59`
- **Patch strategy:** Atualizar a versão literal de `/v22` para `/v25` (ou v26 se disponível na data do fix). Verificar breaking changes nas respostas de `searchStream` e `query` usados. Centralizar a versão em uma constante exportável (`GOOGLE_ADS_API_VERSION`) para facilitar upgrades futuros.
- **Tipo:** código puro
- **Esforço:** 1–2 h
- **Risco de regressão:** Médio — mudanças de schema entre v22 e v25 podem quebrar parsing silenciosamente; testar em sandbox.
- **Teste:** sandbox Google Ads com v25 retorna resultados esperados para listagem de contas; nenhum literal `/v22/` permanece no código.
- **Pré-requisitos:** revisar release notes v23, v24, v25 para breaking changes antes do merge (Ação H8)

---

### FASE 3 — Segredos & env
> Maioria requer ação humana antes ou depois do código.

---

#### Fase 3 · Item 1

- **Finding canônico:** SEC-B-010 — Segredos críticos single-slot sem caminho seguro de rotação
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/env.ts:20-66` · `packages/api/src/lib/secret-box.ts:1-20` · `packages/api/src/services/offer-store.ts:100-107,501-520`
- **Patch strategy:** Adicionar suporte a chave dupla (`_CURRENT` + `_PREVIOUS`) para `TRACKING_ENCRYPTION_KEY` e `OFFER_STORE_ENCRYPTION_KEY` (criada em Fase 0 · Item 1). No `secret-box.ts`, tentar decriptar com a chave atual; em caso de falha de auth tag, tentar a chave anterior. Criar job one-shot de re-cifragem que lê registros cifrados com a chave anterior e os re-cifra com a atual. Documentar procedimento de rotação.
- **Tipo:** código + infra (Railway: adicionar variáveis `_PREVIOUS` durante janela de rotação)
- **Esforço:** meio dia
- **Risco de regressão:** Alto — erro na lógica de fallback pode tornar dados ilegíveis. Testar com fixtures cifradas pela chave antiga antes de subir.
- **Teste:** dado cifrado com chave V1 é decriptado quando V1 é `_PREVIOUS` e V2 é `_CURRENT`; dado cifrado com V2 não é decriptado somente com V1.
- **Pré-requisitos:** Fase 0 · Item 1 (separação JWT/cipher key deve estar no ar)

---

#### Fase 3 · Item 2

- **Finding canônico:** SEC-B-008 — Railway project token com poder de mutação de infra exposto na API
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/env.ts:59-62` · `packages/api/src/integrations/railway/domains.ts:15-47,74-94`
- **Patch strategy:** Em `domains.ts`, substituir o UUID hardcoded por leitura de `env.RAILWAY_API_SERVICE_ID` obrigatório (sem fallback). Mapear `RAILWAY_SERVICE_ID` (já existente no Railway) para `RAILWAY_API_SERVICE_ID` ou renomear a variável no código. Criar novo token Railway com escopo mínimo (apenas `customDomain.create` e `customDomain.delete` para o serviço web). **Ação humana:** revogar o token atual e criar o novo antes do deploy.
- **Tipo:** código puro + humano (Railway console)
- **Esforço:** 1 h código + ação humana
- **Risco de regressão:** Médio — se o novo token não tiver permissão correta, criação de custom domain falha silenciosamente.
- **Teste:** criar e deletar um custom domain de teste com o novo token; verificar que operações não relacionadas (criar serviço) são negadas.
- **Pré-requisitos:** Ação H2 (criar novo token antes do deploy)

---

#### Fase 3 · Item 3

- **Finding canônico:** SEC-B-011 — `.env.example` documenta apenas parte do contrato real
- **IDs correlatos:** —
- **Severidade:** LOW
- **Arquivo:linha:** `.env.example:1-31` · `packages/api/src/env.ts:10-67`
- **Patch strategy:** Regenerar `.env.example` a partir de `env.ts`: listar todas as variáveis com comentário de descrição, valor de exemplo não-sensitivo e marcação `# REQUIRED_IN_PRODUCTION`. Separar seção de variáveis injetadas automaticamente pela plataforma Railway.
- **Tipo:** código puro (documentação)
- **Esforço:** 30 min
- **Risco de regressão:** Nenhum.
- **Teste:** diff entre `.env.example` e `env.ts` não deve mostrar variáveis ativas não documentadas.
- **Pré-requisitos:** Fase 0 · Item 1 e Fase 3 · Item 1 (novas variáveis devem estar definidas antes de documentar)

---

#### Fase 3 · Item 4

- **Finding canônico:** SEC-B-012 — Aliases de PostgreSQL e Redis criam risco de divergência
- **IDs correlatos:** —
- **Severidade:** LOW
- **Arquivo:linha:** `packages/api/src/env.ts:20-21` (lê apenas `DATABASE_URL` e `REDIS_URL`)
- **Patch strategy:** Documentar no `.env.example` qual variável é a canônica lida pelo código e quais são aliases injetados pela plataforma. Adicionar ao health check de startup um log de `hostname(DATABASE_URL)` e `hostname(REDIS_URL)` sem expor credenciais, para confirmar o cluster alvo.
- **Tipo:** código puro (documentação + health check passivo)
- **Esforço:** 30 min
- **Risco de regressão:** Nenhum.
- **Teste:** log de startup mostra hostname esperado; sem credenciais no output.
- **Pré-requisitos:** —

---

### FASE 4 — Validação de entrada
> Sem dependência de migration de banco (exceto Fase 4 · Item 3 e 4 · Item 6).

---

#### Fase 4 · Item 1

- **Finding canônico:** SEC-C-003 — Segredos em query string e path chegam a access logs
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/routes/tracking-admin.ts:104-106` · `packages/api/src/routes/tracking-public.ts:1336-1341,1891-1896,2007-2013` · `packages/api/src/workers/meta.worker.ts:271-275` · `packages/api/src/routes/meta-admin.ts:77-82,179-184,258-265` · `packages/api/src/workers/pushcut-delivery.worker.ts:97-100`
- **Patch strategy:** (a) Webhooks inbound: migrar token de `?token=` para header `X-Webhook-Token`; atualizar gerador de URL em `tracking-admin.ts:104-106` e documentar janela dual-mode para clientes. (b) Meta CAPI: usar `Authorization: Bearer <token>` em vez de `access_token` em query string quando suportado pela API. (c) Pushcut: mover secret do path para header `Authorization`. (d) Atualizar redact do logger para cobrir `req.query.token` e query completa de `req.url`.
- **Tipo:** código puro (breaking change para clientes de webhook — coordenar antecipadamente)
- **Esforço:** meio dia
- **Risco de regressão:** Alto — webhooks existentes param de funcionar. Implementar modo dual (aceitar tanto header quanto query durante período de migração).
- **Teste:** URL gerada não contém `?token=`; log do receptor não registra o token; teste de integração Meta CAPI valida autenticação via header.
- **Pré-requisitos:** SEC-C-004 (Fase 1 · Item 3) deve estar no ar ou em paralelo; Ação H7 (comunicar clientes)

---

#### Fase 4 · Item 2

- **Finding canônico:** SEC-B-007 — Rate limit global falha aberto e usa IP excessivamente confiável
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/plugins/rate-limit.ts:4-22` · `packages/api/src/server.ts:35-50`
- **Patch strategy:** Mudar `skipOnError: true` para `skipOnError: false` (fail-closed). Adicionar rate limit específico e menor para rotas de webhook (ex: 100/min por `connectionId + req.ip`) e para replay de quarentena. Configurar lista explícita de IPs de proxy confiáveis do Railway em vez de `trustProxy: true` genérico.
- **Tipo:** código puro
- **Esforço:** 2 h
- **Risco de regressão:** Médio — fail-closed pode bloquear tráfego legítimo em instabilidade de Redis. Testar degradação graceful em staging.
- **Teste:** simulação de Redis indisponível com `skipOnError: false`: rota deve ser bloqueada; avaliar impacto de falso positivo em staging antes de produção.
- **Pré-requisitos:** —

---

#### Fase 4 · Item 3

- **Finding canônico:** SEC-B-004 — Replay de quarentena VendePay sem estado terminal
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/routes/tracking-public.ts:1394-1405,1643-1647,2007-2051` · `packages/api/migrations/001_tracking_foundation.sql:39-47`
- **Patch strategy:** Migration para adicionar colunas `replay_attempts INT DEFAULT 0`, `last_replay_at TIMESTAMPTZ` e `replay_state TEXT` (valores: `quarantined`, `replaying`, `replayed`, `replay_failed`) à tabela de recibos. No endpoint de replay, processar um recibo por chamada com `SELECT ... FOR UPDATE SKIP LOCKED`, incrementar `replay_attempts` e gravar o estado. Ao sucesso, marcar o recibo original como `replayed` atomicamente na mesma transação. Definir estado terminal após N falhas (ex: `replay_failed` após 3 tentativas). Não contar resposta `duplicate` como replay bem-sucedido.
- **Tipo:** código + migration
- **Esforço:** 3–4 h
- **Risco de regressão:** Médio — mudança de schema requer migration; recibos em voo durante o deploy podem ter estado inconsistente brevemente.
- **Teste:** replay de quarentena com payload que gera `duplicate` não entra em loop; após N tentativas o recibo muda para `replay_failed` e não é mais selecionado.
- **Pré-requisitos:** —

---

#### Fase 4 · Item 4

- **Finding canônico:** SEC-B-005 — Batch Paysight sem limite de concorrência (fan-out irrestrito)
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/routes/tracking-public.ts:1891-1911`
- **Patch strategy:** Adicionar ao schema Zod do batch `z.array(...).max(50)`. Substituir `Promise.all(req.body.map(...))` por loop sequencial ou `p-limit(5)`. Adicionar validação de assinatura do batch inteiro antes do fan-out (dependente de SEC-C-004).
- **Tipo:** código puro
- **Esforço:** 1 h
- **Risco de regressão:** Baixo — apenas limita tamanho de batch; provedores que enviam mais de 50 eventos por request precisam paginar.
- **Teste:** batch com 51 itens retorna 422; batch com 5 itens processa sem timeout.
- **Pré-requisitos:** —

---

#### Fase 4 · Item 5

- **Finding canônico:** SEC-C-009 — Chave de idempotência UTMify muda a cada retry
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/workers/utmify-delivery.worker.ts:130-170`
- **Patch strategy:** Alterar `x-idempotency-key` de `${row.id}:${row.event_type}:${row.attempts}` para `${row.id}:${row.event_type}` (sem `row.attempts`). Para resend manual intencional, gerar versão com timestamp ou UUID separado, auditável, para diferenciar do retry automático.
- **Tipo:** código puro
- **Esforço:** 30 min
- **Risco de regressão:** Baixo — se o provedor já aceitou com a chave antiga, a nova chave pode ser aceita novamente em novo retry; esse é o comportamento correto para idempotência.
- **Teste:** duas tentativas consecutivas do mesmo `delivery row` enviam exatamente a mesma chave; resend manual intencional envia chave auditável distinta.
- **Pré-requisitos:** —

---

#### Fase 4 · Item 6

- **Finding canônico:** SEC-C-013 — Rate limit UTMify reabre deliveries mortos indefinidamente
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/workers/utmify-delivery.worker.ts:216-225` · `packages/api/src/server.ts:100-112,256-267`
- **Patch strategy:** Adicionar coluna `rate_limit_reopen_count INT DEFAULT 0` na tabela de deliveries UTMify. No recovery de `RATE_LIMIT_REACHED` em `server.ts:100-112`, incrementar o contador e não reabrir quando `>= 3` ou quando já passou de 24h desde o primeiro 429. Implementar leitura do header `Retry-After` e agendamento do próximo attempt com delay correspondente + jitter.
- **Tipo:** código + migration
- **Esforço:** 3–4 h
- **Risco de regressão:** Médio — deliveries que hoje seriam reenviados podem ir para dead-letter permanente.
- **Teste:** fixture de 429 repetida não reabre após o limite configurado; `Retry-After: 60` agenda próximo attempt em ≥ 60s.
- **Pré-requisitos:** —

---

### FASE 5 — PII/LGPD
> Alguns itens requerem migration. Dependências explicitadas abaixo.

---

#### Fase 5 · Item 1

- **Finding canônico:** SEC-C-007 — URL completa com query PII enviada a Meta/TikTok sem scrub
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/services/tracker-script.ts:3` · `packages/api/src/routes/tracking-public.ts:1285-1315` · `packages/api/src/workers/meta.worker.ts:248-256` · `packages/api/src/workers/tiktok.worker.ts:23-29,83-88`
- **Patch strategy:** Criar utilitário `sanitizeEventUrl(url: string): string` que: (1) parseia a URL; (2) mantém apenas parâmetros allow-listed (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `tmx_event_id`, `gclid`, `fbclid`, `ttclid`); (3) remove qualquer parâmetro nomeado como PII (`email`, `phone`, `cpf`, `cnpj`, `document`, `token`, `code`, `password`, `recovery`, `name`). Aplicar no `tracker-script.ts` antes do envio, no receptor antes de persistir e nos workers antes de incluir `event_source_url`/referrer no payload de destino.
- **Tipo:** código puro
- **Esforço:** 3–4 h
- **Risco de regressão:** Médio — parâmetros necessários para matching que não estiverem na allow-list serão removidos; validar a lista com o time de produto.
- **Teste:** URL com `email=foo@bar.com&utm_source=google` → saída contém apenas `utm_source=google`; URL com `cpf=12345678901` → parâmetro removido.
- **Pré-requisitos:** —

---

#### Fase 5 · Item 2

- **Finding canônico:** SEC-C-011 — Redaction de logs incompleta (PII, tokens genéricos, bodies upstream)
- **IDs correlatos:** SEC-B-009 (parcialmente coberto em Fase 0 · Item 4)
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/src/lib/logger.ts:6-19` · `packages/api/src/workers/utmify-web-event.worker.ts:76-93,107-117` · `packages/web/src/lib/api-client.ts:265-303`
- **Patch strategy:** Expandir pino redact para cobrir: `'*.token'`, `'*.access_token'`, `'*.email'`, `'*.phone'`, `'*.document'`, `'*.cpf'`, `'*.cnpj'`. Adicionar serializer de URL que remove a query string dos logs de request. No worker UTMify, truncar o body de erro upstream a 100 caracteres sem campos sensíveis antes de logar. No `api-client.ts`, condicionar `console.error` a `process.env.NODE_ENV !== 'production'`.
- **Tipo:** código puro
- **Esforço:** 2 h
- **Risco de regressão:** Baixo — apenas reduz o que é logado; pode dificultar debugging em produção.
- **Teste:** snapshot de log com request contendo email/token não contém esses valores; worker log de erro truncado não expõe dados de compradores.
- **Pré-requisitos:** Fase 0 · Item 4 (webhook URL) já entregue

---

#### Fase 5 · Item 3

- **Finding canônico:** SEC-C-010 — Sem política de retenção/expurgo para PII de tracking
- **IDs correlatos:** —
- **Severidade:** MEDIUM
- **Arquivo:linha:** `packages/api/migrations/001_tracking_foundation.sql:19-32,39-64` · `004_tracking_reliable_foundation.sql:1-6` · `029_tmx_recovery.sql:23-59` · `033_recovery_attribution_events.sql:12-23` · `065_payment_gateway_connections.sql:27-37`
- **Patch strategy:** Definir política por tabela (sugestão inicial: `tracking_events` 90 dias, `webhook_receipts` 90 dias, `tracking_gateway_webhook_receipts` 90 dias, `tracking_orders` reter indefinidamente mas anonimizar `buyer` após 1 ano, `recovery_*` 180 dias). Criar migration para adicionar índice em `created_at` nas tabelas sem ele (para performance de expurgo). Criar job cron via BullMQ repeat idempotente que executa DELETE/UPDATE de anonimização. Implementar endpoint de eliminação por titular (LGPD art. 18) por `email hash`.
- **Tipo:** código + migration
- **Esforço:** 1–2 dias
- **Risco de regressão:** Médio — expurgo com janela errada pode remover dados dentro da retenção desejada. Testar com fixtures de datas controladas.
- **Teste:** fixture com `created_at` vencido é removida/anonimizada; dado dentro da janela é preservado; job é idempotente em múltiplas execuções.
- **Pré-requisitos:** Fase 5 · Item 4 (minimizar payload antes de definir o que expurgar; senão o schema de expurgo pode mudar)

---

#### Fase 5 · Item 4

- **Finding canônico:** SEC-C-008 — PII e payloads brutos em plaintext no PostgreSQL
- **IDs correlatos:** SEC-B-006 (subset — `webhook_receipts` e `tracking_orders`)
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/migrations/001_tracking_foundation.sql:19-32,39-64` · `004_tracking_reliable_foundation.sql:1-6` · `029_tmx_recovery.sql:23-59` · múltiplas tabelas listadas em SEC-C-008
- **Patch strategy:** **Fase A (imediata, sem migration):** minimizar o payload gravado em `webhook_receipts.payload` — gravar apenas campos normalizados necessários, não o JSON bruto completo, após a normalização VendePay/Paysight. **Fase B (migration planejada):** adicionar `buyer_hash` determinístico em `tracking_orders` para correlação sem expor PII em claro; remover/anonimizar `buyer.email`/`buyer.phone` do campo JSON após processamento. **Fase C (longo prazo):** criptografia de campo para dados que precisam ser reversíveis (recovery, nome para exibição).
- **Tipo:** Fase A: código puro · Fase B: código + migration · Fase C: código + migration
- **Esforço:** Fase A: meio dia · Fase B: 1 dia · Fase C: 2+ dias
- **Risco de regressão:** Alto — mudanças na estrutura de `buyer` podem quebrar replay de webhooks, recovery e reporting financeiro.
- **Teste:** dump de tabela `webhook_receipts` não contém CPF/CNPJ/email bruto após normalização (Fase A); replay de ordem funciona com `buyer_hash` em vez de email em claro (Fase B).
- **Pré-requisitos:** política de retenção (Fase 5 · Item 3) deve estar definida antes da migration de minimização

---

#### Fase 5 · Item 5

- **Finding canônico:** SEC-C-006 — Pixels e tracking ativados sem gate de consentimento
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/services/tracker-script.ts:1-16` · `packages/api/src/routes/tracking-public.ts:15-35,1285-1315`
- **Patch strategy:** No `tracker-script.ts`, condicionar a criação de IDs persistentes, cookie/localStorage e carregamento de pixels Meta/TikTok a `window.__tmx_consent?.granted === true`. No receptor `/track/bootstrap` e `/track/events`, verificar `consent_state` no body e recusar persistência de eventos identificáveis quando `denied` ou ausente (retornar 200 silencioso para não bloquear UX, mas não persistir). Armazenar `consent_version`, `consent_purpose` e `consent_timestamp` por visitor.
- **Tipo:** código puro (frontend + backend)
- **Esforço:** 1–2 dias (inclui decisão de produto sobre UX do CMP)
- **Risco de regressão:** Alto — tracking para para visitantes sem consentimento; métricas caem durante o rollout.
- **Teste:** sessão nova sem consentimento não cria cookie, não chama Meta/TikTok e não persiste evento identificável; após grant o fluxo inicia normalmente; revogação interrompe coleta.
- **Pré-requisitos:** decisão de produto sobre UX/fluxo do CMP; Fase 5 · Item 2 (redaction de logs) no ar

---

### FASE 6 — Governança e ACL
> Maior complexidade de migration e risco de regressão. Depende das fases anteriores.

---

#### Fase 6 · Item 1

- **Finding canônico:** SEC-A-004 — ACL não distingue membro de tracking manager
- **IDs correlatos:** —
- **Severidade:** HIGH
- **Arquivo:linha:** `packages/api/src/services/offer-store.ts:85,89,93,96,469` · `routes/tracking-admin.ts:410,836,978` · `routes/tracking-advanced.ts:227` · `routes/meta-admin.ts:48` + 4 arquivos de rotas com `assertManager` inconsistente
- **Patch strategy:** Migration para criar tabela `offer_member_roles(user_id, offer_id, role ENUM('view', 'tracking_manager', 'manager'))`. Migrar `memberIds` existentes conservadoramente para `role='view'`. Atualizar `canConfigureTrackingOffer`/`assertTrackingManager` para consultar `offer_member_roles WHERE role IN ('tracking_manager', 'manager')`. Padronizar todos os handlers de mutação de tracking para usar o mesmo helper. Criar endpoint de concessão de role para owners.
- **Tipo:** código + migration
- **Esforço:** 1–2 dias
- **Risco de regressão:** Alto — membros com acesso de tracking atual perdem poder até receberem o role explícito; coordenar com suporte para notificar owners.
- **Teste:** matriz Admin × Owner × Membro(view) × TrackingManager × Manager para cada endpoint de mutação de tracking.
- **Pré-requisitos:** Fase 1 concluída (reduz blast radius da ACL incorreta enquanto a migration não está no ar)

---

#### Fase 6 · Item 2

- **Finding canônico:** SEC-B-014 — `/readyz` público expõe paths internos e variáveis de env
- **IDs correlatos:** —
- **Severidade:** LOW
- **Arquivo:linha:** `packages/api/src/routes/health.ts:13-74` · `packages/api/src/routes/index.ts:68-81`
- **Patch strategy:** Reduzir `/readyz` a `{ status: 'ok' | 'degraded' }`. Mover `chromium.executablePath()`, mensagens de Redis/Postgres/S3 e `PLAYWRIGHT_BROWSERS_PATH` para endpoint `GET /health/details` restrito a admins ou para telemetria interna.
- **Tipo:** código puro
- **Esforço:** 30 min
- **Risco de regressão:** Baixo — verificar que o health check do Railway continua funcionando com o novo formato.
- **Teste:** `GET /readyz` sem auth retorna apenas status agregado; detalhes estão disponíveis apenas em endpoint autenticado.
- **Pré-requisitos:** —

---

## 4. Ações do Humano (fora do código)

| # | Ação | Urgência | Bloqueia |
|---|------|----------|---------|
| **H1** | Criar `JWT_SECRET` (≥32 bytes aleatórios) e `OFFER_STORE_ENCRYPTION_KEY` (≥32 bytes) no Railway **antes** do próximo deploy | Imediata | Fase 0 · Item 1 |
| **H2** | Revogar `RAILWAY_PROJECT_TOKEN` atual; criar novo token com escopo mínimo (apenas criação/exclusão de custom domain para o serviço web) | Alta | Fase 3 · Item 2 |
| **H3** | Rotacionar `WEBHOOK_SECRET`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `YOUTUBE_REWARDS_WEBHOOK_SECRET` e `ASSEMBLYAI_API_KEY` no Railway e nos respectivos painéis dos provedores | Alta | SEC-B-010 |
| **H4** | Após Fase 3 · Item 1 estar no ar: rotacionar `TRACKING_ENCRYPTION_KEY` usando o procedimento de rotação implementado | Média | Fase 3 · Item 1 deve estar no ar antes |
| **H5** | Confirmar com VendePay e Paysight o esquema exato de assinatura HMAC (header name, algoritmo, encoding) antes de implementar Fase 1 · Item 3 | Imediata | Fase 1 · Item 3 |
| **H6** | Confirmar com o time de produto os hosts válidos do UTMify para fixar a allowlist de SSRF | Imediata | Fase 1 · Item 2 |
| **H7** | Comunicar a todos os clientes com webhook ativo a migração de `?token=` para header `X-Webhook-Token`, com data de corte e janela dual-mode | Antes da Fase 4 · Item 1 | Fase 4 · Item 1 |
| **H8** | Verificar no Google Ads Developers Console se a conta de produção usa v22 e testar upgrade para v25 em sandbox antes do deploy | Imediata | Fase 2 · Item 2 |
| **H9** | Provisionar ambiente de staging no Railway para validar HMAC de webhooks, BOLA fixes e rate limit antes de produção | Antes da Fase 1 | Fase 1 inteira |

---

## 5. Riscos de QA pós-fix

Telas e fluxos que devem ser testados manualmente antes de subir cada fase:

**Fase 0 — antes de subir:**
- [ ] Login e emissão de JWT em produção após criar `JWT_SECRET` — verificar que o token é assinado com a nova chave
- [ ] Tracking overview e refunds dashboard com JWT sem `ofertas` no campo `tools` — deve receber 403
- [ ] Criar clone como usuário A com Idempotency-Key `K`; usuário B usa mesma chave `K` e mesmo body — deve criar clone próprio, não retornar o clone de A

**Fase 1 — antes de subir:**
- [ ] Tela de Google Ads → Connection Status: não deve exibir conexões criadas por outros tenants
- [ ] UTMify: salvar URL legítima (`app.utmify.com.br`) ainda funciona; URL fora da allowlist retorna erro 422
- [ ] Enviar webhook VendePay/Paysight com assinatura HMAC correta → aceito; com body alterado → 401
- [ ] Criar clone como usuário A; usuário B tenta `GET /clones/<id>`, `DELETE /clones/<id>`, `PATCH /clones/<id>/forms/...` → todos 404
- [ ] Criar VSL job como A; usuário B tenta `GET /vsl-jobs/<id>` → 404

**Fase 2 — antes de subir:**
- [ ] TikTok Test Events: delivery de Purchase com payload Events API 2.0 confirma aceitação pelo painel TikTok
- [ ] Google Ads sandbox v25: listagem de contas retorna os mesmos dados de v22; nenhum erro de schema

**Fase 3 — antes de subir:**
- [ ] Boot com `NODE_ENV=production` sem `JWT_SECRET` → API não deve subir
- [ ] Dados cifrados com `TRACKING_ENCRYPTION_KEY` antiga ainda são decriptados após rotação para chave nova

**Fase 4 — antes de subir:**
- [ ] Webhook VendePay enviado com `?token=` (modo legado) ainda funciona durante janela dual-mode
- [ ] Rate limit: volume de webhooks de produção em horário de pico não excede o novo limite por conexão
- [ ] UTMify: retry automático do mesmo delivery usa exatamente a mesma `x-idempotency-key`

**Fase 5 — antes de subir:**
- [ ] URL de checkout com `?email=teste@email.com` na query: verificar nos logs e payload builder que chega a Meta/TikTok apenas sem o parâmetro `email`
- [ ] Sessão nova sem cookie de consentimento: confirmar que nenhum identificador é criado e nenhum pixel é disparado
- [ ] Após revogar consentimento: tracker para de criar novos eventos identificáveis

**Fase 6 — antes de subir:**
- [ ] Usuário com `role=view` tenta configurar pixel Meta → 403
- [ ] Usuário com `role=tracking_manager` configura pixel Meta → sucesso
- [ ] `/readyz` sem auth retorna apenas status, sem paths internos

---

## 6. Métricas de sucesso

| Finding | Critério objetivo de fechamento |
|---------|--------------------------------|
| SEC-C-002 | `GET .../connection-status` de usuário B não lista conexão criada por A; `POST .../oauth/attach` com `connection_id` de A retorna 404 para B |
| SEC-C-001 | Zod rejeita qualquer URL fora da allowlist UTMify com 422; worker nunca inclui `x-api-token` em request para host não allow-listed |
| SEC-B-003 | Boot da API com `NODE_ENV=production` e sem `JWT_SECRET` lança exceção antes de aceitar conexões |
| SEC-C-004 | Payload VendePay com body alterado retorna 401 sem persistir recibo; payload com HMAC correto passa |
| SEC-A-002 | `GET /clones/<id-de-A>` por usuário B retorna 404; `DELETE /clones/<id-de-A>` por B retorna 404 |
| SEC-A-003 | `GET /vsl-jobs/<id-de-A>` por usuário B retorna 404 |
| SEC-C-005 | Nenhum literal `/pixel/track/` no código; Test Events TikTok aceita payload 2.0 sem erro |
| SEC-C-012 | Nenhum literal `/v22/` no código; sandbox Google Ads v25 retorna contas esperadas sem erro de schema |
| SEC-A-006 | JWT sem `ofertas` recebe 403 em `GET /v1/tracking/overview` e `GET /v1/tracking/refunds-dashboard` |
| SEC-C-007 | URL com `email=foo@bar.com` chega ao Meta payload builder apenas como URL sem o parâmetro `email` |
| SEC-C-008 | `SELECT payload FROM webhook_receipts LIMIT 1` pós-Fase A não contém CPF/CNPJ/email bruto |
| SEC-C-009 | Log de duas tentativas consecutivas do mesmo delivery mostra `x-idempotency-key` idêntico |
| SEC-A-005 | Usuário B com mesma Idempotency-Key de A recebe novo job próprio, não os dados de A |
| SEC-A-004 | Usuário `view` recebe 403 em endpoint de mutação de tracking; usuário `tracking_manager` recebe 200 |
| SEC-C-010 | Job de expurgo executado: `tracking_events` com `created_at < NOW() - 90 days` não existem mais |
| SEC-C-011 | Snapshot de log com `{ email: "..." }` no body não contém o valor de email; campo redacted |

---

> **Nota sobre skill security-auditor:** não está instalada nesta máquina. Findings foram analisados diretamente dos 3 relatórios de auditoria. Para revisão independente, instalar a skill e re-executar sobre este plano.
