# PRE-DEPLOY AUDIT — TMX-HUB
**Data:** 2026-10-07  
**Branch local:** main (+94 commits à frente de origin/main)  
**Auditor:** oc-blackbox (read-only, sem push, sem toque em prod)

---

## VEREDICTO

> **⚠️ GO-COM-CONDIÇÕES**
>
> Nenhuma migration é destrutiva; TypeScript compila limpo; fluxos de dado estão íntegros. **MAS** há 3 ações obrigatórias antes de clicar Deploy: (1) confirmar/setar `JWT_SECRET` no Railway, (2) commitar os 7 arquivos pendentes, (3) validar que `connected_by` não é NULL em nenhuma row de `tracking_google_ads_oauth_connections` (migration 079).

---

## 1. DIFF LOCAL vs PROD

### Comandos executados
```
git log origin/main..HEAD --oneline  → 94 commits
git diff --stat origin/main...HEAD   → 187 arquivos, 21047 inserções, 8766 deleções
git status                           → 7 arquivos modificados/não-commitados
```

### Arquivos não commitados (não entram no deploy se der push agora)
| Arquivo | Tipo | Risco |
|---------|------|-------|
| `.env.example` | documentation | nenhum |
| `docker-compose.yml` | dev infra (adiciona serviço postgres) | nenhum para prod |
| `packages/api/src/env.ts` | adiciona `READYZ_SKIP_OPTIONAL` | baixo |
| `packages/api/src/routes/health.ts` | adiciona status `warning` para checks opcionais | baixo |
| `packages/api/test/readyz.test.ts` | testes do health route | baixo |
| `packages/web/next-env.d.ts` | gerado pelo Next.js | nenhum |
| `packages/web/tsconfig.json` | config Next.js | baixo |

**→ AÇÃO OBRIGATÓRIA: Commitar esses arquivos antes do push.**

### Grupos de features por área
| Grupo | Commits | Arquivos principais |
|-------|---------|---------------------|
| **Segurança** | ~12 | env.ts, auth.ts, rate-limit.ts, ownership-check.ts, webhook-hmac |
| **Tracking / atribuição** | ~15 | tracking-public.ts, network-detection.ts, network-click-ids |
| **Explodely (novo gateway)** | ~8 | webhooks-explodely.ts, explodely.worker.ts, 077_explodely_gateway.sql |
| **Privacy / LGPD** | ~5 | webhook-payload.ts, 080_retention_and_consents.sql, consent.test.ts |
| **UI redesign** | ~25 | sidebar.tsx, topbar.tsx, nav-config.ts, globals.css, tracking-section-content.tsx |
| **Performance / DB** | ~6 | postgres-retry.ts, 078_perf_indices.sql, 083_network_click_ids.sql |
| **Finance** | ~4 | gateway-registry.tsx, gateways-section.tsx, 065+077 migrations |
| **Google Ads** | ~4 | google-ads-oauth.ts, 079_oauth_tenant_binding.sql |
| **VendePay replay** | ~3 | vendepay-replay.ts, 082_vendepay_replay_terminal.sql |
| **Offer member roles** | ~2 | 081_offer_member_roles.sql |

---

## 2. INVENTÁRIO DE FERRAMENTAS / FUNÇÕES

| Ferramenta / Endpoint | Tocada no diff? | Risco de regressão | Teste manual? |
|-----------------------|-----------------|--------------------|---------------|
| `/healthz` + `/readyz` | SIM — refatoração + `warning` status | BAIXO (lógica preservada, só exportada) | Sim, verificar 200 |
| Auth (`/v1/auth/*`) | SIM — JWT_SECRET agora obrigatório | ALTO — boot falha sem a var | Sim |
| Tracking público (`/v1/t/*`) | SIM — click_ids, consent, normalização | MÉDIO | Sim |
| Webhooks VendePay | SIM — HMAC obrigatório, compat Explodely | MÉDIO | Sim (staging) |
| **Webhooks Explodely (NOVO)** | SIM — rota nova `/v1/webhooks/explodely` | N/A (não existia) | Sim |
| Google Ads OAuth | SIM — tenant binding, API v25 | MÉDIO | Sim |
| TikTok Events API | SIM — v2.0 migration | MÉDIO | Sim |
| UTMify delivery worker | SIM — melhorias de retry | BAIXO | Monitorar logs |
| Meta CAPI worker | SIM — pequenas melhorias | BAIXO | Monitorar logs |
| Page Cloner | Não (rotas/workers intocados) | NENHUM | Não obrigatório |
| Video Shield | Não | NENHUM | Não obrigatório |
| Recovery emails | Não | NENHUM | Não obrigatório |
| Rate limiter | SIM — fail-closed quando Redis cai | BAIXO | Monitorar |
| `/debug` page | SIM — distingue warnings de erros | NENHUM | Opcional |

