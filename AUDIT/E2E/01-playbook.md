# TMX HUB — playbook E2E de tracking

Escopo: Fluxos A–D no projeto pjr_eng (`01KYMGH9JEVZSBBKVEPVJTV3KC`). Este documento prepara a execução; nada foi enviado aos endpoints da aplicação nem aos provedores externos durante a preparação.

## Regra de segurança obrigatória

Não rode estes cenários contra Railway, produção ou uma API local iniciada pelo `main()` normal. O `main()` inicia workers que fazem HTTP real para Meta, TikTok, UTMify e Pushcut (`packages/api/src/server.ts:62-67`, `packages/api/src/server.ts:361-363`). A execução segura usa:

1. clone efêmero de `tmx_hub_dev`;
2. Redis em database lógico exclusivo;
3. `buildApp()` escutando sem `main()`, portanto sem workers de entrega;
4. processamento Explodely invocado manualmente apenas contra o clone;
5. exclusão do clone e limpeza do Redis isolado ao final.

Se qualquer worker normal estiver conectado ao clone, marque **BLOCKED** e pare. Não “teste só uma vez” com credenciais reais.

## 0. Pré-requisitos e isolamento

- Docker/Compose, Node/pnpm e `jq` disponíveis.
- Postgres e Redis locais em execução.
- Login dev funcional para conferir a UI, sem usar credencial de produção.
- API normal parada durante o ensaio. Web pode continuar ativa apontando para o harness seguro.
- Todos os comandos abaixo executados da raiz do repo.

Crie um banco efêmero (escolha um nome novo por execução) copiando somente o banco local:

```bash
export E2E_DB="tmx_hub_e2e_$(date +%Y%m%d_%H%M%S)"
docker compose exec -T postgres createdb -U postgres "$E2E_DB"
docker compose exec -T postgres pg_dump -U postgres -d tmx_hub_dev --no-owner --no-privileges | docker compose exec -T postgres psql -U postgres -d "$E2E_DB"
export E2E_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/$E2E_DB"
export E2E_REDIS_DB="15"
export E2E_REDIS_URL="redis://127.0.0.1:6379/$E2E_REDIS_DB"
export BASE_URL="http://127.0.0.1:4100"
export PROJECT_ID="01KYMGH9JEVZSBBKVEPVJTV3KC"
export FIXTURES="$PWD/AUDIT/E2E/fixtures"
export JWT_SECRET="tmx-e2e-jwt-secret-only-local-000000000001"
export TRACKING_ENCRYPTION_KEY="tmx-e2e-encryption-only-local-000000001"
export EXPLODELY_REQUIRE_SIGNATURE="false"
```

Confirme que o Redis DB 15 está livre; se não estiver, escolha outro database lógico. Não use o database Redis da API normal.

Descubra as referências não secretas no clone:

```bash
export PUBLIC_KEY="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT public_key FROM tracking_projects WHERE id='$PROJECT_ID'")"
export ENTRY_SLUG="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT slug FROM tracking_entry_links WHERE project_id='$PROJECT_ID' AND enabled=true ORDER BY created_at LIMIT 1")"
export TEST_ID="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_ab_tests WHERE project_id='$PROJECT_ID' AND status='active' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")"
export FRONT_PRODUCT_ID="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT product_id FROM tracking_product_kinds WHERE project_id='$PROJECT_ID' AND kind='front' ORDER BY product_id LIMIT 1")"
```

Prepare cópias temporárias dos fixtures, sem alterar os arquivos versionados:

```bash
export E2E_TMP="$(mktemp -d)"
jq --arg key "$PUBLIC_KEY" '.public_key=$key' "$FIXTURES/tracker-pageview.json" > "$E2E_TMP/tracker-pageview.json"
jq --arg key "$PUBLIC_KEY" '.public_key=$key' "$FIXTURES/tracker-initiatecheckout.json" > "$E2E_TMP/tracker-initiatecheckout.json"
jq --arg pid "$FRONT_PRODUCT_ID" '.produtoId=$pid' "$FIXTURES/webhook-vendepay-sale.json" > "$E2E_TMP/webhook-vendepay-sale.json"
jq --arg pid "$FRONT_PRODUCT_ID" '.produtoId=$pid' "$FIXTURES/webhook-vendepay-refund.json" > "$E2E_TMP/webhook-vendepay-refund.json"
jq --arg pid "$FRONT_PRODUCT_ID" '.[0].product.id=$pid' "$FIXTURES/webhook-paysight-sale.json" > "$E2E_TMP/webhook-paysight-sale.json"
cp "$FIXTURES"/webhook-explodely-*.json "$E2E_TMP/"
```

