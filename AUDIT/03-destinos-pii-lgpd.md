# Auditoria de destinos externos, PII/LGPD e logs — Fatia C

Data da revisão: 2026-10-06  
Escopo: Meta CAPI/Marketing API, TikTok Events API, Google Ads/Data Manager, UTMify, Pushcut, credenciais relacionadas, deduplicação, PII/LGPD, logs e front-end.  
Método: revisão estática read-only. Nenhum request foi enviado aos destinos, nenhum comando Railway foi executado e nenhum commit/push foi realizado.

## Resumo executivo

Foram confirmados **13 findings: 2 críticos, 7 altos, 4 médios e 0 baixos**.

Os segredos das tabelas solicitadas não são gravados em plaintext: tokens reversíveis usam AES-256-GCM com `TRACKING_ENCRYPTION_KEY`, e tokens de webhook de comparação usam SHA-256. Os riscos críticos estão em volta desse armazenamento: um manager pode configurar um endpoint UTMify arbitrário que recebe o token decriptado e PII, e conexões OAuth Google são globais e reutilizáveis por managers de outras ofertas.

Os principais riscos de LGPD são coleta/disparo de pixels sem gate de consentimento, persistência indefinida de PII em claro e captura/repasse de URLs completas — inclusive query strings potencialmente contendo PII — para Meta e TikTok.

## Mapa da superfície

| Destino/fluxo | Autenticação externa | Tenancy | Dados sensíveis enviados | Retry |
|---|---|---|---|---|
| Meta CAPI | access token decriptado, hoje em query string | `project_id`/pixel por oferta | hashes de email/telefone/nome/CEP; IP, UA, cookies Meta e URL em claro | BullMQ 5; recovery limita DB a 8 tentativas |
| Meta Marketing API | app secret + access token decriptados | conexão global, acesso admin | contas, campanhas e saldos | sem retry por chamada; sincronização periódica |
| TikTok Events API | `Access-Token` em header | `project_id`/destination por oferta | hashes de email/telefone/external ID; IP, UA, `_ttp`, `ttclid` e URL | BullMQ 6, depois `dead` |
| UTMify orders | `x-api-token` em header | destino por oferta ou global | nome, email, telefone, documento, país, IP, pedido e atribuição | 8 tentativas; 429 é reaberto indefinidamente |
| UTMify web events | sem segredo no request; pixel ID no body | projeto/pixel | IP, UA, click IDs e atribuição | 8 tentativas |
| Google Ads/Data Manager | OAuth refresh token decriptado para access token | destino por oferta, mas conexão OAuth global | click IDs, pedido e valor | chamadas interativas sem retry; delivery produtivo marcado como desabilitado |
| Pushcut | secret decriptado no path da URL | `project_id`/destination | nome do comprador, produto, valor, funil e plataforma | 8 tentativas |
| VendePay/Paysight inbound | token de webhook em query string, comparado por hash | conexão por projeto | payload bruto de pagamento e comprador | recepção idempotente; sem HMAC efetivo |

## Inventário de credenciais em repouso

Implementação criptográfica: `packages/api/src/lib/secret-box.ts:3-20` deriva chave SHA-256 e usa AES-256-GCM com IV aleatório e tag de autenticação.

