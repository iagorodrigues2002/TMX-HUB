# Auditoria de isolamento multi-tenant, BOLA e BFLA — Fatia A

## Resumo executivo

A superfície registrada contém 224 rotas: 199 passam pelo escopo protegido de `routes/index.ts` (além das rotas de auth que se protegem localmente) e 25 são públicas por desenho. A autenticação global está corretamente aplicada, mas não substitui autorização por objeto. Foram confirmados 6 findings: uma quebra crítica de isolamento nas conexões OAuth do Google Ads; BOLA em clones/builds/forms/links e em jobs VSL/funil; uma ACL de tracking que não representa separadamente membro e tracking manager; e duas falhas de escopo no gate de ferramentas/idempotência. Não foi feito request, teste de runtime, contato com Railway, commit ou push; a análise é exclusivamente estática.

## Findings — CRITICAL

### SEC-A-001 — Conexões OAuth Google Ads globais podem ser descobertas e anexadas entre tenants

**Arquivo:linha:** `packages/api/src/routes/google-ads-oauth.ts:28`, `packages/api/src/routes/google-ads-oauth.ts:39`, `packages/api/src/routes/google-ads-oauth.ts:141`, `packages/api/src/routes/google-ads-oauth.ts:146`, `packages/api/src/routes/google-ads-oauth.ts:152`, `packages/api/src/routes/google-ads-oauth.ts:162`; schema em `packages/api/migrations/061_google_ads_oauth.sql:16`.

**Descrição:** depois de validar acesso somente à oferta indicada, `GET /offers/:id/tracking/google-ads/connection-status` retorna **todas** as linhas de `tracking_google_ads_oauth_connections`, inclusive `id` e `name` (o nome normalmente inclui o e-mail Google autorizado). Em seguida, `POST .../oauth/attach` aceita qualquer `connection_id` existente; o `EXISTS` não compara `connected_by`, oferta, projeto, tenant ou conta. Após anexar a conexão de outro usuário a um destino próprio, os endpoints `/accounts`, `/accounts/lookup`, `/test` e `/test-synthetic` carregam e decriptam o refresh token dessa conexão pelo relacionamento recém-criado. A tabela não possui coluna tenant; o único vínculo de autoria é `connected_by`, que não é usado nessas duas decisões de autorização.

**Impacto:** cross-tenant confirmado. Um proprietário de oferta comum pode descobrir identidades OAuth de outras contas TMX, anexar a autorização Google de outra pessoa e usar o backend para listar contas Google Ads acessíveis por ela e executar operações de validação contra essa autorização. O refresh token cifrado não é devolvido ao cliente, mas seu poder é reutilizado sem autorização; isso constitui exposição/uso indevido de credencial de terceiro e BOLA/BFLA.

**Reprodução conceitual (não executada):** usuário A conecta uma conta Google em sua oferta, gerando a conexão `C-A`. Usuário B, dono de outra oferta e de um destination próprio, consulta `connection-status`, obtém o ID `C-A`, envia esse ID a `.../oauth/attach` no destination B e então chama `.../oauth/accounts`. Pelo código, a conexão passa no `EXISTS` global e o refresh token de A é usado no contexto da oferta de B.

**Fix sugerido:** adicionar ownership/tenant explícito à conexão reutilizável (por exemplo `owner_user_id` ou `account_id` imutável), filtrar a listagem pela conta atual e exigir o mesmo vínculo no `UPDATE ... attach`, na mesma query que atualiza o destination. Se compartilhamento de conexões for requisito, modelá-lo em tabela ACL explícita e nunca inferir permissão apenas pela existência do ID. Migrar conexões atuais para um owner conhecido e adicionar FK/índices e testes BOLA A→B para listagem, attach e uso posterior.

## Findings — HIGH

### SEC-A-002 — Família de clones não possui owner e permite leitura, mutação, build, download e exclusão cross-user

**Arquivo:linha:** `packages/api/src/services/job-store.ts:18`, `packages/api/src/services/job-store.ts:70`, `packages/api/src/services/job-store.ts:96`; ocorrências em `packages/api/src/routes/clones.ts:153`, `packages/api/src/routes/clones.ts:169`, `packages/api/src/routes/forms.ts:53`, `packages/api/src/routes/forms.ts:80`, `packages/api/src/routes/links.ts:54`, `packages/api/src/routes/links.ts:82`, `packages/api/src/routes/links.ts:113`, `packages/api/src/routes/builds.ts:54`, `packages/api/src/routes/builds.ts:91`.

**Descrição:** `CloneMetadata` e `BuildMetadata` não têm `userId`/tenant, `createClone` não recebe o usuário autenticado e os handlers acima passam `req.params.id` diretamente ao `jobStore`. Nenhuma rota compara o chamador com um owner. A checagem `meta.cloneId === id` no GET de build apenas relaciona build e clone, não relaciona nenhum deles ao usuário. O hook `requireAuth` e o gate da ferramenta `cloner` limitam a exploração a usuários autenticados com a ferramenta, mas todos esses usuários compartilham o mesmo namespace de objetos.

