# Auditoria 02 — Webhooks, segredos e variáveis de ambiente

Data: 2026-10-06  
Escopo: `packages/api/src/`, `packages/web/src/`, migrations de tracking e comparação nominal com o inventário Railway fornecido.  
Método: revisão estática read-only. Nenhum comando Railway, request externo, teste contra endpoint, commit ou push foi executado. Valores de produção não foram lidos nem reproduzidos.

## Resumo executivo

Foram encontrados **14 findings: 0 críticos, 3 altos, 7 médios e 4 baixos**.

Os dois receptores de gateway são protegidos somente por um token de alta entropia na query string. VendePay e Paysight possuem `signing_secret_encrypted` no modelo administrativo, mas os receptores não carregam nem usam esse segredo, não validam HMAC, timestamp ou nonce e não fazem comparação timing-safe de assinatura. O token é consultado antes da normalização do body, porém o JSON já foi parseado pelo Fastify antes da entrada no handler; não há `rawBody` para verificação criptográfica do payload.

A produção inventariada não contém `JWT_SECRET`. O código, portanto, aceita o fallback público `dev-jwt-secret-change-me-in-production`; essa mesma chave assina JWTs e deriva a chave que cifra credenciais UTMify/IA armazenadas no Redis. Este é o maior risco de segredo/configuração desta fatia.

Há idempotência durável nos dois gateways: VendePay usa `UNIQUE(connection_id, dedupe_key)` e Paysight usa `UNIQUE(gateway_connection_id, dedupe_key)`, ambos com `ON CONFLICT ... DO NOTHING`. A implementação preserva mudanças de ciclo de vida da mesma transação. Porém, o replay de quarentena VendePay nunca marca o recibo original como processado e passa a contar respostas `duplicate` como replay concluído, mantendo os mesmos recibos elegíveis indefinidamente.

O plugin global de rate limit cobre os webhooks e as rotas públicas pedidas (`/v1/c/:slug`, `/v1/track/t.js`, `/v1/link/:testId`). Não foi encontrada rota explicitamente com `rateLimit: false`. A proteção, contudo, é genérica (600/minuto por IP ou `x-api-key`), confia em `req.ip` com `trustProxy: true` e falha aberta quando o Redis erra.

## Findings — alta

### SEC-B-001 — VendePay ignora o signing secret e aceita eventos autenticados apenas por token na URL

- **Severidade:** Alta
- **Categoria:** OWASP API2 / API8; CWE-345 (insufficient verification of data authenticity)
- **Evidência:** `packages/api/src/routes/tracking-public.ts:1336-1360`; `packages/api/src/routes/tracking-admin.ts:1083-1103`; `packages/api/migrations/007_vendepay_signing_secret.sql:1-3`.
- **Fato verificado:** o handler exige `?token=`, calcula SHA-256 e busca o hash no banco antes de chamar `normalizeVendepay(req.body)`. Não lê headers de assinatura, não carrega `signing_secret_encrypted`, não usa `createHmac`, `timingSafeEqual` nem `rawBody`. A área administrativa permite persistir um signing secret cifrado, mas o receptor não o usa.
- **Ordem real:** parse JSON do Fastify → handler → validação do token de URL → normalização → dedupe/persistência. O limite de body é 256 KiB, mas a autenticidade do conteúdo não é comprovada.
- **Impacto:** qualquer vazamento da URL-capability permite forjar vendas, estornos, chargebacks e acionar entregas Meta/UTMify/TikTok/Pushcut. O token na query pode aparecer em histórico, proxy/CDN/APM ou ferramentas do operador.
- **Remediação:** usar o token apenas para localizar a conexão; validar HMAC do provedor sobre os bytes exatos do corpo, com timestamp/nonce e janela de replay, antes de parsear/processar. Capturar raw body em hook/plugin específico e comparar buffers de tamanho igual com `timingSafeEqual`. Recusar conexões com signing secret configurado quando a assinatura estiver ausente/inválida.

### SEC-B-002 — Paysight também ignora o signing secret e não autentica criptograficamente o payload