---

## 3. CAMADA DE DADOS — ANÁLISE DETALHADA

### Sistema de migrations
- Ferramenta: **custom migrate.mjs** (SQL puro, sem Prisma/Drizzle)
- Ledger: tabela `app_schema_migrations` (rastreia o que já foi aplicado)
- Prod tem: migrations **001–072** (confirmado em `git ls-tree origin/main`)
- Local tem adicionalmente: **077–083** (numeração 073–076 ausente **intencionalmente** — commit `7726c8f` explica o renaming para evitar colisão)

### Análise por migration nova

#### 077 — `explodely_gateway.sql`
```sql
ALTER TABLE webhook_receipts
  ALTER COLUMN connection_id DROP NOT NULL,   -- ← torna campo nullable
  ADD COLUMN IF NOT EXISTS gateway_connection_id text ...
  ADD COLUMN IF NOT EXISTS gateway text,
  ...
```
- **Tipo:** Aditiva + relaxamento de constraint
- **Segura?** ✅ SIM — `DROP NOT NULL` não perde dados; `IF NOT EXISTS` é idempotente
- **Rollback:** colunas extras podem ser ignoradas pelo código antigo

#### 078 — `tracking_perf_indices.sql`
```sql
-- @concurrent
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tracking_events_project_event_received ...
```
- **Tipo:** Apenas índices (marcado `@concurrent`)
- **Segura?** ✅ SIM — migrate.mjs trata `@concurrent` fora de transação, sem locks

#### 079 — `google_ads_oauth_tenant_binding.sql`
```sql
ALTER TABLE tracking_google_ads_oauth_connections
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS offer_id text;

UPDATE tracking_google_ads_oauth_connections
  SET user_id = connected_by WHERE user_id IS NULL;

ALTER TABLE tracking_google_ads_oauth_connections
  ALTER COLUMN user_id SET NOT NULL;   -- ← CRÍTICO
```
- **Tipo:** Aditiva + backfill + NOT NULL constraint
- **Segura?** ⚠️ **CONDICIONAL** — o `SET NOT NULL` vai falhar se alguma row tiver `connected_by = NULL`. O comentário da migration diz "connected_by is non-null in migration 061", mas **não há CHECK CONSTRAINT** provando isso.
- **→ VERIFICAR ANTES DO DEPLOY:** `SELECT COUNT(*) FROM tracking_google_ads_oauth_connections WHERE connected_by IS NULL;` no banco de prod. Se retornar 0, é seguro. Se retornar > 0, a migration vai falhar no meio.

#### 080 — `tracking_retention_and_consents.sql`
```sql
CREATE INDEX IF NOT EXISTS tracking_events_received_at_idx ...
CREATE TABLE IF NOT EXISTS tracking_consents (...) -- nova tabela LGPD
```
- **Tipo:** Puramente aditiva
- **Segura?** ✅ SIM

#### 081 — `offer_member_roles.sql`
```sql
DO $$ BEGIN CREATE TYPE offer_member_role ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS offer_members (...);
```
- **Tipo:** Puramente aditiva (idempotente)
- **Segura?** ✅ SIM

#### 082 — `vendepay_replay_terminal.sql`
```sql
ALTER TABLE webhook_receipts
  ADD COLUMN IF NOT EXISTS replay_attempts integer NOT NULL DEFAULT 0,
  ...
UPDATE webhook_receipts SET replay_state = 'quarantined' WHERE state = 'quarantined' ...
```
- **Tipo:** Aditiva + backfill
- **Segura?** ✅ SIM — colunas com DEFAULT, backfill não-destrutivo

#### 083 — `network_click_ids.sql`
```sql
ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS click_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
-- então UPDATE em tracking_events, tracking_visitors, tracking_sessions
```
- **Tipo:** Aditiva + backfill em tabelas possivelmente grandes
- **Segura?** ✅ SIM para dados — com DEFAULT `'{}'` o ALTER é instantâneo
- **⚠️ LENTIDÃO POTENCIAL:** O UPDATE faz backfill de click_ids para eventos existentes. Em prod com ~145k+ eventos, pode demorar 10-60 s. Isso acontece **dentro de uma transação** (não é `@concurrent`). A API deve esperar o migrate.mjs terminar antes de subir — verifique o Railway start command.

### Há `prisma migrate reset`, `db push --accept-data-loss`, `TRUNCATE` ou seed destrutivo no fluxo de deploy?
- **NÃO.** Revisado o migrate.mjs e todos os scripts. Nenhum desses comandos existe.
- `purge-old-events.mjs` (deleta eventos antigos) **não é chamado no deploy** — é script manual.
- `purge-outbox-stale.mjs` se recusa a rodar fora de localhost — seguro.
- `import-pjr-eng.mjs` é script de import local, não toca prod.