**Impacto:** cross-tenant confirmado quando um ID de clone/build de outra conta é conhecido. Vazam URL de origem, URL de webhook, opções, HTML/estado sanitizado, formulários, links e artefatos com URL pré-assinada; também é possível alterar forms/links, disparar builds e apagar o clone/artefatos de outra conta.

**Reprodução conceitual (não executada):** usuário A cria um clone e compartilha/expõe seu ULID por log, histórico, URL ou interface. Usuário B autenticado com `cloner` usa o mesmo ULID em cada ocorrência listada. O código carrega ou altera o objeto sem consultar A, e `DELETE /clones/:id` remove Redis e o prefixo de storage do clone de A.

**Fix sugerido:** persistir `userId` (ou `accountId`) em clone e build no momento da criação; introduzir `assertOwner(id, req.user.sub, isAdmin)` e usá-lo antes de toda leitura/mutação/storage access. Para build, validar ownership do clone e filtrar build por `(buildId, cloneId, ownerId)`. Migrar os registros existentes com owner confiável ou invalidá-los; não tratar ULID como autorização. Cobrir todas as nove ocorrências com testes A→B que esperem 404.

### SEC-A-003 — Jobs VSL e funil não possuem owner e expõem artefatos cross-user

**Arquivo:linha:** `packages/api/src/routes/vsl-jobs.ts:9`, `packages/api/src/routes/vsl-jobs.ts:32`, `packages/api/src/services/vsl-job-store.ts:12`, `packages/api/src/services/vsl-job-store.ts:26`; `packages/api/src/routes/funnel-jobs.ts:31`, `packages/api/src/routes/funnel-jobs.ts:57`, `packages/api/src/services/funnel-job-store.ts:13`, `packages/api/src/services/funnel-job-store.ts:35`.

**Descrição:** os stores VSL e Funnel persistem IDs e metadados sem `userId`; os POSTs registram atividade do usuário, mas não transferem essa identidade para o recurso. Os GETs recebem o ID do path e chamam `get(id)` sem ownership. O gate por ferramenta separa VSL de funnel-clone, mas não separa usuários/contas dentro da mesma ferramenta.

**Impacto:** cross-tenant confirmado por ID. Em VSL podem vazar URL de origem, status, manifests, chaves de storage e URLs pré-assinadas do vídeo/white; no funil podem vazar URL raiz, páginas descobertas, metadados e URL pré-assinada do ZIP.

**Reprodução conceitual (não executada):** usuário A cria um job e B, autenticado na mesma ferramenta, consulta `GET /vsl-jobs/<id-A>` ou `GET /funnel-jobs/<id-A>`. Como o store não conhece owner, o handler devolve os dados e, quando pronto, gera download pré-assinado.

**Fix sugerido:** adicionar `userId` obrigatório aos dois modelos e stores, passá-lo nos POSTs e substituir `get(id)` por `assertOwner(id, req.user.sub)` nos GETs. Indexar/listar por usuário se houver listagem futura e testar negação A→B. Não usar o registro de activity como ACL, pois ele não participa da consulta do recurso.

### SEC-A-004 — ACL não distingue membro de tracking manager e aplica poderes de tracking de forma inconsistente

**Arquivo:linha:** `packages/api/src/services/offer-store.ts:85`, `packages/api/src/services/offer-store.ts:89`, `packages/api/src/services/offer-store.ts:93`, `packages/api/src/services/offer-store.ts:96`, `packages/api/src/services/offer-store.ts:469`; exemplos de mutação liberada a qualquer membro em `packages/api/src/routes/tracking-admin.ts:410`, `packages/api/src/routes/tracking-admin.ts:836`, `packages/api/src/routes/tracking-admin.ts:978`, `packages/api/src/routes/tracking-advanced.ts:227`, `packages/api/src/routes/meta-admin.ts:48`; exemplos bloqueados a membro em `packages/api/src/routes/meta-admin.ts:62`, `packages/api/src/routes/google-ads-admin.ts:20`, `packages/api/src/routes/utmify-tracking-admin.ts:30`, `packages/api/src/routes/pushcut-admin.ts:42`, `packages/api/src/routes/recovery-admin.ts:395`.

**Descrição:** o modelo de usuário só possui `admin|user`, a oferta só possui `memberIds`, e `canConfigureTrackingOffer` é exatamente um alias de `canAccessOffer`. Portanto não há dado capaz de representar “membro/convidado” separado de “tracking manager”. Handlers que usam `assertTrackingManager` concedem mutação de tracking a qualquer membro atribuído; handlers irmãos usam `assertManager`, restringindo a mesma classe de configuração ao proprietário/admin. Isso viola a doutrina fornecida em ambos os sentidos: membros comuns podem receber poder de configuração, enquanto um tracking manager atribuído não consegue configurar partes importantes do tracking.