| Tabela | Coluna sensível | Proteção confirmada | Leitura/uso |
|---|---|---|---|
| `tracking_utmify_destinations` | `api_token_encrypted` | AES-256-GCM; escrita em `routes/utmify-tracking-admin.ts:45-54` e `routes/utmify-global-admin.ts:111-130` | decriptada em `workers/utmify-delivery.worker.ts:161` |
| `tracking_tiktok_destinations` | `access_token_encrypted` | AES-256-GCM; escrita em `routes/tiktok-ads-admin.ts:23-40` | decriptada em `workers/tiktok.worker.ts:92` |
| `tracking_google_ads_credentials` | `refresh_token_encrypted` | schema exige ciphertext (`migrations/061_google_ads_oauth.sql:1-7`) | tabela legada sem consumidor atual encontrado; o fluxo atual usa `tracking_google_ads_oauth_connections` |
| `tracking_google_ads_oauth_connections` | `refresh_token_encrypted` | AES-256-GCM em `routes/google-ads-oauth.ts:87-96` | decriptada antes das chamadas Google em `routes/google-ads-oauth.ts:175,197,244,284` |
| `tracking_google_ads_oauth_states` | `verifier_encrypted`; `state_hash` | verifier AES-256-GCM e state SHA-256 (`routes/google-ads-oauth.ts:59-61`) | verifier decriptado após consumo atômico em `routes/google-ads-oauth.ts:73-87` |
| `tracking_google_ads_destinations` | nenhuma credencial; FK `oauth_connection_id` | N/A | associa destino à conexão OAuth |
| `tracking_pushcut_destinations` | `secret_encrypted` | AES-256-GCM em `routes/pushcut-admin.ts:46-62` | decriptada em `workers/pushcut-delivery.worker.ts:97` |
| `meta_pixels` | `access_token_encrypted` | AES-256-GCM em `routes/meta-admin.ts:95-105` | decriptada em `workers/meta.worker.ts:270` |
| `meta_marketing_connections` | `app_secret_encrypted`, `access_token_encrypted`, `payment_pushcut_secret_encrypted` | AES-256-GCM em `routes/meta-control.ts:114-135,277-294` | decriptadas em `services/meta-marketing.ts:135-137,195-198` |
| `meta_ad_accounts` | nenhuma credencial | N/A | somente metadados/financeiro da conta |
| `vendepay_connections` | `token_hash`, `signing_secret_encrypted` | token SHA-256; signing secret AES-256-GCM (`routes/tracking-admin.ts:853-888,1092-1100`) | token comparado por hash; signing secret não é lido/verificado (SEC-C-004) |
| `tracking_gateway_connections` | `webhook_token_hash`, `api_key_encrypted`, `signing_secret_encrypted` | token SHA-256; demais AES-256-GCM (`routes/tracking-admin.ts:985-998`) | webhook token comparado por hash; API key/signing secret não têm consumidor encontrado (SEC-C-004) |

**Conclusão de plaintext de credenciais:** nenhuma das tabelas solicitadas guarda token/secret reversível em claro. Portanto, não foi aberto finding crítico de “segredo plaintext em banco”.

## Findings

### SEC-C-001 — CRITICAL — Endpoint UTMify arbitrário permite SSRF e exfiltra token + PII

- **OWASP:** API7:2023 SSRF / API10:2023 Unsafe Consumption of APIs; CWE-918.
- **Evidência:** `packages/api/src/routes/utmify-tracking-admin.ts:7-10,30-57` e `packages/api/src/routes/utmify-global-admin.ts:7-13,98-130` aceitam qualquer `z.string().url()` e persistem a URL. `packages/api/src/workers/utmify-delivery.worker.ts:142-173` decripta o token e faz `fetch(row.endpoint_url)` com `x-api-token` e um body contendo comprador/documento/IP. `fetch` segue redirects por padrão; não há allow-list, resolução/validação de IP privado nem bloqueio de redirects.
- **Impacto:** um manager de oferta pode apontar o worker para host controlado por ele e receber o token UTMify decriptado e PII de compradores. Também pode atingir metadata/cloud, loopback ou serviços internos a partir da rede do backend.
- **Correção:** remover `endpoint_url` do input normal e fixar o host UTMify; se customização for requisito, aplicar allow-list exata de scheme/host/port/path, resolver DNS e bloquear IPs privados/link-local/IPv4-mapped IPv6, usar `redirect: 'manual'` e revalidar cada hop. Nunca enviar credenciais para host diferente do allow-listed.
- **Verificação:** tentativa de salvar URL fora da allow-list retorna 422; redirects e endereços privados são rejeitados; teste unitário garante que token/body nunca chegam a um servidor não UTMify.

### SEC-C-002 — CRITICAL — Conexões OAuth Google globais podem ser listadas e anexadas entre ofertas/tenants