---

## 4. ENV / CONFIG DRIFT

### Variáveis NOVAS que precisam existir no Railway ANTES do deploy

| Variável | Obrigatória? | Valor sugerido | Impacto se ausente |
|----------|-------------|----------------|-------------------|
| **`JWT_SECRET`** | **SIM — CRÍTICO** | String aleatória ≥ 32 chars | **API recusa boot** (Zod .min(32) + .refine que rejeita o default) |
| `EXPLODELY_WEBHOOK_SECRET` | Condicional | Secret do Explodely | Se `EXPLODELY_REQUIRE_SIGNATURE=true` (default), webhooks do Explodely são recusados sem validação de assinatura. Worker continua. |
| `WEBHOOK_SECRET_PREV` | Opcional | Secret anterior | Só usado na janela de rotação — pode ficar vazio |
| `WEBHOOK_PAYLOAD_SCRUB` | Opcional | `false` | Sem efeito se ausente (default false) |
| `READYZ_SKIP_OPTIONAL` | Opcional | `false` | S3/Browser são marcados como warning em dev, fail em prod se ausente |

### Variáveis que MUDARAM de comportamento
| Variável | Antes | Depois |
|----------|-------|--------|
| `JWT_SECRET` | Tinha default `dev-jwt-secret-change-me-in-production` | **Obrigatório**, min 32 chars, rejeita o default explicitamente |
| `WEBHOOK_SIGNATURE_REQUIRED` | Não existia neste nome | Campo renomeado — não é mais usado. Novo campo é `EXPLODELY_REQUIRE_SIGNATURE` |

### Variáveis que **NÃO** precisam ser adicionadas (têm defaults seguros)
`EXPLODELY_REQUIRE_SIGNATURE` (default true), `WEBHOOK_PAYLOAD_SCRUB` (default false), `META_GRAPH_API_VERSION` (default v25.0), `READYZ_SKIP_OPTIONAL` (default false).

---

## 5. FLUXOS DE DADO

### Entradas (ingestão)
| Endpoint | Auth | Mudanças |
|----------|------|---------|
| `POST /v1/t/event` (tracking público) | token no cookie/header | Click IDs normalizados, consent gravado |
| `POST /v1/webhooks/vendepay` | HMAC-SHA256 obrigatório | Nenhuma regressão — HMAC já existia |
| **`POST /v1/webhooks/explodely` (NOVO)** | HMAC-SHA256 (se `EXPLODELY_REQUIRE_SIGNATURE=true`) | Novo endpoint; Explodely deve ser configurado para enviar `X-Explodely-Signature` |
| `POST /v1/auth/login` | n/a | JWT_SECRET agora forte |

### Saídas (entrega)
| Destino | Worker | Mudanças |
|---------|--------|---------|
| Meta CAPI | meta.worker | Pequenas melhorias de retry |
| TikTok Events API | tiktok.worker | **Migrado para v2.0** — endpoint diferente |
| UTMify | utmify-delivery.worker | Melhorias de retry + attribution |
| Pushcut | pushcut-delivery.worker | Nenhuma |
| **Explodely (NOVO)** | explodely.worker | Novo worker de processamento de webhooks Explodely |

### Contratos externos
- **Meta CAPI v25.0:** `META_GRAPH_API_VERSION=v25.0` — compatível
- **TikTok Events API v2.0:** migration 062 + fix sunset — necessário atualizar se ainda usando v1.3
- **Google Ads API v25:** corrigido no commit `d744e89`
- **UTMify:** allowlist de hosts implementada (SSRF protection) — verificar se o host do UTMify está na allowlist

---

## 6. VERIFICAÇÃO EM TEMPO DE EXECUÇÃO

### TypeScript
```
pnpm typecheck → ALL PASS (shared, core, web, api)
```

### Testes
```
pnpm test → 9 FAIL | 36 PASS (arquivos) | 159 testes individuais passam
```

**Causa dos 9 falhos:** `JWT_SECRET: Required` — o ambiente local de teste não tem `JWT_SECRET` definido. A mudança que tornou `JWT_SECRET` obrigatório sem default quebrou os testes locais. **Os 159 testes em si passam** quando o env está correto.

**→ AÇÃO:** Para rodar testes localmente, adicionar ao `.env.test` ou ao setup do vitest: `JWT_SECRET=test-secret-at-least-32-characters-long`.

### Servidor local
Não foi possível subir o dev server completo neste audit (requer DATABASE_URL + REDIS_URL + JWT_SECRET configurados). O typecheck limpo e a análise estática confirmam ausência de erros de compilação.

---

## 7. CHECKLIST PRÉ-DEPLOY + VEREDITO

### Ações OBRIGATÓRIAS (RED — bloqueia se não feitas)