**Impacto:** um membro atribuído pode alterar setup, pixel UTMify, gateway connections, regras/domínios/AB tests/upsells e produtos de pixel sem uma concessão específica de tracking. Em contrapartida, a pessoa que deveria operar tracking pode ficar impedida de configurar Meta pixels, Google/TikTok Ads, UTMify destination, Pushcut e Recovery, criando risco operacional e incentivando concessão excessiva (owner/admin) como workaround.

**Reprodução conceitual (não executada):** atribuir um usuário comum como `memberId` a uma oferta. Sem alterar role nem adicionar uma permissão de tracking, chamar uma rota protegida por `assertTrackingManager` e observar que `canAccessOffer` autoriza; em seguida chamar uma rota irmã que usa `assertManager` e observar que o mesmo usuário é negado. A diferença decorre apenas do helper escolhido pelo handler.

**Fix sugerido:** modelar ACL por oferta com capability explícita (por exemplo `offer_members(user_id, offer_id, role=view|tracking_manager|manager)`) e fazer `assertTrackingManager` exigir essa capability. Padronizar todas as mutações de tracking sob esse helper; manter rename/share/delete da oferta sob manager/owner e operações globais sob admin. Migrar `memberIds` conservadoramente para `view` até concessão explícita e adicionar matriz de testes Admin × Owner × Member × Tracking Manager.

## Findings — MEDIUM

### SEC-A-005 — Idempotency-Key de clone é global e pode devolver o clone de outro usuário

**Arquivo:linha:** `packages/api/src/routes/clones.ts:90`, `packages/api/src/routes/clones.ts:100`, `packages/api/src/routes/clones.ts:108`, `packages/api/src/services/job-store.ts:15`, `packages/api/src/services/job-store.ts:168`.

**Descrição:** a chave Redis de idempotência é `idem:<header>` e o record contém apenas `bodyHash` e `jobId`; não há `userId`/tenant. Se dois usuários enviarem a mesma `Idempotency-Key` e o mesmo body durante o TTL, o segundo recebe `200` com os metadados e ID do clone do primeiro. Se o body divergir, ainda há interferência cross-tenant via `409`.

**Impacto:** vazamento cross-tenant de metadados/ID de clone e possibilidade de negar a criação idempotente de outro usuário. O ID revelado amplia diretamente o SEC-A-002. A exploração exige conhecer/colidir a chave e, para o vazamento completo, o body; por isso a severidade é menor que a BOLA direta.

**Reprodução conceitual (não executada):** A cria um clone com `Idempotency-Key: K` e body `B`. B envia `K` e `B` antes de 24 horas. `checkIdempotency` resolve a mesma chave global e o handler retorna o clone de A.

**Fix sugerido:** namespacear o registro como `idem:<userId>:<key>` (ou account/tenant), incluir o owner no valor e recusar qualquer hit cujo owner não seja o chamador. O hash deve cobrir também o contexto relevante da operação. Testar colisão da mesma chave/body entre dois usuários.

### SEC-A-006 — Gate de ferramentas não cobre os dashboards `/tracking/*`

**Arquivo:linha:** `packages/api/src/routes/index.ts:36`, `packages/api/src/routes/index.ts:42`, `packages/api/src/routes/index.ts:53`, `packages/api/src/routes/index.ts:93`, `packages/api/src/routes/index.ts:94`; rotas em `packages/api/src/routes/tracking-overview.ts:41` e `packages/api/src/routes/refunds-dashboard.ts:24`.

**Descrição:** `TOOL_PATH_MAP` protege `/v1/offers` e `/v1/dashboard`, mas não `/v1/tracking`. O hook declara que paths não mapeados são comuns a todos e faz bypass. Assim, `/v1/tracking/overview` e `/v1/tracking/refunds-dashboard` não exigem a ferramenta `ofertas`, embora entreguem métricas financeiras, pedidos/refunds e dados de comprador das ofertas acessíveis. As queries dessas rotas filtram corretamente por `listAccessible`; o problema é BFLA do entitlement de ferramenta, não BOLA de oferta.

**Impacto:** um JWT de usuário sem `ofertas` ainda alcança dashboards de tracking se o usuário estiver atribuído a alguma oferta (por exemplo, token ainda não renovado após mudança de ACL ou estado legado). Não há acesso a oferta não atribuída, mas há exposição de dados financeiros/pessoais apesar da restrição de ferramenta.

**Reprodução conceitual (não executada):** usar um JWT válido cujo `tools` não contenha `ofertas`, mas cujo `sub` esteja em `memberIds` de uma oferta; chamar as duas rotas `/v1/tracking/*`. O `TOOL_PATH_MAP.find` não encontra prefixo e retorna sem 403; depois `listAccessible` inclui a oferta atribuída.