- **Severidade:** Alta
- **Categoria:** OWASP API2 / API8; CWE-345
- **Evidência:** `packages/api/src/routes/tracking-public.ts:1891-1917`; `packages/api/src/routes/tracking-admin.ts:978-1023`; `packages/api/migrations/065_payment_gateway_connections.sql:4-9`.
- **Fato verificado:** a criação/edição da conexão cifra `signing_secret`, mas o receptor seleciona somente `webhook_token_hash`. Não há leitura de assinatura, HMAC, raw body, timestamp ou nonce. A comparação do token ocorre indiretamente por igualdade do hash no PostgreSQL, não por comparação timing-safe de uma assinatura.
- **Impacto:** quem obtiver a URL pode criar ou alterar estados financeiros e disparar outboxes de conversão. Como o token é o único autenticador, o vazamento da URL equivale a comprometimento integral do webhook.
- **Remediação:** mesma defesa de SEC-B-001, usando o esquema de assinatura documentado pela Paysight e rejeitando antes de qualquer fan-out ou persistência.

### SEC-B-003 — Produção cai no `JWT_SECRET` público e previsível

- **Severidade:** Alta
- **Categoria:** OWASP API2 / API8; CWE-798
- **Evidência:** `packages/api/src/env.ts:40-47`; `packages/api/src/routes/auth.ts:65-85`; `packages/api/src/plugins/auth.ts:59-78`; `packages/api/src/plugins/storage.ts:41`; `packages/api/src/services/offer-store.ts:100-107,279-313,501-520`.
- **Fato verificado:** `JWT_SECRET` não aparece no inventário Railway fornecido nem em `.env.example`; o schema usa `dev-jwt-secret-change-me-in-production` como default. A chave assina tokens HS256 e também deriva a AES-256-GCM que protege credenciais UTMify e API keys de IA no Redis.
- **Impacto:** tokens podem ser assinados offline para um `sub` válido conhecido, e um comprometimento do Redis expõe ciphertext cifrado com uma chave pública/conhecida. A checagem de usuário existente e o refresh de role reduzem, mas não eliminam, o impacto de forja.
- **Remediação:** tornar `JWT_SECRET` obrigatório em `NODE_ENV=production`, mínimo 32 bytes aleatórios, separar chave de JWT da chave de cifragem do `OfferStore`, adicionar ambos ao template/documentação e suportar rotação com `kid`/chave anterior durante a janela de migração.

## Findings — média

### SEC-B-004 — Replay de quarentena VendePay não encerra o recibo e contabiliza duplicata como sucesso

- **Severidade:** Média
- **Categoria:** OWASP API4; CWE-400
- **Evidência:** `packages/api/src/routes/tracking-public.ts:1394-1405,1643-1647,2007-2051`; `packages/api/migrations/001_tracking_foundation.sql:39-47`.
- **Fato verificado:** o replay busca até 500 recibos ainda em `state='quarantined'`, reinjeta o payload e conta qualquer 2xx como `replayed`. Quando a nova normalização gera outro `dedupe_key`, um novo recibo pode ser processado; nas execuções seguintes ele vira `duplicate`, ainda responde 200, e o recibo original permanece `quarantined` para sempre. Não há `replay_attempts`, backoff, estado terminal nem atualização atômica do recibo de origem.
- **Impacto:** a mesma quarentena pode ser reprocessada indefinidamente, gerar carga repetida de normalização/Redis/FX/DB e produzir telemetria falsa de sucesso.
- **Remediação:** processar o recibo selecionado por ID, registrar `replay_attempts`, `last_replay_at`, erro e estado terminal; ao sucesso, marcar/migrar o recibo original atomicamente. Não contar `duplicate` como replay novo.

### SEC-B-005 — Batch Paysight cria fan-out concorrente sem limite por request