- **OWASP:** API1:2023 BOLA / API5:2023 BFLA; CWE-639.
- **Evidência:** `packages/api/migrations/061_google_ads_oauth.sql:19-25` cria `tracking_google_ads_oauth_connections` sem `project_id`, tenant ou owner. `packages/api/src/routes/google-ads-oauth.ts:28-41` devolve **todas** as conexões globais (inclusive nome derivado do email autorizado) para qualquer usuário com acesso a uma oferta. `packages/api/src/routes/google-ads-oauth.ts:141-155` permite a um manager anexar qualquer `connection_id` existente, sem checar `connected_by` ou membership da conexão.
- **Impacto:** manager de uma oferta pode reutilizar a autorização Google de outro tenant/oferta, consultar contas e usar o refresh token alheio indiretamente. O endpoint de status também expõe o email/nome da identidade Google conectada.
- **Correção:** adicionar owner/tenant ou tabela explícita de grants; filtrar listagem e `attach` pelo mesmo tenant/owner; vincular a conexão criada à oferta/organização no mesmo transaction; retornar apenas identificador mascarado quando necessário.
- **Verificação:** usuário A não lista nem anexa conexão criada por B; tentativa retorna 404/403; admin global continua operando apenas por caminho explicitamente privilegiado e auditado.

### SEC-C-003 — HIGH — Segredos trafegam em query string/path e podem parar em access logs

- **OWASP:** API2:2023 Broken Authentication; CWE-598.
- **Evidência:** URLs de webhook são geradas com `?token=` em `packages/api/src/routes/tracking-admin.ts:104-106`; receivers leem `req.query.token` em `routes/tracking-public.ts:1336-1341,1891-1896,2007-2013`; recovery gera URL com token em `routes/recovery-admin.ts:127`. Meta usa `access_token` na query em `workers/meta.worker.ts:271-275`, `routes/meta-admin.ts:77-82,179-184,258-265` e `services/meta-marketing.ts:45-52`. Pushcut inclui o secret no path em `workers/pushcut-delivery.worker.ts:97-100` e `services/meta-marketing.ts:112-114`.
- **Impacto:** query strings e paths são normalmente registrados por CDN, reverse proxy, observabilidade, histórico e sistemas do provedor. `logLevel: 'silent'` reduz o log do Fastify, mas não protege Railway/Cloudflare/proxies anteriores ao app.
- **Correção:** mover autenticação inbound para header (`Authorization`/header dedicado) e preferir HMAC; usar `Authorization: Bearer` para Meta quando suportado; documentar e rotacionar tokens legados; nunca incluir segredo em URL gerada/exibida.
- **Verificação:** nenhum segredo aparece em URL, access log ou mensagem de erro; testes de integração validam headers e rotação.

### SEC-C-004 — HIGH — Signing secrets configurados não verificam webhooks VendePay/Paysight

- **OWASP:** API2:2023 Broken Authentication / webhook replay/forgery; CWE-345.
- **Evidência:** `vendepay_connections.signing_secret_encrypted` é gravado em `packages/api/src/routes/tracking-admin.ts:1083-1103,1129-1160`; `tracking_gateway_connections.signing_secret_encrypted` em `routes/tracking-admin.ts:978-1013`. Não existe `decryptSecret` desses campos em nenhum receiver. Os handlers `routes/tracking-public.ts:1336-1360` e `1888-1904` autenticam somente pelo token da URL e não validam assinatura, timestamp ou nonce.
- **Impacto:** vazamento da URL é suficiente para forjar vendas, reembolsos/chargebacks e disparar destinos externos. O campo de signing secret cria falsa sensação de integridade.
- **Correção:** verificar HMAC sobre os bytes brutos antes de parsear; comparação constant-time; tolerância curta de timestamp; nonce/event ID para replay; rejeitar quando secret configurado e assinatura ausente/inválida.
- **Verificação:** payload válido passa; corpo alterado, timestamp expirado e replay são rejeitados sem persistir receipt/order.

### SEC-C-005 — HIGH — Worker TikTok usa endpoint Events API 1.0 já anunciado para sunset