**Fix sugerido:** mapear `/v1/tracking` para `ofertas` (ou para uma capability específica de tracking) e preferir metadados de autorização por plugin/rota em vez de allowlist por prefixo com default allow. Invalidar/rotacionar JWTs quando `allowedTools` muda, ou buscar entitlements atuais no servidor para operações sensíveis.

## Findings — LOW

Nenhum finding LOW. A rota pública `GET /v1/clones/:id/preview` usa o ULID como capability de forma explicitamente documentada (`routes/index.ts:78-80`, `routes/preview.ts:8-15`). Sem evidência de baixa entropia ou vazamento independente do ID, não foi promovida a finding; o risco de obtenção do ID por usuário autenticado já está coberto em SEC-A-002.

## Inventário completo das rotas registradas

Legenda: **Auth** = `requireAuth`; **ACL** = validação após auth; **SQL** = filtro SQL tenant. `N/A` significa que a rota não usa recurso tenant/SQL. Todas as rotas abaixo estão sob `/v1`, exceto `/healthz` e `/readyz`. Rotas protegidas registradas em `index.ts:99-125` herdam `requireAuth` de `index.ts:85`.

### Públicas (25)

- `health.ts`: `GET /healthz`, `GET /readyz` — Auth/ACL/SQL: N/A (health).
- `auth.ts`: `POST /auth/login`, `POST /auth/register`, `GET /auth/invites/:token` — públicas por desenho; register exige admin apenas no modo fechado após bootstrap.
- `preview.ts`: `GET /clones/:id/preview` — pública por capability ULID; sem ownership; observação LOW acima.
- `tracking-public.ts`: `POST /webhooks/recovery/resend`; `GET /recovery/r/:token`; `GET /recovery/test/:token`; `GET /recovery/test/open/:token`; `GET /recovery/open/:token`; `GET /track/t.js`; `POST /track/bootstrap`; `POST /track/ab/assign`; `GET /c/:slug`; `GET /r/:testId`; `GET /link/:testId`; `GET /track/upsell/u.js`; `GET /u/:slug/check`; `GET /u/:slug`; `POST /track/upsell/events`; `POST /track/events`; `POST /webhooks/vendepay`; `POST /webhooks/paysight`; `POST /webhooks/vendepay/replay-quarantine` — Auth N/A; ACL usa token/public_key/slug/signing token conforme o fluxo; SQL usa `project_id` ou chave-capability derivada. As exceções literais estão no inventário SQL abaixo.

### Auth/admin e utilitárias protegidas (13)

- `auth.ts`: `POST /auth/invites`, `GET /auth/invites`, `DELETE /auth/invites/:token` — Auth sim (preHandler local), ACL role admin, SQL N/A; `GET /auth/me` — Auth sim, ACL `req.user.sub`, SQL N/A.
- `activity.ts`: `GET /activity` — Auth sim, ACL `req.user.sub`, SQL N/A.
- `users.ts`: `POST /auth/change-password` — Auth sim, próprio usuário; `POST /auth/admin-reset-own-password`, `GET /admin/overview`, `GET /users`, `PATCH /users/:id`, `DELETE /users/:id` — Auth sim e role admin (reset continua limitado ao próprio admin); SQL N/A/Redis.
- `inspect.ts`: `POST /inspect`; `webhook-test.ts`: `POST /webhook-test` — Auth sim, recurso tenant N/A, SQL N/A.

### Cloner e jobs (25)

- `clones.ts`: `POST /clones` — Auth sim; owner não é persistido (SEC-A-002/005); SQL N/A. `GET /clones/:id`, `DELETE /clones/:id` — Auth sim; ACL ausente (SEC-A-002); SQL N/A.
- `forms.ts`: `GET /clones/:id/forms`, `PATCH /clones/:id/forms/:formId` — Auth sim; ACL ausente (SEC-A-002); SQL N/A.
- `links.ts`: `GET /clones/:id/links`, `PATCH /clones/:id/links/:linkId`, `POST /clones/:id/links/bulk` — Auth sim; ACL ausente (SEC-A-002); SQL N/A.
- `builds.ts`: `POST /clones/:id/build`, `GET /clones/:id/builds/:buildId` — Auth sim; apenas vínculo build↔clone, sem owner (SEC-A-002); SQL N/A.
- `vsl-jobs.ts`: `POST /vsl-jobs`, `GET /vsl-jobs/:id`; `funnel-jobs.ts`: `POST /funnel-jobs`, `GET /funnel-jobs/:id` — Auth sim; owner ausente (SEC-A-003); SQL N/A.
- `media-jobs.ts`: `POST /media-jobs`, `GET /media-jobs`, `POST /media-jobs/bulk-download`, `GET /media-jobs/:id`, `GET /media-jobs/:id/download`, `DELETE /media-jobs/:id` — Auth sim; ACL por `userId`/`assertOwner`; SQL N/A.
- `shield-jobs.ts`: `POST /shield-jobs`, `GET /shield-jobs`, `POST /shield-jobs/bulk-download`, `GET /shield-jobs/:id`, `DELETE /shield-jobs/:id` — Auth sim; ACL por `userId`/`assertOwner`; SQL N/A.

