# SECURITY AUDIT — TMX-HUB

**Data:** 2026-10-07  
**Auditor:** Missão 3 (pane-128, oc-api-audit + senior-security + oc-blackbox)  
**Escopo:** Read-only, análise estática de código-fonte. Sem execução contra produção.  
**Branch auditado:** `main` (HEAD: 5dbbdea)

---

## RESUMO EXECUTIVO

**Veredicto:** `SEGURO-COM-RESSALVAS`

O sistema foi construído com cuidado: BOLA é tratado consistentemente em todos os endpoints via `assertAccess`/`assertManager`/`requireOwnership`, o JWT é verificado com `timingSafeEqual`, admin role é sempre refrescada do store (não apenas do token), schemas Zod com `.strict()` bloqueiam mass-assignment, e queries PostgreSQL usam parameterized templates sem SQL injection visível. A lógica de multi-tenancy por oferta está correta.

**Dois problemas bloqueiam o onboarding de qualquer membro externo hoje:**

| Severidade | Quantidade |
|------------|-----------|
| HIGH       | 2         |
| MEDIUM     | 4         |
| LOW        | 3         |
| INFO       | 2         |

**Todos os itens HIGH e MEDIUM listados na checklist final devem ser corrigidos ANTES de convidar o primeiro membro externo.**

---

## 1. MODELO DE PERMISSÃO

### Identificação de admin
- `role: 'admin' | 'user'` armazenada no hash Redis `user:{id}`
- JWT carrega `role`, mas `requireAuth` sempre busca o usuário atualizado do store e **sobrescreve** `role` e `tools` no `req.user` (auth.ts:70-78) — role nunca fica "presa" no token
- Admin criado via env vars `ADMIN_EMAIL`/`ADMIN_PASSWORD` no boot, ou pelo primeiro usuário a se registrar (first-run)
- JWT_SECRET exige string ≥ 32 chars e **bloqueia o default dev** via `refine()` (env.ts:49-54) ✅

### Escopo de membros
- `offer.userId` = dono (owner)
- `offer.memberIds[]` = lista de user IDs com acesso de leitura à oferta
- `offer_members` (PostgreSQL) = tabela com role granular (`owner` | `tracking_manager` | `member`)
- Ownership de clone/vsl/funnel: hash Redis `{tabela}:{id} → userId`
- shield-jobs e media-jobs: campo `userId` no store (`assertOwner` por sub)

### Tabelas/chaves de autorização
| Recurso | Store | Chave de isolamento |
|---------|-------|---------------------|
| User | Redis hash `user:{id}` | — |
| Offer | Redis hash `offer:{id}` | `userId`, `memberIds[]` |
| Clone/VSL/Funnel | Redis hash `{tabela}:{id}` | `userId` (via ownership-check.ts) |
| Shield/Media job | Redis hash `shield-job:{id}` | `userId` |
| Tracking project | PostgreSQL `tracking_projects` | `offer_id → offer.userId` |
| Meta pixels | PostgreSQL `meta_pixels` | `project_id → offer_id → assertAccess` |
| Offer member roles | PostgreSQL `offer_members` | `offer_id + user_id` |

### Modelo de acesso por ferramenta (`tools`)
O campo `tools` no JWT (e no user store) restringe quais features o membro pode usar. A verificação é feita em `index.ts:91-100` via `TOOL_PATH_MAP`. Admin sempre bypassa. Sem `tools` definido = acesso completo — **isso é intencional** (legado) e está documentado.

---

## 2. TABELA DE ROTAS — STATUS DE OWNERSHIP CHECK