Crie conexões **sintéticas somente no clone** pela UI dev/admin:

- VendePay: uma conexão habilitada e copie o token recém-gerado para `VENDEPAY_TOKEN`.
- Paysight: uma conexão habilitada e copie o token recém-gerado para `PAYSIGHT_TOKEN`.
- Explodely: conexão habilitada com `settings.vendor_id=TEST-EXPLODELY-VENDOR`, `settings.currency=BRL`, `settings.amount_unit=major`, `settings.amount_scale=2`, `settings.order_kind=front`.

Não reutilize token conhecido de produção. A UI atual da cópia pjr_eng já tem duas conexões VendePay, mas o banco guarda apenas hash; criar uma conexão E2E torna a execução reproduzível. pjr_eng não tem conexão Paysight nem Explodely no snapshot analisado.

Inicie a API sem workers. Esse import chama `buildApp()`, não `main()`:

```bash
DATABASE_URL="$E2E_DATABASE_URL" REDIS_URL="$E2E_REDIS_URL" API_PORT=4100 TRACKING_PUBLIC_BASE_URL="$BASE_URL" pnpm --filter @page-cloner/api exec tsx -e "import { buildApp } from './src/server.ts'; const app=await buildApp(); await app.listen({port:4100,host:'127.0.0.1'}); process.on('SIGINT',async()=>{await app.close();process.exit(0)})"
```

Em outro terminal, confirme que nenhum processo do `server.ts` normal/worker aponta para `E2E_DATABASE_URL`. Guarde o horário inicial:

```bash
export RUN_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## 1. Fluxo A — anúncio → PageView → checkout

### A1. Clique de anúncio

```bash
curl -sS -D "$E2E_TMP/click.headers" -o /dev/null --max-redirs 0 \
  "$BASE_URL/v1/c/$ENTRY_SLUG?utm_source=e2e&utm_medium=automation&utm_campaign=tmx-e2e&fbclid=TEST-FBCLID-CLICK-001&gclid=TEST-GCLID-CLICK-001&ttclid=TEST-TTCLID-CLICK-001"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT event_name,source->>'utm_source' utm_source,properties->>'entry_link_id' IS NOT NULL has_entry_link FROM tracking_events WHERE project_id='$PROJECT_ID' AND event_name='AdClick' AND received_at >= '$RUN_STARTED_AT' ORDER BY received_at DESC;"
```

PASS: HTTP 302 e exatamente um `AdClick` E2E (bots/preview não registram). FAIL: status diferente, ausência ou duplicidade.

### A2. Script e PageView

```bash
curl -sS "$BASE_URL/v1/track/t.js?key=$PUBLIC_KEY" -o "$E2E_TMP/t.js"
grep -F "/v1/track/events" "$E2E_TMP/t.js"
curl -sS -o "$E2E_TMP/pageview.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/tracker-pageview.json" "$BASE_URL/v1/track/events"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT id,event_name,visitor_id,source->>'fbclid' fbclid,source->>'gclid' gclid,source->>'ttclid' ttclid FROM tracking_events WHERE project_id='$PROJECT_ID' AND id='TEST-E2E-PAGEVIEW-001';"
```

PASS: script 200, contém `/v1/track/events`; POST 202; row `PageView` preserva os três click IDs. O comportamento correto atual é **não** criar outbox server-side para PageView. Se o requisito exigir outbox PageView, registre GAP-A-PV-OUTBOX.

### A3. InitiateCheckout direto e via CTA

```bash
curl -sS -o "$E2E_TMP/ic.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/tracker-initiatecheckout.json" "$BASE_URL/v1/track/events"
curl -sS -D "$E2E_TMP/link.headers" -o /dev/null --max-redirs 0 \
  "$BASE_URL/v1/link/$TEST_ID?tmx_event_id=TEST-E2E-LINK-IC-001&tmx_source_url=https%3A%2F%2Fe2e.invalid%2Flanding&utm_source=e2e"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT id,event_name,properties->>'redirect' redirect FROM tracking_events WHERE project_id='$PROJECT_ID' AND id IN ('TEST-E2E-IC-001','TEST-E2E-LINK-IC-001') ORDER BY id;"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT event_id,event_name,state,count(*) FROM meta_deliveries WHERE project_id='$PROJECT_ID' AND event_id IN ('TEST-E2E-IC-001','TEST-E2E-LINK-IC-001') GROUP BY event_id,event_name,state ORDER BY event_id,state; SELECT event_id,event_name,state,count(*) FROM tracking_utmify_web_events WHERE project_id='$PROJECT_ID' AND event_id IN ('TEST-E2E-IC-001','TEST-E2E-LINK-IC-001') GROUP BY event_id,event_name,state ORDER BY event_id,state;"