### Ofertas, overview e recursos globais (41)

- `offers.ts` (18): `GET /offers`, `POST /offers`, `PATCH /offers/:id`, `DELETE /offers/:id`, `POST /offers/:id/ingest`, `GET /offers/:id/snapshots`, `POST /offers/:id/sync`, `GET /offers/:id/utmify-capabilities`, `GET /offers/:id/intraday`, `GET /offers/:id/intraday/range`, `GET /offers/:id/ai-config`, `PUT /offers/:id/ai-config`, `PATCH /offers/:id/ai-preferences`, `POST /offers/:id/ai-analysis`, `GET /offers/:id/ai-analysis-status`, `GET /offers/:id/ai-analyses`, `PATCH /offers/:id/ai-analyses/:analysisId/feedback`, `GET /dashboard/summary` — Auth sim; ACL por `listAccessible`, `assertAccess`, `assertManager` e role admin para feedback; stores Redis filtrados por offer/user; sem SQL tenant direto.
- `tracking-overview.ts`: `GET /tracking/overview`; `refunds-dashboard.ts`: `GET /tracking/refunds-dashboard` — Auth sim; ACL por `listAccessible`; SQL `WHERE p.offer_id = ANY(accessibleOfferIds)`; entitlement de ferramenta falha conforme SEC-A-006.
- `niches.ts` (6): `GET /niches`, `POST /niches`, `PATCH /niches/:id`, `DELETE /niches/:id`, `POST /niches/:id/whites`, `DELETE /niches/:id/whites/:whiteId` — Auth sim; nichos são globais por desenho, mutações exigem criador ou admin; SQL N/A.
- `meta-control.ts` (10): `GET /meta-control/connections`, `GET /meta-control/connection`, `POST /meta-control/connection`, `POST /meta-control/sync`, `GET /meta-control/dashboard`, `GET /meta-control/connections/:connectionId/pushcut`, `PATCH /meta-control/connections/:connectionId/pushcut`, `POST /meta-control/connections/:connectionId/pushcut/test`, `PATCH /meta-control/accounts/:accountId/offer`, `PATCH /meta-control/campaigns/:campaignId/offer` — Auth sim e `assertAdmin` em todos; queries globais são compatíveis com função admin; atribuições usam `account_id`/`offer_id` ou IDs obtidos pelo admin.
- `utmify-global-admin.ts` (5): `GET /utmify-global`, `PUT /utmify-global/offers`, `PUT /utmify-global`, `POST /utmify-global/test`, `POST /utmify-global/replay` — Auth sim e role admin em todos; SQL global usa `scope='global'`, ou `project_id` para roteamento.

### Tracking por oferta (120)

Todas têm Auth sim. Leitura usa `assertAccess`; mutação deveria seguir a capability de tracking, mas há a inconsistência SEC-A-004. Salvo as exceções SQL explicitadas mais abaixo, as queries chegam ao tenant por `tracking_projects.offer_id` ou usam `project_id` obtido após ACL.

