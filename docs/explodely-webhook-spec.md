# Explodely webhook/IPN — especificação operacional para o TMX HUB

> Pesquisa concluída em 2026-10-06. Esta especificação é documental; nenhuma chamada de teste foi enviada ao Explodely.

## Legenda de confiança

- **CONFIRMADO (oficial):** consta na documentação pública do Explodely.
- **INFERIDO:** recomendação de integração do TMX baseada no contrato local ou combinação explícita de fatos; não é uma promessa do Explodely.
- **NÃO CONFIRMADO:** a documentação pública consultada não informa.

## Resumo

O Explodely oferece duas superfícies distintas para sellers:

1. **Webhooks atuais configuráveis**, com **7 eventos**: `sale`, `refund`, `chargeback`, `rebill`, `rebill cancellation`, `decline` e `partial` (abandono após 20 minutos). **CONFIRMADO (oficial).** [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction)
2. **Global IPN legado**, com **3 tipos de mensagem**: `sale`, `refund` e `rebillcancel`; a página de configuração também diz que refund/chargeback podem ir para uma URL separada, mas não publica um payload `type=chargeback`. **CONFIRMADO (oficial), com inconsistência documental explícita.** [IPN Types](https://docs.explodely.com/ipn-for-sellers/ipn-types) · [Enabling IPN](https://docs.explodely.com/ipn-for-sellers/enabling-ipn)

Para o TMX, a superfície preferida é **Webhooks**, porque contém chargeback, rebill, decline e partial como eventos configuráveis; porém, antes de produção é obrigatório capturar um envio de teste em ambiente controlado ou obter confirmação do suporte sobre método, `Content-Type`, nomes reais das chaves, moeda, assinatura e política de retry. A documentação de Webhooks publica apenas rótulos de campos e permite escolher quais enviar; ela não publica um exemplo de requisição. **CONFIRMADO (oficial) quanto à seleção de campos; INFERIDO quanto à recomendação.** [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account) · [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook)

Não há eventos públicos separados chamados `trial_start`, `trial_end`, `upsell` ou `purchase`. Upsells/order bumps aparecem como uma venda com `Order Bump Selected=yes`; rebills têm evento próprio; trial é anunciado como recurso comercial, mas não como evento de webhook. **CONFIRMADO (oficial) para a lista e order bump; NÃO CONFIRMADO para qualquer semântica de trial via webhook.** [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction) · [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook) · [Explodely onboarding](https://onboarding.explodely.com/)

**Confiança global: média-baixa.** A enumeração de eventos e catálogos de campos é oficial; o contrato de transporte, autenticação e operação não está publicamente especificado.

## Status de implementação

Implementado localmente em 2026-10-06:

- `POST /v1/webhooks/explodely`, com captura do body raw para JSON e `application/x-www-form-urlencoded`, limite de 256 KiB e ACK `200` depois da persistência durável;
- HMAC-SHA256 opt-in por `EXPLODELY_REQUIRE_SIGNATURE`, desabilitado por padrão enquanto o contrato oficial de assinatura não for confirmado (TODO `SEC-C-004`);
- recibo bruto e idempotente em `webhook_receipts` e `tracking_gateway_webhook_receipts`, antes do processamento assíncrono;
- worker BullMQ dedicado, resolução de tenant por `vendor_id`/`seller_id`, lifecycle de sale/refund/chargeback/rebill/rebill cancellation e eventos internos para decline/partial;
- fan-out para os pipelines ativos existentes de Meta CAPI, TikTok Events API e UTMify;
- migration `070_explodely_gateway.sql`, preparada mas não aplicada.

Google Ads continua sem fan-out de produção porque o módulo atual do TMX declara explicitamente `delivery_enabled=false` e ainda não possui worker/outbox de conversões. Nenhum destino Google pode estar ativo no schema atual (`state` aceita somente `draft`/`archived`); a integração Explodely não altera esse controle de segurança.

## Autenticação e assinatura

| Item | Estado | Especificação operacional |
|---|---|---|
| HMAC/header/algoritmo/canonicalização | **NÃO CONFIRMADO** | A documentação pública de Webhooks/IPN não menciona assinatura, header, SHA-256, body raw nem timestamp. Não implementar validação HMAC como se fosse nativa sem confirmação do Explodely. [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction) · [Enabling IPN](https://docs.explodely.com/ipn-for-sellers/enabling-ipn) |
| Token secreto na URL | **NÃO DOCUMENTADO pelo Explodely; INFERIDO para TMX** | Emitir URL por conexão no formato `/v1/webhooks/explodely?token=<segredo-aleatorio>`, armazenando somente o hash. Isso replica o isolamento já usado pelo TMX, não uma capacidade anunciada pelo Explodely. A tela aceita uma URL arbitrária. [Enabling IPN](https://docs.explodely.com/ipn-for-sellers/enabling-ipn) |
| Basic Auth | **NÃO CONFIRMADO** | Não aparece nas páginas públicas consultadas. [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction) |
| IP allowlist | **NÃO CONFIRMADO** | Nenhum IP/CIDR de emissão foi publicado nas páginas oficiais consultadas. [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account) |
| Secret configurável/rotação | **NÃO CONFIRMADO** | A UI documentada pede nome, URL, funnel, produtos e campos, sem secret/rotação. [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account) |
| Replay protection | **NÃO CONFIRMADO** | IPN inclui timestamps de negócio, mas a documentação não os define como timestamp assinado nem informa janela de validade. [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn) · [Refund IPN](https://docs.explodely.com/ipn-for-sellers/refund-ipn) |
| API key do Explodely | **CONFIRMADO, mas fora do webhook** | `username` + `apikey` autenticam a API outbound do Explodely; a página não os associa a webhooks recebidos. [API Authentication](https://docs.explodely.com/api/authentication) |

### Requisito mínimo do receptor TMX

**INFERIDO:** usar token opaco por tenant/conexão na query string, limite de corpo, HTTPS, comparação por hash e idempotência durável. Tratar qualquer suposta assinatura do fornecedor como desabilitada até obter documentação oficial. A estrutura local já suporta `webhook_token_hash`, `signing_secret_encrypted`, `settings` e recibos únicos por conexão/dedupe em `packages/api/migrations/065_payment_gateway_connections.sql:4-37`.

## Contrato de transporte

### Webhooks atuais (7 eventos)

- Método HTTP: **NÃO CONFIRMADO**; a documentação diz apenas “HTTP requests” e “push”. [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction)
- `Content-Type`: **NÃO CONFIRMADO**; não há indicação de JSON, form-urlencoded ou multipart. [Webhooks — Introduction](https://docs.explodely.com/webhooks/introduction)
- Nomes wire das chaves, casing, tipos, obrigatoriedade e exemplos literais: **NÃO CONFIRMADOS**. As páginas publicam rótulos humanos e permitem selecionar campos; portanto, o conjunto recebido varia por configuração. [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)
- Envelope/event type: **NÃO CONFIRMADO**; não está documentado se o payload contém um campo discriminador. [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook)

### Global IPN legado

- Método: **CONFIRMADO:** configurável como `GET` ou `POST`. [Enabling IPN](https://docs.explodely.com/ipn-for-sellers/enabling-ipn)
- Recomendação oficial em integração recente: `POST`. **CONFIRMADO (oficial).** [VTurb via Make — Global IPN](https://help.explodely.com/support/solutions/articles/101000588467-vturb-integration-using-make-com)
- `Content-Type` de POST: **NÃO CONFIRMADO**. A documentação chama os dados de “parameters”, mas não afirma form-urlencoded nem JSON. [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn)
- Chaves: **CONFIRMADAS** nas tabelas IPN abaixo, respeitando exatamente o casing publicado.
- Tipos: salvo literais e formatos explicitamente descritos, **NÃO CONFIRMADOS**. O receptor deve aceitar scalar string/number e preservar o valor bruto.

## Eventos — Webhooks atuais

As tabelas abaixo são o **catálogo completo de campos selecionáveis publicado**. “Obrigatório?” é “não documentado/selecionável” em todos os casos; exemplos não são fornecidos pela fonte e, por isso, não são inventados.

### 1. Sale

Disparo: venda gerada para qualquer produto ou funnel. **CONFIRMADO (oficial).** [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook)

| Rótulo oficial | Tipo | Obrigatório? | Exemplo | Uso/semântica confirmada |
|---|---|---|---|---|
| Order ID | não documentado | não documentado/selecionável | não fornecido | ID da venda no Explodely; melhor candidato a `external_id`/idempotência |
| Customer Name | não documentado | não documentado/selecionável | não fornecido | nome |
| Customer Email | não documentado | não documentado/selecionável | não fornecido | e-mail |
| Customer Phone | não documentado | não documentado/selecionável | não fornecido | telefone |
| Amount | unidade/formato não documentados | não documentado/selecionável | não fornecido | valor da venda |
| Product ID | não documentado | não documentado/selecionável | não fornecido | ID de produto |
| Product Name | não documentado | não documentado/selecionável | não fornecido | nome do produto |
| Tracking ID | não documentado | opcional (“if any”) | não fornecido | tracking associado à venda |
| Affiliate | não documentado | opcional (“if any”) | não fornecido | ID do afiliado |
| Zip Code | não documentado | não documentado/selecionável | não fornecido | CEP do comprador |
| Country Code | formato não documentado nesta página | não documentado/selecionável | não fornecido | país do comprador |
| Bill Description | não documentado | não documentado/selecionável | não fornecido | descritor da cobrança |
| IP Address | string IP | não documentado/selecionável | não fornecido | IP do comprador |
| Order Bump Selected | literal `yes` quando selecionado; demais valores não documentados | não documentado/selecionável | `yes` (único literal oficial) | indica add-on/order bump |

Fonte de todos os campos e semânticas desta tabela: [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook).

Moeda não aparece no catálogo; centavos versus decimal não é definido. `user_agent`, geo além de país/CEP, `utm_*`, `fbclid`, `gclid` e `ttclid` não aparecem. **NÃO CONFIRMADO.** [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook)

### 2. Refund

Disparo: refund de qualquer venda. É evento separado e referencia o Order ID da venda. **CONFIRMADO (oficial).** [Refund Webhook](https://docs.explodely.com/webhooks/refund-webhook)

Campos selecionáveis completos: `Order ID`, `Customer Name`, `Customer Email`, `Customer Phone`, `Amount` (refund amount), `Product ID`, `Product Name`, `Tracking ID` (opcional), `Affiliate` (opcional), `Zip Code`, `Country Code`, `Bill Description`, `IP Address`. Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. [Refund Webhook](https://docs.explodely.com/webhooks/refund-webhook)

Idempotência sugerida: `Order ID + tipo refund + fingerprint/timestamp recebido`; somente `Order ID` pode colidir com a venda original e com replays. **INFERIDO.** A fonte não publica `event_id` nem timestamp no Webhook. [Refund Webhook](https://docs.explodely.com/webhooks/refund-webhook)

### 3. Chargeback

Disparo: chargeback de qualquer venda. É evento separado e referencia o Order ID da venda. **CONFIRMADO (oficial).** [Chargeback Webhook](https://docs.explodely.com/webhooks/chargeback-webhook)

Campos selecionáveis completos: `Order ID`, `Customer Name`, `Customer Email`, `Customer Phone`, `Amount` (sale amount), `Product ID`, `Product Name`, `Tracking ID` (opcional), `Affiliate` (opcional), `Zip Code`, `Country Code`, `Bill Description`, `IP Address`. Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. [Chargeback Webhook](https://docs.explodely.com/webhooks/chargeback-webhook)

Idempotência sugerida: `Order ID + tipo chargeback + fingerprint/timestamp recebido`. **INFERIDO.** Não há `event_id` público. [Chargeback Webhook](https://docs.explodely.com/webhooks/chargeback-webhook)

### 4. Rebill

Disparo: rebill gerado para uma venda. **CONFIRMADO (oficial).** [Rebill Webhook](https://docs.explodely.com/webhooks/rebill-webhook)

Campos selecionáveis completos: `Order ID` (ID da venda de rebill), `Customer Name`, `Customer Email`, `Customer Phone`, `Product ID`, `Main Order ID` (ID da venda inicial). Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. A página não lista amount, currency, time, tracking, affiliate ou status. [Rebill Webhook](https://docs.explodely.com/webhooks/rebill-webhook)

`Order ID` é o candidato a `external_id`; `Main Order ID` deve ser preservado como relação com a assinatura/venda inicial. **INFERIDO.**

### 5. Rebill cancellation

Disparo: cancelamento de rebill. **CONFIRMADO (oficial).** [Rebill Cancel Webhook](https://docs.explodely.com/webhooks/rebill-cancel-webhook)

Campos selecionáveis completos: `Customer Name`, `Customer Email`, `Customer Phone`, `Product ID`, `Main Order ID`. Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. Não há `Order ID` próprio no catálogo; usar `Main Order ID + tipo + fingerprint/timestamp recebido` para dedupe. **INFERIDO.** [Rebill Cancel Webhook](https://docs.explodely.com/webhooks/rebill-cancel-webhook)

### 6. Decline

Disparo: tentativa de compra recusada. **CONFIRMADO (oficial).** [Decline Webhook](https://docs.explodely.com/webhooks/decline-webhook)

Campos selecionáveis completos: `Customer Name`, `Customer Email`, `Product ID`. Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. Não há ID de transação/evento, amount, currency, time, IP ou tracking documentado; dedupe determinístico forte não é possível apenas com o catálogo publicado. [Decline Webhook](https://docs.explodely.com/webhooks/decline-webhook)

### 7. Partial

Disparo: cliente preenche o checkout e não compra nos 20 minutos seguintes. **CONFIRMADO (oficial).** [Partial Webhook](https://docs.explodely.com/webhooks/partial-webhook)

Campos selecionáveis completos: `Customer Name`, `Customer Email`, `Product ID`. Tipos, nomes wire, obrigatoriedade e exemplos: **NÃO CONFIRMADOS**. Não há ID, timestamp, IP, user-agent ou tracking documentado; dedupe forte não é possível apenas com o catálogo publicado. [Partial Webhook](https://docs.explodely.com/webhooks/partial-webhook)

## Eventos — Global IPN legado (contrato de chaves publicado)

Todos os campos abaixo são parâmetros; a fonte não fornece tipos formais nem payload serializado de exemplo.

### IPN `sale`

Enviado em um ou dois minutos após a venda, inclusive venda de teste configurada. **CONFIRMADO (oficial).** [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn) · [Testing A Sale](https://docs.explodely.com/ipn-for-sellers/testing-a-sale)

| Chave exata | Tipo/formato confirmado | Obrigatoriedade documentada | Semântica/exemplo oficial |
|---|---|---|---|
| `orderid` | não documentado | enviado | ID da transação; candidato de idempotência |
| `type` | literal string | enviado | `sale` |
| `productId` | não documentado | enviado | ID do produto |
| `productName` | string implícita | enviado | nome do produto |
| `customerName` | string implícita | enviado | nome completo |
| `customerEmail` | string implícita | enviado | e-mail |
| `customerPhone` | não documentado | enviado | telefone |
| `affiliate` | não documentado | enviado, vazio sem afiliado | ID do afiliado |
| `amount` | unidade/formato não documentados | enviado | valor da venda |
| `vat` | unidade/formato não documentados | enviado, vazio ou zero sem imposto | imposto da venda |
| `saletimedate` | `HH:MM:SS DD-MMM-YYYY` | enviado | data/hora da venda |
| `saletimestamp` | “machine timestamp”, unidade/timezone não documentados | enviado | timestamp da venda |
| `zipcode` | não documentado | enviado | CEP |
| `country` | ISO de 2 caracteres | enviado | país |
| `billdesc` | string implícita | enviado | descritor da cobrança |
| `custom1`…`custom5` | não documentado | enviado; vazio se ausente | parâmetros customizados |
| `obselected` | literal `yes` quando order bump | condicionado | order bump selecionado |
| `ipadd` | endereço IP | enviado | IP do comprador |
| `rebill` | literal `yes` | só em rebill | marca venda recorrente |
| `mainorderid` | não documentado | só em rebill | ID da venda inicial |
| `shipfullname` | string implícita | só produto físico | nome de entrega |
| `shipaddress1` | string implícita | só produto físico | endereço |
| `shipaddress2` | string implícita | só produto físico | complemento |
| `shipcity` | string implícita | só produto físico | cidade |
| `shipstate` | string implícita | só produto físico | estado |
| `shipcountry` | ISO de 2 caracteres | só produto físico | país de entrega |
| `shipzipcode` | não documentado | só produto físico | CEP de entrega |

Fonte integral da tabela: [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn).

Não há `currency`, `user_agent`, geo detalhado ou parâmetros `utm_*`, `fbclid`, `gclid`, `ttclid`. **NÃO CONFIRMADO.** Os cinco `custom*` são a única superfície oficial genérica para propagação no IPN de seller; a documentação não promete preenchê-los automaticamente a partir de UTMs. [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn)

### IPN `refund`

| Chave exata | Tipo/formato confirmado | Obrigatoriedade documentada | Semântica/exemplo oficial |
|---|---|---|---|
| `orderid` | não documentado | enviado | ID da venda original |
| `type` | literal string | enviado | `refund` |
| `productId` | não documentado | enviado | ID do produto |
| `customerName` | string implícita | enviado | nome completo |
| `customerEmail` | string implícita | enviado | e-mail |
| `customerPhone` | não documentado | enviado | telefone |
| `affiliate` | não documentado | enviado, vazio sem afiliado | ID do afiliado |
| `amount` | número/formato não documentado | enviado | valor do refund **negativo** |
| `refundtimedate` | `HH:MM:SS DD-MMM-YYYY` | enviado | data/hora do refund |
| `refundtimestamp` | “machine timestamp”, unidade/timezone não documentados | enviado | timestamp do refund |
| `zipcode` | não documentado | enviado | CEP |
| `country` | ISO de 2 caracteres | enviado | país |
| `billdesc` | string implícita | enviado | descritor |
| `custom1`…`custom5` | não documentado | presentes; valores só propagam se vieram na venda, senão vazios | customização |

Fonte integral da tabela: [Refund IPN](https://docs.explodely.com/ipn-for-sellers/refund-ipn).

O refund é uma mensagem separada que reutiliza `orderid`; não é um novo transaction ID documentado. **CONFIRMADO (oficial).** [Refund IPN](https://docs.explodely.com/ipn-for-sellers/refund-ipn)

### IPN `rebillcancel`

| Chave exata | Tipo/formato confirmado | Obrigatoriedade documentada | Semântica/exemplo oficial |
|---|---|---|---|
| `mainorderid` | não documentado | enviado | ID da venda inicial |
| `type` | literal string | enviado | `rebillcancel` |
| `canceltimedate` | `HH:MM:SS DD-MMM-YYYY` | enviado | data/hora do cancelamento |
| `canceltimestamp` | “machine timestamp”, unidade/timezone não documentados | enviado | timestamp do cancelamento |

Fonte integral da tabela: [Rebill Cancel IPN](https://docs.explodely.com/ipn-for-sellers/rebill-cancel-ipn).

## Tracking e atribuição

- `Tracking ID` existe como campo selecionável nos Webhooks de sale/refund/chargeback, mas sua origem, limite, casing e relação com `src` não são definidos. **CONFIRMADO (oficial) quanto à existência; NÃO CONFIRMADO quanto ao transporte.** [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook)
- Affiliate ISN possui `Tracking ID` “appended to the affiliate link”; isso documenta o fluxo de afiliado, não prova que o seller Webhook copie `src`/UTMs. **CONFIRMADO (oficial), escopo affiliate.** [Setting Instant Sale Notification](https://help.explodely.com/support/solutions/articles/101000480144)
- O Affiliate ISN Builder aceita tokens `[affp1]` e `[affp2]` quando enviados no affiliate link, mas isso também não documenta o seller Webhook. **CONFIRMADO (oficial), escopo affiliate.** [Postback/ISN Builder](https://help.explodely.com/support/solutions/articles/101000561536-postback-isn-builder)
- Explodely captura UTMs internamente em links de afiliado e os envia à integração UTMify; a própria página diz que eles não são passados à página final de oferta/checkout. Não há promessa de que esses valores apareçam no Webhook/IPN genérico. **CONFIRMADO (oficial), escopo UTMify affiliate.** [UTMify for Affiliates](https://help.explodely.com/support/solutions/articles/101000567903-utmify-for-affiliates)
- `fbclid`, `gclid`, `ttclid` e `user_agent`: **NÃO CONFIRMADOS** em Webhook/IPN público.

**Recomendação INFERIDA:** configurar explicitamente o campo de tracking do checkout/affiliate para transportar o token TMX; na impossibilidade, reservar `custom1` para o token no Global IPN e validar com venda de teste. Não assumir propagação automática de `src`.

## Operacional

| Questão | Estado público | Decisão segura para o TMX |
|---|---|---|
| Latência | Sale IPN: 1–2 minutos; refund: “instantly”; integração Pabbly pode levar 1–2 minutos para verificar. **CONFIRMADO.** [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn) · [Refund IPN](https://docs.explodely.com/ipn-for-sellers/refund-ipn) · [Pabbly Connect](https://help.explodely.com/support/solutions/articles/101000563577-pabbly-connect) | Não usar timeout de poucos segundos para reconciliação de negócio. |
| Retry/tentativas/backoff | **NÃO CONFIRMADO.** | Processar e persistir antes de responder; não depender de retry do emissor. |
| Header `X-Retry-Count` | **NÃO CONFIRMADO.** | Ignorar como requisito; preservar headers seguros em diagnóstico se a implementação futura permitir. |
| ACK de sucesso (`200`/qualquer `2xx`/body) | **NÃO CONFIRMADO.** | Responder `200` após recibo durável por máxima compatibilidade; esta é recomendação, não contrato Explodely. |
| Código para retry (`500`/`503`) | **NÃO CONFIRMADO.** | Usar `503` somente para falha transitória antes da persistência, sem garantia de reentrega. |
| Rate limit do emissor | **NÃO CONFIRMADO.** | Aplicar proteção local por token/IP sem bloquear bursts legítimos. |
| IPs de origem | **NÃO CONFIRMADO.** | Não habilitar allowlist rígida até receber CIDRs oficiais. |
| Tamanho máximo | **NÃO CONFIRMADO.** | Reutilizar inicialmente o limite local de 256 KiB usado nos receptores atuais, sujeito a teste. |
| Ordem de eventos | **NÃO CONFIRMADO.** | Fazer upsert monotônico de lifecycle e aceitar chegada fora de ordem. |

Nenhuma página oficial consultada publica retry, ACK/body, rate limit ou IPs. Pontos de contato oficiais: `sellers@explodely.com`, `support@explodely.com` e `devsupport@explodely.com`. [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account) · [Testing A Sale](https://docs.explodely.com/ipn-for-sellers/testing-a-sale)

## Configuração no Explodely

### Webhooks atuais (preferido)

1. Login na conta Seller → `Seller Hub` → `Integrations` → `Webhooks` → `Add Webhooks`. **CONFIRMADO (oficial).** [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)
2. Informar `Webhook Name`, `Webhook URL`, `Funnel` e `Products`, marcar os campos desejados e salvar. **CONFIRMADO (oficial).** [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)
3. A documentação lista tipos separados de webhook, portanto há seleção por evento; o fluxo exato de UI não mostra se uma mesma configuração pode assinar vários eventos. **CONFIRMADO quanto aos tipos; NÃO CONFIRMADO quanto à cardinalidade por configuração.** [Webhooks](https://docs.explodely.com/webhooks)
4. Funnel/produtos indicam escopo configurável. **CONFIRMADO (oficial).** [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)
5. A UI permite editar/excluir posteriormente. **CONFIRMADO (oficial).** [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)
6. Múltiplas URLs: **NÃO CONFIRMADO diretamente** para Webhooks gerais. A integração Pabbly permite múltiplos webhooks para eventos diferentes, evidência oficial secundária de que a plataforma suporta essa topologia naquele módulo. [Pabbly Connect](https://help.explodely.com/support/solutions/articles/101000563577-pabbly-connect)

### Global IPN legado

Conta Seller → `Seller Hub` → `Settings` → seção `Developers` → `Global IPN`; preencher URL, `Send IPN=Yes`, `IPN Type=POST`. **CONFIRMADO (oficial, fluxo atualizado).** [VTurb via Make](https://help.explodely.com/support/solutions/articles/101000588467-vturb-integration-using-make-com)

A documentação antiga também descreve configuração em `Product Settings`, com URL principal e URL separada para refund/chargeback. Isso pode representar UI legada ou escopo por produto; validar na conta real. **CONFIRMADO (oficial) quanto ao texto; NÃO CONFIRMADO quanto à UI atual.** [Enabling IPN](https://docs.explodely.com/ipn-for-sellers/enabling-ipn)

## Especificidades do negócio

- Explodely se apresenta como plataforma para sellers, com checkout, processamento, pagamentos semanais e ecossistema de afiliados; não é apenas um gateway técnico direto. **CONFIRMADO (oficial).** [Explodely onboarding](https://onboarding.explodely.com/)
- Payloads de sale/refund/chargeback podem incluir `Affiliate`; Sale IPN também inclui `affiliate`. **CONFIRMADO (oficial).** [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook) · [Sale IPN](https://docs.explodely.com/ipn-for-sellers/sale-ipn)
- O valor de sale/refund/chargeback publicado não inclui comissão, split, seller share ou affiliate share no seller Webhook. Affiliate ISN, em contraste, define `Amount` como a parcela do afiliado. **CONFIRMADO (oficial); não misturar os dois contratos.** [Sale Webhook](https://docs.explodely.com/webhooks/sale-webhook) · [Setting Instant Sale Notification](https://help.explodely.com/support/solutions/articles/101000480144)
- Refund e chargeback são eventos separados nos Webhooks e apontam para o `Order ID` da venda; não há novo `transaction_id`/`event_id` documentado. **CONFIRMADO (oficial).** [Refund Webhook](https://docs.explodely.com/webhooks/refund-webhook) · [Chargeback Webhook](https://docs.explodely.com/webhooks/chargeback-webhook)

## Mapeamento sugerido para o TMX

### Conexão e endpoint

**INFERIDO a partir do modelo local:** adicionar provider `explodely` em `tracking_gateway_connections`, uma conexão por projeto/tenant, com `webhook_token_hash` para autenticação da URL e `settings` para guardar somente preferências não secretas. O schema genérico existe em `packages/api/migrations/003_tracking_advanced.sql:20-27` e foi ampliado em `packages/api/migrations/065_payment_gateway_connections.sql:4-25`.

Endpoint sugerido: `POST /v1/webhooks/explodely?token=<segredo>`. Se for necessário suportar Global IPN GET, expor `GET` no mesmo path apenas como compatibilidade explícita; preferir configurar `POST` no Explodely. O padrão local dos dois receptores atuais é POST com token por conexão em `packages/api/src/routes/tracking-public.ts:1336-1358` e `packages/api/src/routes/tracking-public.ts:1891-1904`.

### `tracking_gateway_webhook_receipts`

| Coluna | Mapeamento sugerido |
|---|---|
| `gateway_connection_id` | conexão Explodely resolvida pelo hash do token |
| `payload` | representação JSON canônica do body/query recebido, preservando todas as chaves |
| `dedupe_key` | `explodely:<event-type>:<orderid>` quando houver; para rebill usar o `Order ID` do rebill; para cancel `mainorderid + canceltimestamp`; para decline/partial sem ID usar hash SHA-256 do payload canônico + bucket temporal, deixando explícita a menor garantia |
| `state` | `received`, `processed`, `quarantined` ou `duplicate` conforme pipeline local |
| `diagnostics` | campos ausentes, tipo de transporte, parse de amount/date, ausência de moeda/ID |
| `order_id` | FK após materialização de evento financeiro; `NULL` para partial/decline quando tratados só como evento |

O recibo genérico já garante unicidade por conexão + dedupe e preserva payload/diagnósticos em `packages/api/migrations/065_payment_gateway_connections.sql:27-40`. O handler Paysight demonstra inserção idempotente e quarentena em `packages/api/src/routes/tracking-public.ts:1917-1936`.

### `tracking_orders`

| Explodely | TMX | Regra sugerida |
|---|---|---|
| `Order ID` / `orderid` | `external_id` | ID estável da venda/rebill |
| provider | `provider` | literal `explodely` |
| sale | `status` | `paid` |
| refund | `status`, `refunded_at` | `refunded`; usar timestamp oficial do IPN quando disponível, senão received_at marcado como fallback |
| chargeback | `status`, `chargeback_at` | `chargeback`; Webhook não publica timestamp |
| rebill cancel | `status`, `cancelled_at` | `cancelled` na assinatura/venda principal, sem criar valor financeiro novo |
| decline | `status` | `refused` somente se houver identidade transacional suficiente; caso contrário, apenas `tracking_events` |
| partial | `status` | `abandoned` somente se houver chave estável; caso contrário, apenas `tracking_events` |
| `Amount` / `amount` | `amount_minor` | **não converter até conhecer currency e escala**; quarentenar valor financeiro ambíguo |
| currency | `currency` | ausente na documentação; exigir configuração por conexão/produto ou confirmação oficial antes de produção |
| customer fields | `buyer` | `name`, `email`, `phone`, `country`, `zipcode`, `ip`; não armazenar shipping fora de necessidade aprovada |
| product fields | `product` | `{id,name}` |
| `Tracking ID` / `custom1` | `visitor_id` após validação; bruto em `attribution_source` | nunca aceitar valor arbitrário como visitor ID; validar token/projeto |
| `Affiliate` / `affiliate` | `attribution_source.affiliate` | preservar ID do afiliado |
| `Main Order ID` / `mainorderid` | relação em `product`/metadata ou futura coluna dedicada | não substituir `external_id` do rebill |
| `Order Bump Selected` / `obselected` | `order_kind` | sinal auxiliar; `yes` não identifica qual estágio de upsell |

O schema base de orders exige unicidade `(project_id, provider, external_id)` e contém amount em minor units, currency, buyer e timestamps em `packages/api/migrations/001_tracking_foundation.sql:50-64`; lifecycle financeiro foi ampliado em `packages/api/migrations/031_tracking_financial_lifecycle.sql:1-27`. O upsert genérico atual preserva estados terminais de refund/chargeback em `packages/api/src/routes/tracking-public.ts:1953-1969`.

### `tracking_events`

**INFERIDO:** emitir eventos internos somente após recibo durável:

| Evento Explodely | `tracking_events.event_name` sugerido | Observação |
|---|---|---|
| sale | `Purchase` | também materializa order paid |
| refund | `Refund` | referencia order existente |
| chargeback | `Chargeback` | referencia order existente |
| rebill | `Purchase` com `properties.rebill=true` | usar Order ID próprio e Main Order ID |
| rebill cancellation | `SubscriptionCancelled` | não é refund por si só |
| decline | `PaymentRefused` | pode não ter visitor/session |
| partial | `CheckoutAbandoned` | ocorre após 20 minutos; não confundir com InitiateCheckout imediato |

`tracking_events` suporta nome, source, IP, user-agent e timestamps em `packages/api/migrations/001_tracking_foundation.sql:19-32`. Como `visitor_id` é obrigatório no schema atual, decline/partial sem tracking exigem uma política explícita (quarentena, visitor sintético estável ou uma evolução de schema); não inventar atribuição.

## Critérios de go-live e lacunas a fechar

Antes de ativar produção, obter do Explodely ou observar por venda de teste documentada, sem cobrança real:

1. Exemplo raw de cada um dos 7 Webhooks, com método, headers e `Content-Type`.
2. Nomes wire/casing e discriminador de evento.
3. Moeda e escala de `Amount`; timezone/unidade de timestamps.
4. Assinatura/autenticação, rotação e replay protection.
5. ACK esperado, retry/backoff, timeout e headers de tentativa.
6. CIDRs de origem e rate limit.
7. Cardinalidade: múltiplas URLs, múltiplos eventos por configuração e filtros por funnel/produto.
8. Propagação comprovada de token TMX via `Tracking ID` ou `custom1`; comportamento de UTMs/click IDs.
9. Semântica de trials e upsells além de order bump.

Se a conta não expuser documentação adicional, solicitar contrato técnico a `devsupport@explodely.com` e confirmação operacional a `sellers@explodely.com`; esses contatos são publicados pelo próprio Explodely. [Testing A Sale](https://docs.explodely.com/ipn-for-sellers/testing-a-sale) · [Setting Up Webhook](https://help.explodely.com/support/solutions/articles/101000575600-setting-up-webhook-in-explodely-seller-account)

## Cobertura da pesquisa

Foram consultados os endpoints prováveis pedidos (`/docs`, `/api`, `/developers`, `/help`, `help.`, `support.` e `docs.`), pesquisa por IPN/webhook/API, documentação oficial GitBook, knowledge base Freshdesk e busca no índice público do Wayback Machine. A busca histórica não revelou um contrato público adicional além das páginas oficiais atuais. **NÃO CONFIRMADO:** pode existir documentação autenticada em conta vendor.