```

PASS: POST 202; CTA 302; os dois ICs existem; cada um enfileira 3 rows Meta e 1 row UTMify web no snapshot atual. Atenção: o único teste ativo de pjr_eng é `presell`, não `checkout`; a mecânica de redirect/IC pode passar, mas a aceitação semântica do CTA checkout fica **BLOCKED** até configurar um teste `checkout` sintético no clone.

## 2. Fluxo B — vendas → normalização → fan-out

### B1. VendePay

```bash
curl -sS -o "$E2E_TMP/vdp-sale.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-vendepay-sale.json" "$BASE_URL/v1/webhooks/vendepay?token=$VENDEPAY_TOKEN"
```

### B2. Paysight

```bash
curl -sS -o "$E2E_TMP/ps-sale.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-paysight-sale.json" "$BASE_URL/v1/webhooks/paysight?token=$PAYSIGHT_TOKEN"
```

### B3. Explodely

O receiver só persiste/enfileira receipt; o worker normaliza. Com workers desligados, processe apenas o receipt sintético manualmente:

```bash
curl -sS -o "$E2E_TMP/exp-sale.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-explodely-sale.json" "$BASE_URL/v1/webhooks/explodely"
export EXP_SALE_RECEIPT="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_gateway_webhook_receipts WHERE gateway='explodely' AND transaction_id='sale:TEST-E2E-EXP-001'")"
DATABASE_URL="$E2E_DATABASE_URL" pnpm --filter @page-cloner/api exec tsx -e "import postgres from 'postgres'; import {processExplodelyReceipt} from './src/workers/explodely.worker.ts'; const db=postgres(process.env.DATABASE_URL); console.log(await processExplodelyReceipt(db,process.argv[1])); await db.end();" "$EXP_SALE_RECEIPT"
```

Verifique os três providers de uma vez:

```bash
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT provider,external_id,status,amount_minor,currency,order_kind FROM tracking_orders WHERE project_id='$PROJECT_ID' AND ((provider='vendepay' AND external_id='TEST-E2E-VDP-001') OR (provider='paysight' AND external_id='TEST-E2E-PS-001') OR (provider='explodely' AND external_id='TEST-E2E-EXP-001')) ORDER BY provider;"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT COALESCE(r.gateway,g.provider,'vendepay') provider,r.state,count(*) FROM tracking_gateway_webhook_receipts r LEFT JOIN tracking_gateway_connections g ON g.id=r.gateway_connection_id WHERE r.received_at >= '$RUN_STARTED_AT' GROUP BY 1,2 ORDER BY 1,2; SELECT 'vendepay_legacy' provider,state,count(*) FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id WHERE vc.project_id='$PROJECT_ID' AND wr.received_at >= '$RUN_STARTED_AT' GROUP BY state;"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT destination_kind,event_id,event_type,state,count(*) FROM tracking_delivery_outbox WHERE project_id='$PROJECT_ID' AND created_at >= '$RUN_STARTED_AT' GROUP BY destination_kind,event_id,event_type,state ORDER BY event_id,destination_kind; SELECT event_id,event_name,state,count(*) FROM meta_deliveries WHERE project_id='$PROJECT_ID' AND created_at >= '$RUN_STARTED_AT' GROUP BY event_id,event_name,state ORDER BY event_id; SELECT event_id,event_name,state,count(*) FROM tracking_tiktok_deliveries WHERE project_id='$PROJECT_ID' AND created_at >= '$RUN_STARTED_AT' GROUP BY event_id,event_name,state ORDER BY event_id;"
```

PASS por provider:

- receipt `processed`, order única `paid`, `amount_minor=4700`, `currency=BRL`, `order_kind=front`;
- VendePay: 1 UTMify + 1 Pushcut em `tracking_delivery_outbox`, 3 Meta, 0 TikTok;
- Paysight: 1 UTMify, 3 Meta, 0 TikTok, sem Pushcut (não implementado nesse handler);
- Explodely: 1 UTMify, 3 Meta, 0 TikTok, sem Pushcut (não implementado nesse worker);
- nenhum estado deve virar `processing`, `delivered`, `failed` ou `dead`, pois nenhum worker externo está ativo.

## 3. Fluxo C — refund atualiza a order

VendePay:

```bash
export VDP_ORDER_ID_BEFORE="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_orders WHERE project_id='$PROJECT_ID' AND provider='vendepay' AND external_id='TEST-E2E-VDP-001'")"
curl -sS -o "$E2E_TMP/vdp-refund.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-vendepay-refund.json" "$BASE_URL/v1/webhooks/vendepay?token=$VENDEPAY_TOKEN"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT id='$VDP_ORDER_ID_BEFORE' same_row,status,refunded_at IS NOT NULL has_refunded_at,count(*) OVER() matching_orders FROM tracking_orders WHERE project_id='$PROJECT_ID' AND provider='vendepay' AND external_id='TEST-E2E-VDP-001'; SELECT destination_kind,event_type,state FROM tracking_delivery_outbox WHERE project_id='$PROJECT_ID' AND event_id='vendepay:TEST-E2E-VDP-001:refunded';"
```

Explodely:

```bash
export EXP_ORDER_ID_BEFORE="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_orders WHERE project_id='$PROJECT_ID' AND provider='explodely' AND external_id='TEST-E2E-EXP-001'")"
curl -sS -o "$E2E_TMP/exp-refund.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-explodely-refund.json" "$BASE_URL/v1/webhooks/explodely"
export EXP_REFUND_RECEIPT="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_gateway_webhook_receipts WHERE gateway='explodely' AND transaction_id='refund:TEST-E2E-EXP-001'")"
DATABASE_URL="$E2E_DATABASE_URL" pnpm --filter @page-cloner/api exec tsx -e "import postgres from 'postgres'; import {processExplodelyReceipt} from './src/workers/explodely.worker.ts'; const db=postgres(process.env.DATABASE_URL); console.log(await processExplodelyReceipt(db,process.argv[1])); await db.end();" "$EXP_REFUND_RECEIPT"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT id='$EXP_ORDER_ID_BEFORE' same_row,status,refunded_at IS NOT NULL has_refunded_at,count(*) OVER() matching_orders FROM tracking_orders WHERE project_id='$PROJECT_ID' AND provider='explodely' AND external_id='TEST-E2E-EXP-001'; SELECT destination_kind,event_type,state FROM tracking_delivery_outbox WHERE project_id='$PROJECT_ID' AND event_type='order.refunded' AND created_at >= '$RUN_STARTED_AT';"
```

PASS: `same_row=true`, `status=refunded`, timestamp preenchido, `matching_orders=1`, novo evento financeiro UTMify pendente. Meta/TikTok/Pushcut/Google refund não são enfileirados pela implementação atual; se “fan-out refund para todos” for requisito, marque FAIL/GAP-C-FANOUT.

## 4. Fluxo D — rebill

```bash
curl -sS -o "$E2E_TMP/exp-rebill.response" -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @"$E2E_TMP/webhook-explodely-rebill.json" "$BASE_URL/v1/webhooks/explodely"
export EXP_REBILL_RECEIPT="$(docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -Atc "SELECT id FROM tracking_gateway_webhook_receipts WHERE gateway='explodely' AND transaction_id='rebill:TEST-E2E-EXP-REBILL-001'")"
DATABASE_URL="$E2E_DATABASE_URL" pnpm --filter @page-cloner/api exec tsx -e "import postgres from 'postgres'; import {processExplodelyReceipt} from './src/workers/explodely.worker.ts'; const db=postgres(process.env.DATABASE_URL); console.log(await processExplodelyReceipt(db,process.argv[1])); await db.end();" "$EXP_REBILL_RECEIPT"
docker compose exec -T postgres psql -U postgres -d "$E2E_DB" -c "SELECT provider,external_id,status,product->>'recurring' recurring,product->>'mainOrderId' main_order_id FROM tracking_orders WHERE project_id='$PROJECT_ID' AND provider='explodely' AND external_id IN ('TEST-E2E-EXP-001','TEST-E2E-EXP-REBILL-001') ORDER BY external_id; SELECT event_name,properties->>'recurring' recurring,properties->>'transaction_id' transaction_id FROM tracking_events WHERE project_id='$PROJECT_ID' AND properties->>'transaction_id'='TEST-E2E-EXP-REBILL-001';"
```

PASS atual: segunda order `paid`, external ID distinto, `product.recurring=true`, `product.mainOrderId=TEST-E2E-EXP-001`, evento `Purchase` com `properties.recurring=true`. Não existe coluna `tracking_orders.recurring`; uma asserção SQL `recurring=true` literal é GAP-D-SCHEMA.

## 5. Matriz PASS/FAIL

| Fluxo | Caso | Esperado | Resultado |
|---|---|---|---|
| A | `/v1/c/:slug` | 302 + 1 `AdClick` | ☐ PASS ☐ FAIL ☐ BLOCKED |
| A | `/v1/track/t.js` | 200 + referência ao collector | ☐ PASS ☐ FAIL ☐ BLOCKED |
| A | PageView | 202 + row, sem outbox server-side | ☐ PASS ☐ FAIL ☐ BLOCKED |
| A | IC direto | 202 + row + 3 Meta + 1 UTMify web pending | ☐ PASS ☐ FAIL ☐ BLOCKED |
| A | CTA `/v1/link/:testId` | 302 + IC + fan-out | ☐ PASS ☐ FAIL ☐ BLOCKED |
| B | VendePay sale | receipt + order + 1 UTMify + 1 Pushcut + 3 Meta | ☐ PASS ☐ FAIL ☐ BLOCKED |
| B | Paysight sale | receipt + order + 1 UTMify + 3 Meta | ☐ PASS ☐ FAIL ☐ BLOCKED |
| B | Explodely sale | receipt + order + 1 UTMify + 3 Meta | ☐ PASS ☐ FAIL ☐ BLOCKED |
| C | VendePay refund | mesma order + UTMify refund | ☐ PASS ☐ FAIL ☐ BLOCKED |
| C | Explodely refund | mesma order + UTMify refund | ☐ PASS ☐ FAIL ☐ BLOCKED |
| D | Explodely rebill | nova order + flags JSON de recorrência | ☐ PASS ☐ FAIL ☐ BLOCKED |
| Segurança | HTTP externo | zero worker/zero request externo | ☐ PASS ☐ FAIL ☐ BLOCKED |

## 6. Encerramento seguro

Pare o harness com Ctrl-C. Depois:

```bash
case "$E2E_DB" in tmx_hub_e2e_*) docker compose exec -T postgres dropdb -U postgres "$E2E_DB" ;; *) echo 'Nome de banco inseguro; abortando drop' >&2; exit 1 ;; esac
docker compose exec -T redis redis-cli -n "$E2E_REDIS_DB" FLUSHDB
test -n "$E2E_TMP" && test -d "$E2E_TMP" && rm -r -- "$E2E_TMP"
```

Confirme que o banco efêmero deixou de existir e que o Redis isolado tem zero chaves antes de iniciar novamente a API normal. Não copie orders/receipts/deliveries sintéticos de volta para `tmx_hub_dev`.

## 7. Evidência do snapshot local (somente shape/agregados)

- Receipts VendePay reais estão em `webhook_receipts`, não em `tracking_gateway_webhook_receipts`; 1.703 rows no projeto. Top-level observado nas 5 mais recentes: `checkout`, `checkoutId`, `comprador`, `createdAt`, `descricaoProduto`, `endereco`, `event`, `ip`, `nomeProduto`, `trackeamentoId`, `ultimoEvento`, `urlParams`. Objetos relevantes: `checkout` (id/status/moeda/total/produto), `comprador` (nome/email/telefone), `endereco` (CEP/localidade/país), `urlParams` (src/UTMs/click IDs). Valores e PII não foram extraídos.
- Não havia receipt Paysight nem conexão Paysight/Explodely para pjr_eng no snapshot; o shape Paysight foi derivado do normalizador permissivo e do contrato de batch (`packages/api/src/integrations/paysight/normalize.ts:73-156`, `packages/api/src/routes/tracking-public.ts:1905-1917`).
- Event types existentes: `VturbAttribution`, `PageView`, `Click`, `VideoAnswered`, `AdClick`, `FunnelStepCompleted`, `InitiateCheckout` e eventos Upsell.
- Orders usam `paid`, `chargeback`, `refunded`, `refused`, `abandoned`; moedas observadas incluem BRL, USD, EUR, CAD, GBP e outras. Medianas em minor units variam por moeda; BRL pago tinha amostra pequena (mediana 6.750), USD pago mediana 2.504 e chargeback USD mediana 4.700. Fixtures usam BRL 4.700.
- Últimas 3 Meta delivery rows eram `InitiateCheckout/delivered`; resposta persistida tinha keys `events_received`, `fbtrace_id`, `messages`. O payload enviado pelo worker é `data[{event_name,event_time,event_id,action_source,event_source_url,user_data,custom_data}]` + `partner_agent` (`packages/api/src/workers/meta.worker.ts:248-279`).
- Não havia TikTok deliveries para pjr_eng. O shape de envio vem do worker: `pixel_code`, `event`, `event_id`, `timestamp`, `event_source`, `context`, `properties` (`packages/api/src/workers/tiktok.worker.ts:17-49`).
- Últimas 3 UTMify web rows eram `InitiateCheckout/delivered`; o worker envia `{type,lead,event}`, com click IDs em `lead` (`packages/api/src/integrations/utmify/web-events.ts:47-69`).

## 8. Destinos pjr_eng e fan-out esperado

| Provider | Configuração no snapshot | Ativo | Fan-out seguro a observar |
|---|---:|---:|---|
| Meta CAPI | 3 pixels, sem filtro de produto | 3 | IC: 3; sale front: 3; refund: 0 |
| UTMify | 1 destino offer + pixel do projeto presente | 1 | IC web: 1; sale/refund: 1 |
| Pushcut | 1 destino | 1 | VendePay sale: 1; Paysight/Explodely/refund: 0 |
| TikTok EAPI | nenhum destino | 0 | 0 |
| Google Ads | 1 destino `draft/server` | 0 | 0; ingestão não enfileira Google Ads |

Total de destinos ativos físicos: **5**. Para sale VendePay front, todos os 5 entram no fan-out; para Paysight/Explodely, somente os 4 Meta+UTMify. Identificadores de conta/pixel e credenciais foram deliberadamente omitidos.

## 9. Gaps e alertas (10)

1. **GAP-SAFETY-WORKERS:** não há feature flag para iniciar a API normal sem workers externos; usar obrigatoriamente o harness `buildApp()` + DB/Redis efêmeros.
2. **GAP-CONNECTIONS:** pjr_eng não possui conexão Paysight nem Explodely; criar apenas no clone.
3. **GAP-A-CHECKOUT-CONFIG:** há teste A/B ativo `presell`, mas nenhum `checkout` ativo.
4. **GAP-A-PV-OUTBOX:** PageView é persistido, mas não enfileira server-side; apenas IC chama `enqueueInitiateCheckout` (`tracking-public.ts:1326-1333`).
5. **GAP-C-FANOUT:** refund/chargeback enfileira UTMify; Meta, TikTok, Pushcut e Google não recebem reversão.
6. **GAP-D-SCHEMA:** `tracking_orders` não tem coluna `recurring`; Explodely grava o sinal em `product.recurring` e `tracking_events.properties.recurring`.
7. **GAP-GOOGLE-FANOUT:** Google Ads possui somente superfície admin/teste; nenhum outbox/worker de venda foi encontrado.
8. **GAP-DESTINATION-COVERAGE:** não há TikTok ativo; o E2E do snapshot não cobre TikTok delivery.
9. **GAP-RECEIPT-SQL:** a consulta pedida usa colunas inexistentes (`provider`, `project_id`) em `tracking_gateway_webhook_receipts`; VendePay legado está em `webhook_receipts` e o schema novo usa `gateway` + join da conexão.
10. **GAP-EXPLODELY-CONTRACT:** o wire format/assinatura oficial ainda não está confirmado; o fixture segue os aliases aceitos pelo normalizador e a especificação interna (`docs/explodely-webhook-spec.md:15-31`).