- `google-ads-admin.ts` (4): `GET /offers/:id/tracking/google-ads/destinations`; `POST /offers/:id/tracking/google-ads/destinations`; `PUT /offers/:id/tracking/google-ads/destinations/:destinationId`; `DELETE /offers/:id/tracking/google-ads/destinations/:destinationId` — GET `assertAccess`; writes `assertManager`; SQL filtra `offer_id`/`project_id`.
- `google-ads-oauth.ts` (9): `GET /offers/:id/tracking/google-ads/connection-status`; `POST .../destinations/:destinationId/oauth/start`; `POST .../oauth/complete`; `DELETE .../oauth`; `POST .../oauth/attach`; `GET .../oauth/accounts`; `GET .../oauth/accounts/lookup`; `POST .../oauth/test`; `POST .../oauth/test-synthetic` — Auth sim; acesso à oferta/manager existe, mas connection global não é tenant-scoped (SEC-A-001); demais SQL de destination/order usa offer/project.
- `tiktok-ads-admin.ts` (6): `GET /offers/:id/tracking/tiktok/destinations`; `POST /offers/:id/tracking/tiktok/destinations`; `PUT /offers/:id/tracking/tiktok/destinations/:destinationId`; `DELETE /offers/:id/tracking/tiktok/destinations/:destinationId`; `POST /offers/:id/tracking/tiktok/destinations/:destinationId/test`; `GET /offers/:id/tracking/tiktok/deliveries/:deliveryId` — reads `assertAccess`, writes `assertManager`, SQL `offer_id`/`project_id`.
- `meta-admin.ts` (11): `GET /offers/:id/tracking/meta-pixels`; `PUT /offers/:id/tracking/meta-pixels/:pixelId/products`; `POST /offers/:id/tracking/meta-pixels`; `PATCH /offers/:id/tracking/meta-pixels/:pixelId`; `POST /offers/:id/tracking/meta-pixels/:pixelId/test-event`; `PATCH /offers/:id/tracking/meta-pixels/:pixelId/test-event-code`; `DELETE /offers/:id/tracking/meta-pixels/:pixelId`; `GET /offers/:id/tracking/meta-deliveries`; `POST /offers/:id/tracking/meta-events/replay`; `POST /offers/:id/tracking/meta-deliveries/:deliveryId/retry`; `POST /offers/:id/tracking/meta-deliveries/resend-value-repairs` — reads `assertAccess`, products `assertTrackingManager`, demais writes `assertManager`; SQL offer/project-scoped ou child ID previamente validado.
- `pushcut-admin.ts` (8): `GET /offers/:id/tracking/pushcut-destinations`; `POST /offers/:id/tracking/pushcut-destinations`; `PATCH /offers/:id/tracking/pushcut-destinations/:destinationId`; `DELETE /offers/:id/tracking/pushcut-destinations/:destinationId`; `POST /offers/:id/tracking/pushcut-destinations/:destinationId/test`; `GET /offers/:id/tracking/pushcut-deliveries`; `POST /offers/:id/tracking/pushcut-deliveries/:deliveryId/retry`; `POST /offers/:id/tracking/pushcut-destinations/resend-history` — reads `assertAccess`, writes `assertManager`; SQL offer/project-scoped.
- `recovery-admin.ts` (8): `GET /offers/:id/recovery`; `PUT /offers/:id/recovery/settings`; `POST /offers/:id/recovery/email-webhook`; `POST /offers/:id/recovery/test-email`; `PUT /offers/:id/recovery/channels`; `POST /offers/:id/recovery/sync`; `POST /offers/:id/recovery/opportunities/:opportunityId/send`; `POST /offers/:id/recovery/bulk-send` — read `assertAccess`, writes `assertManager`; SQL project-scoped ou child ID derivado de consulta project-scoped.
- `utmify-tracking-admin.ts` (9): `GET /offers/:id/tracking/utmify-destination`; `PUT /offers/:id/tracking/utmify-destination`; `PATCH /offers/:id/tracking/utmify-destination`; `DELETE /offers/:id/tracking/utmify-destination`; `GET /offers/:id/tracking/utmify-deliveries`; `POST /offers/:id/tracking/utmify-deliveries/:deliveryId/retry`; `POST /offers/:id/tracking/utmify-front/reconcile`; `POST /offers/:id/tracking/utmify-upsells/reconcile`; `POST /offers/:id/tracking/utmify-test-checkout` — reads `assertAccess`, writes `assertManager`; SQL offer/project-scoped ou IDs derivados.
- `tracking-admin.ts` (35): `GET /offers/:id/tracking/health`; `POST /offers/:id/tracking/health/alerts/:alertId`; `GET/PUT /offers/:id/tracking/utmify-pixel`; `GET /offers/:id/tracking/utmify-web-events`; `POST /offers/:id/tracking/utmify-web-events/:deliveryId/retry`; `POST /offers/:id/tracking/initiate-checkout/reconcile`; `GET /offers/:id/tracking/diagnostics`; `POST /offers/:id/tracking/setup`; `GET /offers/:id/tracking`; `POST /offers/:id/tracking/gateway-connections`; `PATCH /offers/:id/tracking/gateway-connections/:connectionId`; `POST /offers/:id/tracking/vendepay/connections`; `PATCH /offers/:id/tracking/vendepay/connections/:connectionId`; `PUT /offers/:id/tracking/vendepay/connections/:connectionId/signing-secret`; `POST /offers/:id/tracking/vendepay/connections/:connectionId/rotate-token`; `PUT /offers/:id/tracking/vendepay/signing-secret`; `POST /offers/:id/tracking/vendepay/rotate-token`; `POST /offers/:id/tracking/vendepay/preview`; `GET /offers/:id/tracking/vendepay/receipts`; `GET /offers/:id/tracking/events`; `GET /offers/:id/tracking/page-funnel`; `GET /offers/:id/tracking/journeys`; `GET /offers/:id/tracking/orders`; `GET /offers/:id/tracking/countries`; `GET /offers/:id/tracking/attribution`; `GET /offers/:id/tracking/orphans`; `GET /offers/:id/tracking/summary`; `GET/PATCH /offers/:id/tracking/fee-settings`; `GET /offers/:id/tracking/refunds`; `POST /offers/:id/tracking/exchange-rates/warmup`; `POST /offers/:id/tracking/orders/backfill-currency`; `POST /offers/:id/tracking/utmify-deliveries/resend-paid`; `POST /offers/:id/tracking/utmify-deliveries/resend-value-repairs` — reads `assertAccess`; setup/utmify-pixel/gateway connections usam `assertTrackingManager`; várias outras writes usam `assertManager` (SEC-A-004); SQL predominantemente offer/project-scoped.
- `tracking-advanced.ts` (30): `GET /offers/:id/tracking/advanced`; `PATCH /offers/:id/tracking/vturb`; `GET /offers/:id/tracking/vturb/players`; `GET /offers/:id/tracking/vturb/analytics`; `GET /offers/:id/tracking/upsells`; `GET /offers/:id/tracking/upsell-identities`; `PUT /offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/result`; `POST /offers/:id/tracking/upsell-identities/recover-failed`; `POST /offers/:id/tracking/upsell-identities/reconcile`; `POST /offers/:id/tracking/upsells`; `PATCH /offers/:id/tracking/upsells/:stageId`; `DELETE /offers/:id/tracking/upsells/:stageId`; `POST /offers/:id/tracking/entry-links`; `PATCH /offers/:id/tracking/entry-links/:linkId`; `POST /offers/:id/tracking/entry-links/:linkId/ab-test`; `DELETE /offers/:id/tracking/entry-links/:linkId`; `GET/PUT /offers/:id/tracking/product-kinds`; `DELETE /offers/:id/tracking/product-kinds/:productId`; `POST /offers/:id/tracking/product-kinds/recompute`; `POST /offers/:id/tracking/meta-purchases/reconcile`; `POST /offers/:id/tracking/domains`; `POST /offers/:id/tracking/domains/:domainId/verify`; `DELETE /offers/:id/tracking/domains/:domainId`; `PATCH /offers/:id/tracking/meta-rules`; `POST /offers/:id/tracking/gateways`; `POST /offers/:id/tracking/ab-tests`; `GET /offers/:id/tracking/ab-tests/:testId/metrics`; `PATCH /offers/:id/tracking/ab-tests/:testId`; `DELETE /offers/:id/tracking/ab-tests/:testId` — reads `assertAccess`, writes `assertTrackingManager`; SQL project-scoped, com child IDs revalidados dentro do projeto, salvo atualizações por ID derivado listadas abaixo.