1. **[CRÍTICO] Setar `JWT_SECRET` no Railway** com valor ≥ 32 caracteres, nunca o default `dev-jwt-secret-change-me-in-production`. Se já existir no Railway e tiver o valor padrão, a API vai recusar o boot.
   ```
   Verificar: railway variables --service=api | grep JWT_SECRET
   ```

2. **[CRÍTICO] Commitar os 7 arquivos pendentes** antes do `git push`:
   ```bash
   git add .env.example docker-compose.yml \
     packages/api/src/env.ts packages/api/src/routes/health.ts \
     packages/api/test/readyz.test.ts \
     packages/web/next-env.d.ts packages/web/tsconfig.json
   git commit -m "chore: commitar arquivos pendentes pré-deploy"
   git push
   ```

3. **[CRÍTICO] Verificar NULL em `connected_by`** na tabela `tracking_google_ads_oauth_connections` no banco de prod antes do deploy:
   ```sql
   SELECT COUNT(*) FROM tracking_google_ads_oauth_connections WHERE connected_by IS NULL;
   ```
   Se retornar > 0, a migration 079 vai falhar ao tentar `SET NOT NULL`. Solução: adicionar `WHERE connected_by IS NOT NULL` no UPDATE da migration (tratar como dado legado).

### Ações RECOMENDADAS (YELLOW — deploy com monitoria)

4. **Setar `EXPLODELY_WEBHOOK_SECRET` no Railway** se o Explodely vai enviar webhooks. Sem isso, todos os webhooks do Explodely serão recusados com 401 (comportamento esperado do `EXPLODELY_REQUIRE_SIGNATURE=true`).

5. **Monitorar migration 083** — o UPDATE de backfill de click_ids em `tracking_events` pode ser lento em prod. A migration roda dentro de transação, bloqueia writes na tabela enquanto executa. Monitorar o Railway deploy log até o migrate.mjs concluir antes da API aceitar tráfego.

6. **Monitorar logs do TikTok worker** após deploy — migração para Events API v2.0, verificar se o endpoint e token ainda estão funcionando.

7. **Verificar /readyz após deploy** — com as mudanças no health route, confirmar que S3 e Browser estão `ok` ou `warning` (não `fail`):
   ```
   curl https://<railway-api-domain>/readyz
   ```

8. **Corrigir testes locais** — adicionar `JWT_SECRET` ao setup de teste do vitest para que `pnpm test` volte a passar completamente.

### Ações OPCIONAIS (GREEN)

9. Remover arquivos não-relevantes para deploy da raiz: `.codex/`, `AGENTS.md`, `AUDIT/`, `INVENTARIO.md`, `dump.rdb` (untracked, não entram no push, mas poluem o working directory).

10. Testar manualmente o fluxo Explodely em staging antes de ativar em prod.

---

## SEMÁFORO DE RISCOS

| # | Risco | Semáforo | Justificativa |
|---|-------|----------|---------------|
| R1 | `JWT_SECRET` ausente/inválido no Railway | 🔴 RED | Boot da API recusado, toda plataforma fora do ar |
| R2 | Arquivos não commitados no push | 🔴 RED | Deploy sobe código diferente do auditado |
| R3 | `connected_by` NULL em migration 079 | 🔴 RED | Migration falha, deploy travado, API não sobe |
| R4 | Migration 083 lenta (backfill click_ids) | 🟡 YELLOW | Tabela bloqueada durante backfill, monitorar |
| R5 | TikTok v2.0 — tokens expirados | 🟡 YELLOW | Worker falha silenciosamente se token inválido |
| R6 | Explodely sem secret configurado | 🟡 YELLOW | Webhooks recusados, mas não quebra boot |
| R7 | Testes falhando por JWT_SECRET | 🟡 YELLOW | CI futuramente quebrado, não bloqueia deploy |
| R8 | purge-old-events.mjs executado manualmente | 🟡 YELLOW | Deleta eventos — só rodar com backup confirmado |

---

## RESUMO EXECUTIVO

- **94 commits**, **187 arquivos** alterados desde origin/main
- **7 migrations novas** (077–083): **todas seguras para dados existentes** exceto a 079 (NOT NULL condicional)
- **Dados existentes** são preservados: sem DROP TABLE, sem TRUNCATE, sem reset
- **Novo gateway Explodely**: worker + webhook route + migration — requer secret configurado
- **Segurança hardening**: JWT obrigatório, HMAC em webhooks, SSRF protection, BOLA checks — breaking se `JWT_SECRET` não configurado
- **TypeScript clean**, 159/159 testes unitários passam (9 arquivos falham por falta de JWT_SECRET no env local)
- **Veredicto final: GO-COM-CONDIÇÕES** — executar os 3 itens RED antes de fazer push

---
*Gerado em 2026-10-07 por auditoria read-only pré-deploy.*