### Rotas públicas (sem auth)
| Método | Path | Tipo de guarda | Status |
|--------|------|----------------|--------|
| GET | /health, /readyz | Nenhum (design) | ✅ N/A |
| POST | /v1/auth/login | Rate limit (10/min/IP) | ✅ |
| POST | /v1/auth/register | Closed by default / invite token | ✅ |
| GET | /v1/auth/invites/:token | Nenhum | ⚠️ Sem rate limit → F-007 |
| GET | /v1/preview/:id/* | ULID como capability token | ✅ |
| GET/POST | /v1/track/* | Público by design (pixel) | ✅ N/A |
| POST | /v1/webhooks/explodely | HMAC signature | ⚠️ F-003 |
| POST | /v1/webhooks/vendepay?token= | Token hash | ✅ (ver F-003) |

### Rotas protegidas (JWT obrigatório)
| Método | Path | Guarda de ownership | Status |
|--------|------|---------------------|--------|
| GET | /v1/auth/me | `req.user.sub` | ✅ |
| POST | /v1/auth/change-password | `req.user.sub` | ✅ |
| POST | /v1/auth/admin-reset-own-password | Admin + `req.user.sub` | ✅ |
| POST | /v1/auth/invites | Admin check | ✅ |
| GET | /v1/auth/invites | Admin check | ✅ |
| DELETE | /v1/auth/invites/:token | Admin check | ✅ |
| GET | /v1/offers | `listAccessible(sub, isAdmin)` | ✅ |
| POST | /v1/offers | Owner = `req.user.sub` | ✅ |
| PATCH | /v1/offers/:id | `assertManager(id, sub, isAdmin)` | ✅ |
| DELETE | /v1/offers/:id | `assertManager` | ✅ |
| POST | /v1/offers/:id/ingest | `assertManager` | ✅ |
| GET | /v1/offers/:id/snapshots | `assertAccess` | ✅ |
| POST | /v1/offers/:id/sync | `assertManager` | ✅ |
| GET | /v1/offers/:id/utmify-capabilities | `assertManager` | ✅ |
| GET | /v1/offers/:id/intraday | `assertAccess` | ✅ |
| GET | /v1/offers/:id/intraday/range | `assertAccess` | ✅ |
| GET | /v1/offers/:id/ai-config | `assertAccess` | ✅ |
| PUT | /v1/offers/:id/ai-config | `assertManager` | ✅ |
| PATCH | /v1/offers/:id/ai-preferences | `assertAccess` | ✅ |
| POST | /v1/offers/:id/ai-analysis | `assertAccess` | ✅ |
| GET | /v1/offers/:id/ai-analyses | `assertAccess` | ✅ |
| PATCH | /v1/offers/:id/ai-analyses/:aid/feedback | Admin + `assertAccess` | ✅ |
| GET | /v1/dashboard/summary | `listAccessible` | ✅ |
| POST | /v1/clones | `assignOwnership(sub)` | ✅ |
| GET | /v1/clones/:id | `requireOwnership('clone', id, sub)` | ✅ |
| DELETE | /v1/clones/:id | `requireOwnership` | ✅ |
| POST | /v1/clones/:id/build | `requireOwnership('clone', id, sub)` | ✅ |
| GET | /v1/clones/:id/builds/:bid | `requireOwnership` | ✅ |
| POST | /v1/inspect | Auth ✅, mas **SSRF** | ⛔ F-001 |
| POST | /v1/vsl-jobs | `assignOwnership('vsl', sub)` | ✅ |
| GET | /v1/vsl-jobs/:id | `requireOwnership('vsl')` | ✅ |
| POST | /v1/shield-jobs | Owner = `req.user.sub` | ✅ |
| GET | /v1/shield-jobs | `listByUser(sub)` | ✅ |
| GET/PATCH/DELETE | /v1/shield-jobs/:id | `assertOwner(id, sub)` | ✅ |
| POST | /v1/media-jobs | Owner = `req.user.sub` | ✅ |
| GET | /v1/media-jobs | `listByUser(sub)` | ✅ |
| GET/PATCH/DELETE | /v1/media-jobs/:id | `assertOwner(id, sub)` | ✅ |
| POST | /v1/funnel-jobs | `assignOwnership('funnel', sub)` | ✅ |
| GET | /v1/funnel-jobs/:id | `requireOwnership('funnel')` | ✅ |
| GET | /v1/offers/:id/tracking/* | `assertAccess`/`assertManager`/`assertTrackingManager` | ✅ |
| POST | /v1/offers/:id/tracking/meta-pixels | `assertManager` | ✅ |
| PATCH/DELETE | /v1/offers/:id/tracking/meta-pixels/:pid | `assertManager` + `JOIN tp WHERE tp.offer_id=:id` | ✅ |
| GET | /v1/offers/:id/tracking/meta-deliveries | `assertAccess` | ✅ |
| POST | /v1/offers/:id/tracking/meta-events/replay | `assertManager` | ✅ |
| GET | /v1/tracking/overview | `listAccessible(sub, isAdmin)` | ✅ |
| GET | /v1/tracking/refunds-dashboard | `listAccessible` + SQL `WHERE p.offer_id = ANY(:ids)` | ✅ |
| GET | /v1/admin/overview | Admin check | ✅ |
| GET | /v1/users | Admin check | ✅ |
| PATCH | /v1/users/:id | Admin check | ✅ |
| DELETE | /v1/users/:id | Admin check | ✅ |
| * | /v1/utmify-global/* | `assertAdmin(req)` | ✅ |
| * | /v1/google-ads-admin/* | Admin check | ✅ |
| * | /v1/tiktok-ads-admin/* | Admin check | ✅ |
| * | /v1/pushcut-admin/* | Admin check | ✅ |
| * | /v1/niches/* | Admin/auth | ✅ |
| * | /v1/webhook-test/* | Auth | ✅ |
| * | /v1/recovery-admin/* | `assertAccess`/`assertManager` + Admin | ✅ |

---

## 3. ACHADOS NUMERADOS

---

### F-001 — SSRF em `POST /v1/inspect`
**Severidade:** HIGH  
**CWE:** CWE-918 (Server-Side Request Forgery)  
**Arquivo:linha:** `packages/api/src/routes/inspect.ts:22`

**Descrição:**  
O endpoint `POST /v1/inspect` recebe uma URL controlada pelo usuário e a entrega diretamente ao `core.fetchPage(url, ...)`, que usa Playwright/Chromium para buscar a página. Não há allowlist de esquemas, blocklist de IPs privados, nem validação de host.

**Código vulnerável:**
```typescript
// inspect.ts:22
const fetched = await core.fetchPage(url, { renderMode: 'static', timeoutMs: 20_000 });
```

**Cenário de exploração:**  
Fulano (membro autenticado) faz `POST /v1/inspect { "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/" }`. O servidor Railway busca o endpoint AWS Instance Metadata e retorna credenciais IAM temporárias no body da resposta. Ou usa `http://localhost:6379` para interagir com Redis.

**Correção sugerida:**
```typescript
import { URL } from 'node:url';

const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|fc00:)/i;
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

function validateNoSsrf(rawUrl: string): void {
  const parsed = new URL(rawUrl);
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) throw new BadRequestError('Esquema não permitido.');
  if (PRIVATE_IP_RE.test(parsed.hostname)) throw new BadRequestError('Host privado não permitido.');
}
```

---

### F-002 — CORS `origin: true` + `credentials: true`
**Severidade:** HIGH  
**CWE:** CWE-942 (Overly Permissive Cross-domain Allowlist)  
**Arquivo:linha:** `packages/api/src/plugins/cors.ts:8-9`

**Descrição:**  
A configuração `origin: true` faz o `@fastify/cors` **refletir qualquer valor de `Origin`** no cabeçalho `Access-Control-Allow-Origin`. Combinado com `credentials: true`, isso significa que qualquer site pode fazer uma requisição credenciada à API e o browser irá incluir o token Bearer se o código front-end mantiver o token em memória e a página atacante conseguir chamá-lo via fetch com cookies (ou se um ataque de XSS em outro domínio existir).

**Código vulnerável:**
```typescript
// cors.ts:8-9
origin: true,     // ← ecoa qualquer Origin
credentials: true // ← + credentials → qualquer site consegue
```

Nota: A especificação proíbe `Access-Control-Allow-Origin: *` com `credentials: true`, mas **refletir o Origin é igualmente perigoso** e browsers aceitam.

**Cenário de exploração:**  
Um site malicioso `https://evil.example` carrega um iframe ou página com código que faz `fetch('https://api.theminex.com/v1/offers', { credentials: 'include', headers: { Authorization: 'Bearer TOKEN_DE_FULANO' } })`. O CORS responde com `Access-Control-Allow-Origin: https://evil.example` e o browser entrega a resposta ao atacante.

**Correção sugerida:**
```typescript
const ALLOWED_ORIGINS = [
  'https://theminex.com',
  'https://app.theminex.com',
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3100'] : []),
];
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error('CORS not allowed'), false);
  },
  credentials: true,
  // ...
});
```

---

### F-003 — `WEBHOOK_SECRET` com default fraco sem validação de prod
**Severidade:** MEDIUM  
**CWE:** CWE-521 (Weak Password Requirements for Production Systems)  
**Arquivo:linha:** `packages/api/src/env.ts:41`

**Descrição:**  
`WEBHOOK_SECRET` tem valor default `'dev-webhook-secret-change-me-in-production'`. Ao contrário de `JWT_SECRET` (que tem `.refine()` bloqueando o default), `WEBHOOK_SECRET` não tem essa proteção. Se a variável não for definida no Railway, webhooks Vendepay/outros podem ser forjados por qualquer um que conheça o default.

**Código vulnerável:**
```typescript
// env.ts:41
WEBHOOK_SECRET: z.string().default('dev-webhook-secret-change-me-in-production'),
// JWT_SECRET tem refine() bloqueando o default ← faz isso aqui também
```

**Cenário de exploração:**  
Atacante envia um webhook forjado com o default secret e força um "pagamento aprovado" para uma oferta de outro membro, gerando entrega Meta CAPI falsa ou notificação de venda falsa.

**Correção sugerida:**
```typescript
WEBHOOK_SECRET: z.string().min(32).refine(
  (s) => s !== 'dev-webhook-secret-change-me-in-production',
  { message: 'must not use the development default in production' }
),
```

---

### F-004 — JWT TTL de 14 dias sem mecanismo de revogação
**Severidade:** MEDIUM  
**CWE:** CWE-613 (Insufficient Session Expiration)  
**Arquivo:linha:** `packages/api/src/lib/jwt.ts:35`

**Descrição:**  
Os tokens têm validade de 14 dias (`ttlSeconds = 60 * 60 * 24 * 14`). Não há refresh token, blacklist, ou invalidação seletiva. Se um token vazar (log, clipboard, XSS), ele fica válido por até 14 dias. Deleção do usuário invalida (porque `requireAuth` valida existência no store), mas não há como revogar um token específico de um usuário ativo.

**Arquivo:linha:** `jwt.ts:35`, `auth.ts:71` (não há blacklist antes de retornar o user)

**Cenário de exploração:**  
Fulano percebe que sua sessão foi comprometida. Admin deleta e recria o usuário, mas o token antigo era de uma conta diferente. Ou: Fulano loga de um computador público, não faz logout, o token fica ativo por 14 dias.

**Correção sugerida (mínima):** Reduzir TTL para 24h e adicionar um set Redis `revoked-tokens:{userId}` verificado em `requireAuth`. Alternativa: emitir refresh token de curta duração (1h access + 7d refresh com rotação).

---

### F-005 — SSRF potencial em `webhookUrl` de clone jobs
**Severidade:** MEDIUM  
**CWE:** CWE-918 (Server-Side Request Forgery)  
**Arquivo:linha:** `packages/api/src/routes/clones.ts:121-126`

**Descrição:**  
O campo `options.webhookUrl` aceita qualquer URL válida fornecida pelo usuário e é armazenado no job. Quando o clone termina, o worker de render entrega uma requisição HTTP para essa URL. Sem validação de host/esquema, um membro pode apontar para um IP interno.

```typescript
// clones.ts:121-126
const meta = await app.jobStore.createClone({
  id: jobId,
  sourceUrl: parsed.data.url,
  options,
  ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),  // URL do usuário
});
```

**Cenário de exploração:**  
Fulano cria um clone com `webhook_url: "http://169.254.169.254/latest/meta-data/"`. O worker processa e faz POST para o endpoint de metadata AWS, potencialmente fazendo exfiltração assíncrona de credenciais.

**Correção sugerida:** Aplicar a mesma validação anti-SSRF de F-001 no campo `webhookUrl` antes de persistir.

---

### F-006 — Credenciais S3 com defaults inseguros sem validação
**Severidade:** MEDIUM  
**CWE:** CWE-255 (Credentials Management Errors)  
**Arquivo:linha:** `packages/api/src/env.ts:31-32`

**Descrição:**  
`S3_ACCESS_KEY` e `S3_SECRET_KEY` têm defaults `'minioadmin'`. Se as variáveis não forem definidas no Railway (ou em caso de misconfiguration silenciosa), o servidor tentará se conectar ao bucket S3/R2 com credenciais de desenvolvimento.

**Correção sugerida:** Adicionar `refine()` igual ao JWT_SECRET, ou ao menos um warning crítico no boot. Melhor ainda: remover os defaults e marcar como `z.string().min(16)` obrigatório.

---

### F-007 — Sem rate limit em `GET /auth/invites/:token`
**Severidade:** LOW  
**CWE:** CWE-307 (Improper Restriction of Excessive Authentication Attempts)  
**Arquivo:linha:** `packages/api/src/routes/auth.ts:167`

**Descrição:**  
O endpoint público `GET /auth/invites/:token` não tem rate limit. Tokens de convite são ULIDs (26 chars, ~128 bits), o que torna brute-force impraticável na prática, mas a ausência de rate limit significa que a rota pode ser usada para reconhecimento (verificar se um token específico existe) ou como amplificador de requisições.

**Correção sugerida:**
```typescript
app.get<{ Params: { token: string } }>(
  '/auth/invites/:token',
  { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
  async (req, reply) => { ... }
);
```

---

### F-008 — Sem audit log de ações administrativas sobre membros
**Severidade:** LOW  
**Arquivo:linha:** `packages/api/src/routes/users.ts:155-208`

**Descrição:**  
Quando admin altera `role`, `allowed_tools` ou `name` de um membro, ou deleta uma conta, a ação não é registrada no `activityStore`. O painel `/admin/overview` mostra atividade dos usuários, mas não mostra "admin alterou conta de Fulano". Em caso de disputa ou incidente, não há rastreabilidade.

**Correção sugerida:** Adicionar `app.activityStore.record(req.user.sub, { kind: 'admin-update-user', targetId: req.params.id, ... })` nas mutations de `/users/:id`.

---

### F-009 — AI preferences de membro não removidas ao deletar oferta
**Severidade:** LOW  
**Arquivo:linha:** `packages/api/src/services/offer-store.ts:254-263`

**Descrição:**  
`offerStore.delete()` remove `offer:{id}`, `offer-utmify:{id}`, `offer-ai-config:{id}`, `offer-ai-history:{id}`, mas **não** remove `offer-ai-preferences:{offerId}:{userId}`. Se o membro tiver preferências salvas, elas ficam como dados órfãos no Redis e podem vazar para uma oferta com o mesmo ID criada depois (improvável com ULID, mas teoricamente possível).

**Correção sugerida:** Adicionar limpeza do padrão `offer-ai-preferences:{id}:*` com `SCAN + DEL` no método `delete()`.

---

### F-010 (INFO) — `can_configure_tracking` sempre `false` para membros no wire
**Severidade:** INFO (bug de UI, não segurança)  
**Arquivo:linha:** `packages/api/src/routes/offers.ts:43`

`offerToWire()` chama `canConfigureTrackingOffer(o, userId, isAdmin)` sem passar o 4º argumento `memberRole`, que defaulta para `'member'`. Resultado: o campo `can_configure_tracking` retorna sempre `false` para membros que deveriam ser `tracking_manager`. Isso é apenas um bug de display — a **guarda real** em tracking-admin.ts usa `assertTrackingManager()` que consulta o PostgreSQL corretamente.

---

### F-011 (INFO) — Convite sem scope de ferramenta seta `allowedTools = undefined` (acesso total)
**Severidade:** INFO (comportamento documentado, mas vale confirmar)  
**Arquivo:linha:** `packages/api/src/routes/auth.ts:118-125`

Se o admin criar um convite sem `allowed_tools`, o usuário nasce sem `allowedTools` (acesso total a todas as ferramentas). Isso é intencional, mas vale validar que convites para membros externos sempre incluam `allowed_tools` explícito.

---

## 4. ANÁLISE POR CATEGORIA OWASP API TOP 10 (2023)

| API# | Categoria | Status | Achados |
|------|-----------|--------|---------|
| API1 | BOLA | ✅ Implementado | Todos os endpoints usam guard correto |
| API2 | Broken Authentication | ✅ Com ressalvas | JWT custom com timingSafeEqual; F-003, F-004 |
| API3 | Mass Assignment / Over-exposure | ✅ | Zod .strict() em todos schemas; API key não exposta |
| API4 | Unrestricted Resource Consumption | ✅ | Rate limit global 600/min + login 10/min; F-007 |
| API5 | BFLA | ✅ | Admin routes verificam role explicitamente |
| API6 | Sensitive Business Flows | ✅ | Registro fechado por default; invites expiram |
| API7 | SSRF | ⛔ | F-001 (inspect), F-005 (webhookUrl) |
| API8 | Security Misconfiguration | ⛔ | F-002 (CORS), F-003 (webhook secret) |
| API9 | Improper Inventory | ✅ | Sem rotas órfãs visíveis; preview é público by design |
| API10 | Unsafe API Consumption | ✅ | Respostas Meta/UTMify validadas antes de usar |

---

## 5. PONTOS FORTES (não mudar)

1. **`requireAuth` sempre refesca role do store** — role no JWT nunca tem validade "presa" mesmo com token de 14 dias
2. **JWT custom com `timingSafeEqual`** — sem vulnerability a timing attack
3. **JWT_SECRET bloqueado contra default dev** — API não sobe com secret fraco
4. **Zod `.strict()` em todos os schemas** — zero mass-assignment
5. **`canManageOffer` não usa 404 mascarando 403** — uso intencional de `NotFoundError` para não revelar existência de oferta de outro tenant (informational leak prevention)
6. **Queries PostgreSQL todas parametrizadas** — sem SQL injection
7. **Logger com redact em campos sensíveis** — password, token, access_token, IP não aparecem em logs
8. **EXPLODELY_REQUIRE_SIGNATURE defaults true** — assinatura requerida por padrão
9. **Credenciais UTMify e Meta tokens criptografadas com AES-256-GCM** — não armazenadas em plaintext
10. **`assignOwnership` + `requireOwnership`** — ownership de clones/VSL/funnel verificado antes de qualquer operação

---

## 6. CHECKLIST PRÉ-LIBERAÇÃO DE MEMBRO EXTERNO

### 🔴 BLOQUEADORES — Corrigir ANTES de convidar qualquer membro:

- [ ] **F-001** — Adicionar validação anti-SSRF em `POST /inspect` (allowlist de esquemas, blocklist de IPs privados/cloud metadata)
- [ ] **F-002** — Substituir `origin: true` por allowlist explícita de origens em `cors.ts`
- [ ] **F-003** — Adicionar `refine()` em `WEBHOOK_SECRET` para rejeitar o default dev
- [ ] **F-006** — Validar `S3_ACCESS_KEY`/`S3_SECRET_KEY` como não-default no boot

### 🟡 RECOMENDADOS — Corrigir antes ou logo após o primeiro convite:

- [ ] **F-004** — Reduzir TTL do JWT para ≤ 24h ou implementar blacklist de tokens por usuário
- [ ] **F-005** — Validar `webhookUrl` de clone jobs contra lista de esquemas/hosts permitidos
- [ ] **F-007** — Adicionar rate limit em `GET /auth/invites/:token`
- [ ] **F-008** — Implementar audit log de ações de admin sobre membros

### 🟢 BACKLOG — Podem esperar:

- [ ] **F-009** — Limpar `offer-ai-preferences:{id}:*` ao deletar oferta
- [ ] **F-010** — Corrigir `canConfigureTrackingOffer` em `offerToWire` para passar `memberRole` real
- [ ] **F-011** — Documentar/alertar que convites sem `allowed_tools` concedem acesso total

---

## 7. RESPOSTA À PERGUNTA DO DONO

> "Se eu convidar o Fulano hoje, ele consegue, de qualquer forma, ver ou mexer em dado que não é dele?"

**Com as correções F-001 a F-006 aplicadas: NÃO.**  
Sem essas correções: **Sim para F-001** — Fulano pode usar `POST /inspect` para fazer o servidor buscar URLs internas (SSRF), o que não é dado de outro membro, mas é acesso indevido a infraestrutura. Dados de outros tenants (ofertas, snapshots, credenciais) estão corretamente isolados — BOLA está bem implementado em todo o código.

A principal superfície de ataque atual não é vazamento de dados entre membros, mas sim um membro comprometendo a infraestrutura via SSRF.

---

*Auditoria realizada via análise estática de código-fonte. Não foram executados payloads contra o ambiente de produção. Reprodução de cenários em ambiente de desenvolvimento é fortemente recomendada antes do deploy das correções.*