**Reconciliação da contagem:** 25 públicas + 13 auth/admin/utilitárias + 25 cloner/jobs + 41 ofertas/globais + 120 tracking por oferta = **224 rotas**.

## Grep SQL contra o schema de migrations

Fonte de verdade: `packages/api/migrations/001..069`. Foram examinados tagged templates `app.db\`...\``, `sql\`...\`` e `db\`...\`` e buscas por `SELECT|UPDATE|DELETE|INSERT`, `postgres(...)`, `.query(` e `sql.unsafe`. Não foi encontrado cliente `pg`/Pool nem SQL dinâmico adicional fora dos tagged templates. O grep encontrou **70 queries** que tocam tabela com `offer_id`, `project_id`, `user_id`, `tenant_id` ou `account_id` no schema, mas não contêm literalmente nenhum desses campos. Elas são listadas integralmente abaixo.

### Falha efetiva de isolamento

- `routes/google-ads-oauth.ts:39` não entra na lista de 70 porque `tracking_google_ads_oauth_connections` não tem coluna com um dos cinco nomes; ainda assim ela possui `connected_by` e a listagem não o filtra. Junto com `routes/google-ads-oauth.ts:146-153`, é a falha crítica SEC-A-001.

### 70 queries sem filtro literal de tenant

- `routes/google-ads-oauth.ts:59,98,136,137` — cleanup global de states ou update por destination previamente validado por offer/state/user; `:98` depende do state atomically consumido. Recomenda-se manter o filtro de projeto na query de update por defesa em profundidade.
- `routes/meta-control.ts:396` — history por `campaign.id` retornado de update admin imediatamente anterior; rota exige admin.
- `routes/recovery-admin.ts:149,472,480,733` — IDs de channel/test/opportunity criados ou obtidos de consultas `project_id=${project.id}` no mesmo fluxo.
- `routes/tracking-admin.ts:2258` — order IDs vêm da seleção anterior com `p.offer_id=req.params.id`.
- `routes/tracking-advanced.ts:989,1003,1268,1281` — entry link/domain foi antes selecionado com `project_id=${p.id}`; updates subsequentes usam o ID já validado. `:1003` ocorre após transação que seleciona o link por projeto.
- `routes/tracking-public.ts:256,378,402,418,430,438,448,478,497,532,572,1290,1671,1970,2013` — fluxos públicos vinculados por `public_key`, signing token, recovery token, webhook token ou ID obtido em consulta anterior; não aceitam identidade de usuário. São queries capability/webhook e não autorização de painel. Não foi confirmada quebra tenant adicional por leitura estática.
- `routes/utmify-global-admin.ts:50,57,105,116,140,184,209,216` — operação global intencional, todas sob `assertAdmin`; global destination usa `scope='global'` e `project_id` é nullable desde migration 058.
- `routes/utmify-tracking-admin.ts:198` — IDs vêm de `resetDeliveries` calculado por projeto/offer no mesmo handler.
- `server.ts:80,103,113,154,183,191,224,241` — reconciliações/repairs/queue recovery globais de startup, sem request de usuário; updates por ID provêm das seleções anteriores. Não são superfície BOLA, mas não têm barreira SQL tenant.
- `services/recovery-automation.ts:242` — opportunity selecionada/claimed pelo worker antes do update por ID.
- `services/vturb.ts:103,107,125,129` — delivery foi selecionada pelo worker com join de `project_id`; updates subsequentes são pelo ID da row.
- `workers/meta.worker.ts:202,284,303` — delivery previamente carregada por ID do job e joins de projeto/pixel; updates de estado por ID.
- `workers/pushcut-delivery.worker.ts:19,72,79,119,127` — query inicial parte do delivery ID do job e valida os joins; updates por `row.id`.
- `workers/tiktok.worker.ts:91,97,101` — delivery carregada pelo ID do job com destination/project; updates por `row.id`.
- `workers/utmify-delivery.worker.ts:114,130,201,220,252` — delivery carregada/claimed antes; updates por ID ou seleção global de fila. `:252` é reconciliador global.
- `workers/utmify-web-event.worker.ts:53,97,109` — evento carregado pelo ID do job com destination e regras de projeto; updates por `row.id`.