- **Severidade:** Média
- **Categoria:** OWASP API4; CWE-400
- **Evidência:** `packages/api/src/routes/tracking-public.ts:1891-1911`.
- **Fato verificado:** qualquer array com mais de um elemento é transformado em `Promise.all(req.body.map(app.inject(...)))`. Há limite total de 256 KiB, mas não há limite de quantidade de elementos, concorrência ou tamanho mínimo por item.
- **Impacto:** um único request autenticado pelo token de URL pode alocar milhares de promises/subrequests concorrentes e multiplicar consultas/transactions, antes de o rate limit externo regular cada evento de negócio.
- **Remediação:** schema estrito de batch com `max(N)`, fila/loop com concorrência pequena, limite por conexão e rejeição antecipada de arrays excessivos. Validar assinatura do batch antes do fan-out.

### SEC-B-006 — Payload bruto e PII de compradores ficam persistidos em plaintext sem retenção

- **Severidade:** Média
- **Categoria:** OWASP API3 / API8; CWE-359
- **Evidência:** `packages/api/src/routes/tracking-public.ts:1395-1400,1920-1934,1953-1966`; `packages/api/migrations/001_tracking_foundation.sql:39-47,50-64`; `packages/api/migrations/065_payment_gateway_connections.sql:27-37`; `packages/api/src/integrations/vendepay/normalize.ts:285-366`; `packages/api/src/integrations/paysight/normalize.ts:141-149`.
- **Fato verificado:** os recibos armazenam o payload JSON integral, e `tracking_orders.buyer` armazena nome, e-mail, telefone, país e CEP. Não foi encontrada rotina de expurgo/TTL para nenhuma das duas tabelas de recibos.
- **Logs:** os handlers usam `logLevel: 'silent'` e não logam o body; o risco confirmado é persistência no banco, não log direto do receptor.
- **Remediação:** minimizar/redigir o payload, cifrar campos necessários, aplicar retenção documentada e controle de acesso/auditoria sobre recibos.

### SEC-B-007 — Rate limit global falha aberto e usa identidade de IP excessivamente confiável

- **Severidade:** Média
- **Categoria:** OWASP API4; CWE-770
- **Evidência:** `packages/api/src/plugins/rate-limit.ts:4-22`; `packages/api/src/server.ts:35-50`.
- **Fato verificado:** o limite global é 600/minuto e cobre todas as rotas em escopo, porém `skipOnError: true` desativa a barreira se o Redis falhar. A chave é `req.ip`, enquanto o servidor usa `trustProxy: true`; a robustez contra spoof de `X-Forwarded-For` depende integralmente da normalização do proxy Railway.
- **Rotas pedidas:** `/v1/webhooks/vendepay`, `/v1/webhooks/paysight`, `/v1/webhooks/vendepay/replay-quarantine`, `/v1/c/:slug`, `/v1/track/t.js` e `/v1/link/:testId` estão sob o plugin global; nenhuma foi encontrada com opt-out.
- **Remediação:** limite específico e menor para webhooks/replay, chave por conexão + IP, teto de concorrência/batch e política fail-closed ou fallback local para rotas de custo alto. Configurar uma cadeia explícita de proxies confiáveis.

### SEC-B-008 — A API de produção usa um token Railway capaz de mutar infraestrutura

- **Severidade:** Média
- **Categoria:** OWASP API8; princípio de menor privilégio
- **Evidência:** `packages/api/src/env.ts:59-62`; `packages/api/src/integrations/railway/domains.ts:15-47,74-94`; `packages/api/src/routes/tracking-advanced.ts:1178-1212,1294-1308`.
- **Fato verificado:** `RAILWAY_PROJECT_TOKEN` está no inventário de produção e é usado ativamente para `customDomainCreate` e `customDomainDelete`. O código espera `RAILWAY_API_SERVICE_ID`, que não está no inventário, e recorre a um UUID hardcoded; `RAILWAY_SERVICE_ID` existe, mas não é lido.
- **Impacto:** comprometimento da API amplia o alcance para mutação do projeto Railway. O fallback de service ID cria acoplamento silencioso e pode direcionar operações ao serviço errado após clone/migração.
- **Remediação:** usar credencial com escopo mínimo/serviço intermediário, tornar IDs obrigatórios sem defaults hardcoded, mapear explicitamente `RAILWAY_SERVICE_ID` ou renomear a variável e auditar cada operação de domínio sem registrar token.