- **OWASP:** API9:2023 Improper Inventory Management.
- **Evidência:** `packages/api/src/workers/tiktok.worker.ts:90-97` envia o schema legado para `https://business-api.tiktok.com/open_api/v1.3/pixel/track/`. A documentação oficial informa que `/pixel/track/` é endpoint Events API 1.0, com sunset anunciado para H2 2024, e recomenda Events API 2.0 em `/open_api/v1.3/event/track/` com envelope `event_source`, `event_source_id` e `data[]`: [TikTok Events API 2.0](https://business-api.tiktok.com/gateway/docs/index?doc_id=1771100779668482&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH).
- **Impacto:** entregas podem falhar permanentemente ou depender de compatibilidade legada não garantida; compras deixam de chegar à otimização TikTok.
- **Correção:** migrar endpoint/payload para Events API 2.0, mantendo `event_id`, matching e testes de contrato de resposta.
- **Verificação:** fixture 2.0 valida schema; Test Events confirma aceitação e dedup sem usar produção.

### SEC-C-006 — HIGH — Tracking e pixels são ativados sem gate de consentimento

- **OWASP:** privacidade por design/minimização; risco LGPD (avaliação técnica, não parecer jurídico).
- **Evidência:** `packages/api/src/services/tracker-script.ts:1-16` cria IDs persistentes, cookie/localStorage, carrega Meta/TikTok e dispara PageView sem consultar consentimento. `packages/api/src/routes/tracking-public.ts:15-35,1285-1315` aceita `consent_state`, mas não o exige nem impede persistência/envio quando `denied`/ausente. Busca global encontrou apenas a coluna `migrations/004_tracking_reliable_foundation.sql:1-6`; não há CMP/opt-in/opt-out operacional.
- **Impacto:** coleta de IP, UA, identificadores, URLs e click IDs e compartilhamento com plataformas de ads podem ocorrer antes de base legal/consentimento aplicável; o campo existente não oferece controle real.
- **Correção:** integrar CMP; não criar identificadores nem carregar pixels antes da decisão; respeitar `denied`; registrar versão/finalidade/timestamp do consentimento; permitir revogação e supressão downstream.
- **Verificação:** sessão nova sem consentimento não cria cookie/storage, não chama Meta/TikTok e não persiste evento identificável; após grant o fluxo inicia; revoke interrompe e limpa conforme política.

### SEC-C-007 — HIGH — URL completa com query é persistida e enviada a Meta/TikTok sem scrub de PII

- **OWASP:** API3:2023 Excessive Data Exposure; CWE-359.
- **Evidência:** `packages/api/src/services/tracker-script.ts:3` envia `event_url: location.href` e, no PageView, `path: location.pathname + location.search`. `packages/api/src/routes/tracking-public.ts:1285-1315` persiste URL/properties em claro. Meta inclui `event_source_url` em `workers/meta.worker.ts:248-256`; TikTok inclui URL/referrer em `workers/tiktok.worker.ts:23-29,83-88`. Não há remoção de parâmetros como `email`, `phone`, `cpf`, `cnpj`, `document` ou tokens de recuperação.
- **Impacto:** landing/checkout links com PII ou segredos na query são copiados para o banco e compartilhados com adtech, ampliando finalidade, exposição e retenção.
- **Correção:** canonicalizar URLs no cliente e novamente no servidor; allow-list de parâmetros estritamente necessários; remover fragment, credenciais e campos sensíveis; não duplicar query em `properties.path`.
- **Verificação:** URL de teste com `email`, `cpf` e token chega ao banco e aos payload builders apenas com origin/path e parâmetros allow-listed.

### SEC-C-008 — HIGH — PII e payloads brutos ficam em plaintext no PostgreSQL

- **OWASP:** API3:2023 Excessive Data Exposure; CWE-312.
- **Evidência:** `tracking_events.client_ip/user_agent/event_url` (`migrations/001_tracking_foundation.sql:19-32`) e `properties` (`004_tracking_reliable_foundation.sql:1-6`); `webhook_receipts.payload` e `tracking_orders.buyer` (`001_tracking_foundation.sql:39-64`); `tracking_gateway_webhook_receipts.payload` (`065_payment_gateway_connections.sql:27-37`); `recovery_opportunities.buyer_name/email/phone` e recovery snapshots (`029_tmx_recovery.sql:23-59`); `recovery_message_events.ip/user_agent` (`033_recovery_attribution_events.sql:12-23`); `recovery_test_runs.recipient` (`034_recovery_test_runs.sql:1-12`); `tracking_upsell_redirects.client_ip/user_agent` (`041_upsell_intelligence.sql:31-40`); TikTok `test_context` pode conter email/phone (`064_tiktok_test_context.sql:1-4`, `workers/tiktok.worker.ts:57-60`). Não há `encryptSecret`/criptografia equivalente nesses campos.
- **Impacto:** comprometimento de banco/backup expõe diretamente identidade, contato, navegação e payload financeiro completo; payloads passthrough podem conter CPF/CNPJ/endereço mesmo sem coluna dedicada.
- **Correção:** minimizar antes de persistir; não guardar payload bruto após normalização; criptografia de campo para dados que precisam ser reversíveis; hashing/tokenização quando só correlação é necessária; separar chaves e registrar acesso.
- **Verificação:** dump de teste não contém email/telefone/documento/IP em claro fora de exceções formalmente justificadas.

### SEC-C-009 — HIGH — Chave de idempotência UTMify muda em cada retry

- **Categoria:** integridade/deduplicação.
- **Evidência:** `packages/api/src/workers/utmify-delivery.worker.ts:130-170` incrementa `attempts` e envia `x-idempotency-key: ${row.id}:${row.event_type}:${row.attempts}`. Como `row.attempts` muda após cada falha, uma resposta aceita pelo provedor mas perdida por timeout será reenviada com outra chave. A unique key local (`migrations/004_tracking_reliable_foundation.sql:43-60`) impede outra row, mas não a duplicação no destino.
- **Impacto:** eventos financeiros duplicados/atualizações repetidas no UTMify em falhas ambíguas de rede.
- **Correção:** chave estável por evento de negócio/destino (`destination_id + event_id`); forced resend deve exigir uma nova versão explícita, não reutilizar o contador automático.
- **Verificação:** duas tentativas do mesmo delivery usam exatamente a mesma chave; resend manual intencional cria versão auditável distinta.

### SEC-C-010 — MEDIUM — Não há política de retenção/expurgo para PII de tracking

- **Evidência:** busca por `DELETE FROM`, TTL, retention e cron não encontrou expurgo periódico para `tracking_events`, `tracking_sessions`, `tracking_visitors`, `tracking_orders`, receipts, deliveries ou tabelas recovery. Janelas de 7/30/90 dias em queries são apenas filtros de leitura (`routes/tracking-advanced.ts:752-753`, por exemplo). O único cleanup temporal relevante é de OAuth state expirado (`routes/google-ads-oauth.ts:59`).
- **Impacto:** PII, click IDs, IP/UA e payloads financeiros crescem indefinidamente, contrariando minimização/limitação de armazenamento e aumentando blast radius.
- **Correção:** política documentada por finalidade e tabela; job idempotente de expurgo/anonimização; preservar somente agregados necessários; suportar solicitação de eliminação por titular/tenant.
- **Verificação:** job remove/anonimiza fixtures vencidas e mantém registros dentro da janela; métricas/alerta comprovam execução.

### SEC-C-011 — MEDIUM — Redaction de logs não cobre PII, tokens genéricos nem bodies upstream

- **Evidência:** `packages/api/src/lib/logger.ts:6-19` redige apenas authorization, `x-api-key`, cookie, `*.password`, `*.secret` e dois envs; não cobre `req.url`, query, `*.token`, `*.access_token`, email, phone, document, IP, UA ou bodies. Request logging está ligado em `packages/api/src/server.ts:35-41`. `workers/utmify-web-event.worker.ts:76-93,107-117` incorpora até 800 caracteres do body upstream no erro e o loga. No front-end, `packages/web/src/lib/api-client.ts:265-303` mantém `console.error` de URL completa em produção.
- **Impacto:** novos endpoints/erros podem gravar PII e segredos; respostas de fornecedor podem ecoar valores inválidos do request; URLs sensíveis podem chegar a console e observabilidade.
- **Correção:** redact por nomes e curingas (`token`, `access_token`, `email`, `phone`, `document`, `cpf`, `cnpj`, IP/UA conforme necessidade), serializer de URL que remova query, DTO seguro de erro upstream e console condicionado a desenvolvimento.
- **Verificação:** testes de snapshot de log alimentam canários de email/token/CPF e comprovam ausência em todos os níveis.

### SEC-C-012 — MEDIUM — Google Ads está fixado em v22 no mês de sunset

- **OWASP:** API9:2023 Improper Inventory Management.
- **Evidência:** `packages/api/src/integrations/google-ads/google-ads-api.ts:46-59` fixa `googleads.googleapis.com/v22`. Em 2026-10-06, a página oficial lista v22 com sunset tentativo em outubro de 2026 e v25 como versão lançada/suportada: [Google Ads API sunset dates](https://developers.google.com/google-ads/api/docs/sunset-dates) e [release notes](https://developers.google.com/google-ads/api/docs/release-notes).
- **Impacto:** descoberta de contas pode parar sem mudança local assim que o sunset for efetivado.
- **Correção:** migrar para v25/v26 após revisar breaking changes; centralizar versão em configuração testada; alerta de sunset.
- **Verificação:** contrato de listagem/searchStream passa em sandbox com versão suportada e não há literal `/v22/`.

### SEC-C-013 — MEDIUM — Rate limit UTMify reabre deliveries mortos indefinidamente

- **OWASP:** API4:2023 Unrestricted Resource Consumption.
- **Evidência:** worker limita a 8 tentativas e marca `dead` em `packages/api/src/workers/utmify-delivery.worker.ts:216-225`, mas `packages/api/src/server.ts:100-112` converte todo `dead` com `RATE_LIMIT_REACHED` para `failed`, zera `attempts` e reenvia. Esse recovery roda a cada 30 segundos (`server.ts:256-267`). O limiter reduz a taxa, mas não cria limite total/TTL.
- **Impacto:** uma credencial revogada/limitada pode gerar retry eterno, consumo de fila/banco e tráfego persistente ao provedor.
- **Correção:** orçamento total por delivery/tenant, `Retry-After` + jitter, circuit breaker e dead-letter definitivo com ação manual após limite temporal.
- **Verificação:** após orçamento configurado, fixture 429 permanece `dead` e não é reenfileirada automaticamente.

## PII armazenada — inventário

| Tabela | PII/dado pessoal observado | Estado em repouso |
|---|---|---|
| `tracking_events` | IP, user agent, URL/referrer, email/phone/CEP possíveis em `properties`, click IDs e UTMs em `source` | plaintext/JSON plaintext |
| `tracking_visitors` | IDs pseudônimos e click IDs/atribuição em `first_source`/`last_source` | plaintext |
| `tracking_sessions` | visitor/journey IDs, landing URL, referrer, source | plaintext |
| `webhook_receipts` | payload bruto de pagamento/comprador, potencial email/phone/document/address/CPF/CNPJ | JSON plaintext |
| `tracking_gateway_webhook_receipts` | payload bruto de gateway, potencial PII financeira/contato | JSON plaintext |
| `tracking_orders` | `buyer` com nome/email/phone/país/CEP/documento; attribution/click IDs | JSON plaintext; índices funcionais expõem email/phone normalizados |
| `recovery_opportunities` | nome, email, telefone, visitor ID, destino e source | plaintext; apenas recovery token é encrypted/hash |
| `recovery_messages` | snapshot de conteúdo e evento do provedor | JSON plaintext |
| `recovery_message_events` | IP, user agent, URL e metadata | plaintext |
| `recovery_test_runs/events` | recipient, destination URL, IP/UA em metadata | plaintext |
| `tracking_upsell_redirects` | IP, user agent, visitor/journey e source | plaintext |
| `tracking_tiktok_deliveries` | `test_context` com email/phone/URL | JSON plaintext |
| `tracking_google_ads_oauth_connections` | nome pode incorporar email Google; `connected_by` | email/ID plaintext; refresh token encrypted |
| `meta_ad_accounts`/campaigns | nomes de conta/business/campanha e dados financeiros | plaintext; não são credenciais |

Não foram encontradas colunas nomeadas `cpf`, `cnpj`, `telefone` ou `address` nas migrations, mas payloads JSON passthrough aceitam e preservam esses campos sem projeção; por isso a ausência de coluna não significa ausência do dado.

## Deduplicação — resultado

| Fluxo | Resultado | Evidência |
|---|---|---|
| PageView Meta browser ↔ server replay | OK | browser cria um ID e o envia tanto ao `fbq` quanto a `/track/events` (`services/tracker-script.ts:3`); replay usa `e.id` como `outgoing_event_id` (`routes/meta-admin.ts:410-423`); worker envia `outgoing_event_id ?? event_id` (`workers/meta.worker.ts:248-254`) |
| InitiateCheckout Meta browser ↔ server | OK | direct flow usa o mesmo ID em `fbq` e body; redirect carrega `tmx_event_id`, validado em `routes/tracking-public.ts:979-1024`; delivery unique por pixel/event (`migrations/002_meta_capi.sql:13-25`) |
| Purchase Meta/TikTok | OK no desenho atual; sem par browser para deduplicar | tracker embutido não dispara Purchase TikTok e só dispara Purchase Meta se código externo chamar `tmx.track`; workers criam IDs determinísticos por `transactionId` (`routes/tracking-public.ts:1795-1825`). Se Purchase browser for adicionado no futuro, será obrigatório compartilhar esse ID |
| Webhook receipt | OK | unique `(connection_id,dedupe_key)` em `migrations/001_tracking_foundation.sql:39-47` e `(gateway_connection_id,dedupe_key)` em `065_payment_gateway_connections.sql:27-37` |
| Ordem comercial | OK | unique `(project_id,provider,external_id)` em `migrations/001_tracking_foundation.sql:50-64`; handlers usam upsert em `routes/tracking-public.ts:1540-1605,1953-1967` |
| UTMify outbound | **Falha** | idempotency-key varia por tentativa — SEC-C-009 |

## Retry/backoff e logging HTTP

- **Meta CAPI:** timeout 15s; BullMQ exponencial, 5 tentativas, recovery total até 8; sem retry infinito identificado. Log não inclui body/header, mas token fica na URL (SEC-C-003).
- **TikTok:** timeout 15s; exponencial, 6 tentativas; termina em `dead`. Body/header não são logados. Endpoint legado é SEC-C-005.
- **UTMify orders:** timeout 15s; exponencial, 8 tentativas, limiter 1 req/s; 429 pode reabrir eternamente (SEC-C-013); chave de idempotência defeituosa (SEC-C-009). Resposta é truncada antes de persistência, mas não validada por schema.
- **UTMify web events:** timeout 15s; exponencial, 8 tentativas; body de erro upstream pode ir para log/DB (SEC-C-011).
- **Pushcut:** timeout 15s; exponencial, 8 tentativas; secret está no path (SEC-C-003); response body é persistido.
- **Google:** chamadas interativas têm timeout, sem retry. Delivery de conversão está explicitamente `delivery_enabled: false`; descoberta v22 está em risco de sunset (SEC-C-012).

## Front-end

- Nenhum endpoint externo real com token hardcoded foi encontrado em `packages/web/src/`; os exemplos em `tracking-help.tsx` são placeholders.
- A lista de ofertas e o resumo do dashboard são filtrados server-side por `offerStore.listAccessible` em `packages/api/src/routes/offers.ts:163-178,651-722`; não foi encontrado vazamento cross-oferta nessa superfície.
- Permanecem `console.error` em `packages/web/src/lib/env.ts:11-15`, `lib/api-client.ts:265-303` e `components/shield/shield-processor.tsx:263`; somente o logger do API client é relevante para esta fatia por registrar URL completa (SEC-C-011).

## Controles positivos

- AES-256-GCM autenticado para credenciais reversíveis; IV aleatório por ciphertext.
- Tokens inbound armazenados apenas como hash e comparação por hash.
- DTOs administrativos normalmente retornam `*_configured`, não ciphertext/token.
- Workers Meta, TikTok, UTMify e Pushcut decriptam somente imediatamente antes do uso.
- Filtragem por `project_id` está presente nas leituras normais de destinations e deliveries.
- Email/telefone são SHA-256 antes do envio a Meta/TikTok; IP/UA permanecem em claro por exigência de matching.
- Filas têm timeout, backoff e limites definidos, com exceção específica do reopen de 429.
- Webhooks e ordens têm constraints únicas e upserts consistentes.

## Limitações da auditoria

- Revisão estática; não foram validados dados existentes no banco, configuração efetiva de CDN/access logs, políticas de backup/KMS ou ambiente de produção.
- Não houve chamada real a Meta, TikTok, Google, UTMify ou Pushcut.
- A validade de Meta `v25.0` foi tratada como pin explícito e não gerou finding; a documentação oficial da release existe em [Introducing Graph API v25.0 and Marketing API v25.0](https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25/). Recomenda-se monitorar lifecycle em CI/configuração.
- LGPD foi analisada como risco técnico de privacidade e segurança, não como parecer jurídico.