### Conclusão do grep SQL

Das 70 queries literais, nenhuma outra quebra BOLA foi confirmada: handlers usam PKs obtidas de uma consulta tenant-scoped no mesmo fluxo, tokens-capability nos endpoints públicos, ou executam manutenção global/admin/worker. Isso não equivale a isolamento no banco: não há evidência de RLS e várias queries dependem de disciplina de aplicação. O fix recomendado de defesa em profundidade é carregar `project_id` junto com jobs/children e repetir `AND project_id=$authorizedProject` nos updates sempre que a tabela possui a coluna; para tabelas filhas sem `project_id`, usar `UPDATE ... FROM parent ... WHERE parent.project_id=...`.

## IDOR/BOLA — ocorrências de IDs controlados pelo request

- **Confirmadas inseguras:** as nove ocorrências de clone em SEC-A-002; `GET /vsl-jobs/:id` e `GET /funnel-jobs/:id` em SEC-A-003; o `connection_id` do body em SEC-A-001. Todas passam ID direto ao acesso de dados sem ownership do chamador.
- **Confirmadas seguras por checagem anterior/mesma query:** rotas de offer/tracking chamam `assertAccess`, `assertManager` ou `assertTrackingManager` antes do SQL, e child IDs (`destinationId`, `deliveryId`, `pixelId`, `stageId`, `linkId`, `domainId`, `testId`, `opportunityId`) são combinados com `offer_id`/`project_id` na seleção inicial. Media/shield usam `assertOwner`; niches usam `assertCanModify`; users exigem admin.
- **`req.query.offerId`:** não foi encontrada ocorrência. O dashboard usa `offer_id` snake_case e intersecta com `listAccessible` antes do SQL (`refunds-dashboard.ts:38-45`).
- **Pública por capability:** `preview.ts:15-31` recebe clone ID sem auth de forma deliberada; não foi classificada como IDOR confirmada porque o contrato declara o ULID como capability e não foi encontrada quebra de entropia. A obtenção cross-user do mesmo ID por endpoints autenticados continua confirmada em SEC-A-002.

## BFLA e doutrina de papéis

- **Admin real, conforme:** invites (`auth.ts:186-246`), users/admin overview (`users.ts:92-235`), `meta-control` (`assertAdmin` em cada handler) e `utmify-global` (`assertAdmin` em cada handler) exigem role admin.
- **Arquivos com sufixo `-admin` sem role admin:** `tracking-admin`, `meta-admin`, `google-ads-admin`, `tiktok-ads-admin`, `utmify-tracking-admin`, `pushcut-admin` e `recovery-admin` não exigem role admin; usam ACL de oferta. Pela doutrina, isso não é automaticamente falha, pois tracking manager deve operar ofertas concedidas. A falha confirmada é que a ACL não distingue tracking manager de membro e não é aplicada uniformemente (SEC-A-004).
- **Admin = gestão completa:** implementado por `isAdmin` bypass em `canAccessOffer/canManageOffer`, role checks de áreas globais e bypass do gate de ferramentas.
- **Convidado/membro = só ofertas atribuídas:** leituras de offer/tracking usam `listAccessible/assertAccess` e SQL offer/project-scoped; não foi confirmada leitura de oferta não atribuída nessas rotas. Clones/VSL/funil ficam fora do modelo de oferta e falham isolamento (SEC-A-002/003).
- **Tracking manager = só configura tracking nas ofertas concedidas:** não há role/capability própria; `assertTrackingManager` equivale a membership, e vários handlers usam `assertManager` em vez dele (SEC-A-004).

## Contagem final

- CRITICAL: **1**
- HIGH: **3**
- MEDIUM: **2**
- LOW: **0**
- Total: **6 findings**