### SEC-B-009 — URL completa de callback do operador é gravada em logs

- **Severidade:** Média
- **Categoria:** OWASP API8; CWE-532
- **Evidência:** `packages/api/src/services/webhook.ts:15-40`; chamadas ativas em `packages/api/src/workers/render.worker.ts:169-195`; redaction em `packages/api/src/lib/logger.ts:6-19`.
- **Fato verificado:** `logger.child({ webhook: webhookUrl, ... })` inclui a URL completa. A lista de redaction não cobre o campo `webhook` nem parâmetros de query.
- **Impacto:** callbacks frequentemente carregam tokens/chaves no path ou query; esses segredos passam a residir em logs e agregadores.
- **Remediação:** logar apenas origin + hostname ou URL sanitizada, removendo userinfo, path sensível e query; adicionar redaction para `*.webhook`, `*.webhookUrl` e variantes.

### SEC-B-010 — Segredos críticos são single-slot e não têm caminho seguro de rotação

- **Severidade:** Média
- **Categoria:** OWASP API8; gestão de chaves
- **Evidência:** `packages/api/src/env.ts:20-66`; `packages/api/src/lib/secret-box.ts:1-20`; `packages/api/src/services/offer-store.ts:100-107,501-520`.
- **Fato verificado:** pelos nomes fornecidos não é possível provar idade nem última rotação. Porém, não existem variáveis `*_CURRENT`/`*_PREVIOUS`, `kid` no ciphertext ou fallback de chave anterior. `TRACKING_ENCRYPTION_KEY` e `JWT_SECRET` derivam diretamente uma única chave; trocar o valor torna dados existentes indecifráveis.
- **Segredos de produção com slot único:** `WEBHOOK_SECRET`, `TRACKING_ENCRYPTION_KEY`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `YOUTUBE_REWARDS_WEBHOOK_SECRET`, `S3_SECRET_KEY`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `REDISPASSWORD`, `PGPASSWORD`, `ASSEMBLYAI_API_KEY`.
- **Remediação:** registrar metadados de versão/rotação fora do valor, aceitar chave atual + anterior durante migração, recriptografar dados em lote e remover aliases antigos após confirmação.

## Findings — baixa

### SEC-B-011 — `.env.example` documenta apenas parte do contrato real de runtime

- **Severidade:** Baixa
- **Categoria:** OWASP API8 / API9
- **Evidência:** `.env.example:1-31`; `packages/api/src/env.ts:10-67`; `packages/api/src/integrations/google-ads/oauth.ts:19-24`.
- **Fato verificado:** o arquivo contém **20 nomes**, não 19. Variáveis ativas e sensíveis como `JWT_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, `RAILWAY_PROJECT_TOKEN` e `YOUTUBE_REWARDS_WEBHOOK_SECRET` não estão documentadas nele. Algumas variáveis importantes também faltam simultaneamente no Railway e no exemplo, ficando em defaults (`TRACKING_PUBLIC_BASE_URL`, `RAILWAY_API_SERVICE_ID`, `JWT_SECRET`).
- **Impacto:** novas implantações tendem a herdar defaults inseguros ou apontar para recursos incorretos.
- **Remediação:** gerar/documentar um contrato completo, separar variáveis da aplicação das injetadas pela plataforma e falhar o boot de produção para segredos obrigatórios/defaults de desenvolvimento.

### SEC-B-012 — Três aliases de senha PostgreSQL e três formas Redis elevam risco de divergência

- **Severidade:** Baixa
- **Categoria:** configuração operacional
- **Evidência nominal Railway:** `POSTGRES_PASSWORD`, `PGPASSWORD`, `DATABASE_URL`; `REDIS_PASSWORD`, `REDISPASSWORD`, `REDIS_URL` (também `REDIS_PUBLIC_URL`). Código ativo lê somente `DATABASE_URL` e `REDIS_URL` (`packages/api/src/env.ts:20-21`).
- **Fato/inferência:** sem ler valores, não é possível afirmar que divergem; a duplicação confirma múltiplas fontes potenciais para o mesmo cluster. Bibliotecas auxiliares/CLI podem consumir aliases diferentes do aplicativo.
- **Remediação:** manter uma fonte canônica por serviço via referências Railway, documentar quais aliases são gerados pela plataforma e adicionar health check que compare destino/identidade sem expor credenciais.

### SEC-B-013 — E-mail do admin bootstrap é logado em claro

- **Severidade:** Baixa
- **Categoria:** CWE-532
- **Evidência:** `packages/api/src/plugins/auth.ts:39-53`.
- **Fato verificado:** na criação inicial, `app.log.info({ email: env.ADMIN_EMAIL }, ...)` registra PII. Não foi encontrado log direto de senha, token, CPF ou body de webhook.
- **Remediação:** remover o e-mail ou registrar somente hash/domínio mascarado.

### SEC-B-014 — `/readyz` público expõe paths internos e valor de env operacional

- **Severidade:** Baixa
- **Categoria:** OWASP API8; CWE-200
- **Evidência:** `packages/api/src/routes/index.ts:68-81`; `packages/api/src/routes/health.ts:13-74`.
- **Fato verificado:** `/readyz` é público e retorna `chromium.executablePath()`, mensagens de Redis/Postgres/S3 e `PLAYWRIGHT_BROWSERS_PATH` diretamente na resposta.
- **Remediação:** deixar apenas status agregado no endpoint público e mover detalhes para endpoint autenticado/telemetria interna.

## Cross-check Railway ↔ `.env.example`

### Em Railway e ausentes de `.env.example` (43)

**Usadas diretamente por código ativo:**

- `ASSEMBLYAI_API_KEY`
- `GOOGLE_ADS_OAUTH_CLIENT_ID`
- `GOOGLE_ADS_OAUTH_CLIENT_SECRET`
- `GOOGLE_ADS_OAUTH_REDIRECT_URI`
- `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_PROJECT_TOKEN`
- `YOUTUBE_REWARDS_WEBHOOK_SECRET`
- `YOUTUBE_REWARDS_WEBHOOK_URL`

**Presentes, mas sem leitura direta no código auditado (plataforma/serviço/aliases):**

- `DATABASE_PUBLIC_URL`
- `PGDATA`, `PGDATABASE`, `PGHOST`, `PGPASSWORD`, `PGPORT`, `PGUSER`
- `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`
- `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`
- `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`
- `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_PROJECT_NAME`
- `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_SERVICE_ID`, `RAILWAY_SERVICE_NAME`
- `RAILWAY_SERVICE__PAGE_CLONER_API_URL`, `RAILWAY_SERVICE__PAGE_CLONER_WEB_URL`
- `RAILWAY_STATIC_URL`
- `RAILWAY_TCP_APPLICATION_PORT`, `RAILWAY_TCP_PROXY_DOMAIN`, `RAILWAY_TCP_PROXY_PORT`
- `RAILWAY_VOLUME_ID`, `RAILWAY_VOLUME_MOUNT_PATH`, `RAILWAY_VOLUME_NAME`
- `REDISHOST`, `REDISPASSWORD`, `REDISPORT`, `REDISUSER`, `REDIS_PASSWORD`, `REDIS_PUBLIC_URL`
- `SSL_CERT_DAYS`

### Em `.env.example` e ausentes do Railway (3)

| Variável | Uso/fallback | Severidade operacional |
|---|---|---|
| `API_PORT` | `env.ts:15-17`; fallback 4000 e `PORT` tem precedência | Baixa |
| `API_HOST` | `env.ts:17`; fallback `0.0.0.0` | Baixa |
| `META_GRAPH_API_VERSION` | `env.ts:23-26`; fallback `v25.0` | Baixa; pode envelhecer silenciosamente |

Nenhuma das três ausências afeta diretamente a autenticação dos webhooks/tracking. O risco crítico por ausência está fora desta interseção literal: `JWT_SECRET` não consta nem no exemplo nem no inventário Railway e, portanto, ativa o fallback inseguro descrito em SEC-B-003.

### Segredos do inventário e uso ativo

| Nome | Single-slot nominal | Uso por código ativo |
|---|---:|---|
| `WEBHOOK_SECRET` | Sim | Sim — assina callback do page cloner e tokens internos de tracking/upsell |
| `TRACKING_ENCRYPTION_KEY` | Sim | Sim — cifra Meta, TikTok, UTMify, Pushcut, V-Turb, Google refresh tokens e secrets de gateway |
| `GOOGLE_ADS_OAUTH_CLIENT_SECRET` | Sim | Sim — troca de authorization code OAuth |
| `YOUTUBE_REWARDS_WEBHOOK_SECRET` | Sim | Sim — header `x-tmxhub-secret` em provisioning |
| `S3_SECRET_KEY` | Sim | Sim — credencial do `S3Client` |
| `ASSEMBLYAI_API_KEY` | Sim | Sim — upload/transcrição do Shield |
| `POSTGRES_PASSWORD` | Sim | Não diretamente; provável insumo do serviço/URL |
| `PGPASSWORD` | Sim | Não diretamente |
| `REDIS_PASSWORD` | Sim | Não diretamente |
| `REDISPASSWORD` | Sim | Não diretamente |

Observação: “single-slot nominal” significa somente que não há nome paralelo de chave anterior/próxima no inventário; não comprova quando o valor foi rotacionado.

### `RAILWAY_PROJECT_TOKEN`

É usado por código ativo em `packages/api/src/integrations/railway/domains.ts:18-45,75-89` para criar e excluir custom domains. Não é variável ociosa. A presença no runtime da API é o red flag documentado em SEC-B-008.

## Controles positivos e resultados sem finding

- **Idempotência VendePay:** dedupe por evento ou combinação `transaction_id + status + amount + currency + src`, constraint única e transação (`normalize.ts:501-519`; migration `001:39-47`; handler `1394-1405`). O upsert de ordem impede duplicação comercial por `(project_id, provider, external_id)`.
- **Idempotência Paysight:** dedupe inclui transação, status e fingerprint do evento; constraint única em `tracking_gateway_webhook_receipts` e outboxes também usam uniques.
- **Criptografia per-tenant:** `secret-box.ts` usa AES-256-GCM com IV aleatório de 12 bytes e auth tag. Meta, TikTok e UTMify de tracking são cifrados antes de persistir. Credenciais UTMify legadas no Redis também usam AES-256-GCM, mas com chave derivada de `JWT_SECRET`, o que agrava SEC-B-003.
- **Hardcoded secret scan:** o regex solicitado produziu 417 strings candidatas, majoritariamente nomes de rota, códigos de erro e identificadores. A triagem adicional por formatos conhecidos (`AKIA`, `ghp_`, `sk-`, `xox*`, PEM e bearer longo) não encontrou credencial viva em `packages/api/src/` ou `packages/web/src/`. Foram encontrados defaults de desenvolvimento previsíveis em `env.ts`, já cobertos por SEC-B-003/SEC-B-011.
- **URLs privadas:** não foram encontrados domínios `*.internal` nem webhook privado hardcoded nos diretórios auditados. Há defaults localhost e exemplos públicos. URLs secretas de gateway são devolvidas uma única vez em respostas autenticadas de criação/rotação, por desenho; não são reexibidas em GET.
- **Logs dos receptores:** VendePay e Paysight usam `logLevel: 'silent'` e não logam body/headers. O logger global já redige `Authorization`, `x-api-key` e cookie, mas não URLs de callback, conforme SEC-B-009.
- **`process.env` em logs:** não foi encontrado `process.env.<segredo>` enviado diretamente ao logger. `PLAYWRIGHT_BROWSERS_PATH` é exposto pela resposta pública de readiness (SEC-B-014).

## Contagem final

| Severidade | Quantidade |
|---|---:|
| Crítica | 0 |
| Alta | 3 |
| Média | 7 |
| Baixa | 4 |
| **Total** | **14** |

