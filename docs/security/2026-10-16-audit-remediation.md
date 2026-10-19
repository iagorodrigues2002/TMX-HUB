# Audit remediation — local changes, not deployed

> Registro histórico de 16/10. A validação foi ampliada em 18/10:
> [correções dos testes e revisão das pendências](../plans/2026-10-18-test-failures-validation.md).
> O impedimento do runner Linux e parte das lacunas de testes abaixo foram resolvidos
> localmente. Uma rodada posterior implementou e testou o
> [isolamento de Chromium/FFmpeg e corrigiu o lint](../plans/2026-10-18-lint-process-isolation.md).
> Os limites abaixo registram o estado anterior; suporte da infraestrutura live não
> foi verificado. Sem publicação.

## Resumo para operação

Correções aplicadas somente no código local: isolamento de sessão, cadastro e
convites atômicos, permissões dos gateways, reconciliação por oferta, identidade
de upsell, consultas HTTP públicas e limites/limpeza das ferramentas.

Passaram 17 testes focados e as checagens de tipos de shared/core/API/web. A suíte
Vitest completa não iniciou por falta do binário Linux, sem instalação de
dependências. Não houve deploy, replay, teste de pixel ou consulta a dados reais.

Os envios financeiros, payloads e normalizadores permanecem iguais. Para IDs
de venda divergentes, o evento público não cria mais um vínculo presumido:
é necessária a validação baseada no recibo. Dados históricos foram preservados.

**Pendência:** o isolamento de rede de Chromium/FFmpeg não foi implementado.
Os detalhes e demais limites de validação estão abaixo. Este pacote não deve
ser apresentado como fechamento completo dos 13 indícios.

Based on the source audit of commit
`40b6cf300256614809783835966ad5697b28a9da`. This is an implementation
handoff, not a replacement for the immutable audit and not a claim that its
13 pending leads were reproduced vulnerabilities.

## Operational boundary

No production login, database/Redis query, environment change, import, replay,
test notification, pixel event, financial dispatch, migration execution or
deployment was performed. Existing data was not repaired or reclassified.
Provider payload constructors, normalizers and financial dispatch workers were
left unchanged. The clone callback uses the same JSON/signature/event headers;
only its destination transport is restricted. Administrative reconciliation is
now narrower, not a new automated send.

## Changes by original fingerprint

| Fingerprint | Source change |
|---|---|
| api/rate-limit/unverified-api-key-quota-scope | Remove unverified x-api-key quota partitioning; keep the existing limits and IP policy. |
| auth/bootstrap-nonatomic-first-admin | Check store emptiness atomically with account creation in Redis. |
| auth/invite-postcreate-consumption | Invitation validity, account/email creation and invitation deletion are one Lua operation; no swallowed post-create consumption error. |
| auth/password-change-retains-jwt | Rejected audit claim: unchanged, no invented session-revocation policy. |
| clone-callback-preflight-not-bound-to-delivery | Use connection-time checked DNS with a private/reserved-address deny policy and validate each redirect. |
| core-outbound-fetch-unchecked-destinations | Guard static page, asset and bundle requests at connection time. Browser requests get preflight checks, service-worker bypass is disabled and WebSockets are blocked. Top-level VSL inputs are checked and FFmpeg file inputs disabled. **Partial: Chromium/FFmpeg still require mandatory network isolation; see below.** |
| core/assets/recursive-download-budget-and-cancellation | Asset count, aggregate bytes and CSS-depth bounds; propagate abort signals from render deadline and fence later stage writes. |
| explodely/global-routing/unverified-account-claim | Only admins can create Explodely connections or change their vendor/seller selectors. Existing mappings and receipt processing are unchanged. |
| vsl-parallel-download-partial-failure-temp-retention | Wait for all sibling download results and register every successful file before propagating failure/cleanup. |
| webhook-tester-hostname-only-destination-filter | Same connection-time destination policy as callback tools, not just a hostname regex. |
| utmify-upsell-reconcile-global-destination-scope | Offer reconciliation may reset only offer-scoped destinations. Global replay remains on its administrator route. |
| web/session/late-mutation-cache-repopulation | Session generation fences on mutation submission, asynchronous optimistic update, rollback and success callbacks. |
| tmx-upsell-public-event-unbound-fetch | A valid stage token no longer authorizes an arbitrary URL. Choose the configured path/query, then use guarded HTTP transport. |
| tmx-upsell-public-event-unbound-buyer-replacement | Public analytics cannot delete/rebind an identity. Identity insertion requires signed visitor, paid Vendepay front and exact sale association; conflicts do nothing. |

### Deliberate identity behavior

Unsigned observations remain analytics, not buyer identity authority. When the
provider vendaId differs from the order transaction UUID, public visitor claims
are no longer sufficient to join them. That enrichment must come from the
receipt-backed identity worker/refresh. Existing confirmed identities are kept.
This can leave an order pending validation instead of guessing an association.
No historic identity or order was changed.

## Validation performed

- Shared/core/API/web TypeScript checks passed in a disposable offline Linux
  container. Shared/core declarations were generated only in scratch.
- 17 focused Node tests passed, with no failures/skips: real isolated Redis
  concurrency and invitation revocation, destination/encoding rules,
  connection-lookup DNS changes, bounded asset admission, paired download
  cleanup, session isolation/fencing, private preview and actual Fastify
  gateway route guards (five role/action fixtures).
- Some public-identity and reconciliation assertions inspect source guards;
  they are not PostgreSQL integration or real-renderer browser tests.
- Existing Vitest suites could not start: the locally available macOS
  dependencies lack `@rollup/rollup-linux-arm64-musl`. No dependencies were
  installed or fetched. Do not describe the entire suite/build as passing.
- `git diff --check` passed.

The native regression file is `packages/api/test/security-remediation.node.ts`
(intentionally not auto-discovered by Vitest). Its Redis tests require a fresh
isolated fixture and explicit opt-in. Never point them at a user's Redis:
the fixture database is reset between cases.

### Sandbox controls

No host credentials, sockets, home directory, real env files or shared services
were mounted. Only a disposable versioned-source copy and already installed
dependencies were placed in a test volume, mounted read-only for test execution.
Environment started empty with explicit dummy fixture values. Runtime: locally
available Node 24.15.0 image, not a newly downloaded image.

Network was disabled; Redis tests shared only the loopback namespace of a newly
created Redis fixture whose network mode was none. No host port was published.
Test process UID 65534, all capabilities dropped, no-new-privileges, read-only
root/source/tools, scratch-only writable tmpfs 96 MiB; CPU 1, memory/swap 768 MiB,
64 PIDs, CPU limit 90 s, wall deadline 90 s, file cap 8 MiB, 256 descriptors.
Redis fixture had separate small resource limits, no persistence and a finite
lifetime. This does not certify production egress.

The executed native test command (inside that sandbox) was:

```sh
node --experimental-transform-types --import /work/sandbox-loader.mjs \
  --test --test-concurrency=1 \
  /work/packages/api/test/security-remediation.node.ts \
  /work/packages/web/test/member-session-isolation.test.ts
```

The temporary loader resolved source .js references to their .ts files and
workspace aliases to scratch-compiled shared/core modules; it did not mock the
Redis Lua implementation or the Fastify gateway handlers. Tests use the
explicit dummy users/URLs/errors recorded in the source files. The environment
allowlist was HOME=/scratch, XDG_CACHE_HOME=/scratch/cache,
PATH=/usr/local/bin:/usr/bin:/bin, TMPDIR=/scratch, NODE_ENV=test,
JWT_SECRET=dummy-security-fixture-jwt-secret-1234567890,
TRACKING_ENCRYPTION_KEY=dummy-fixture-key-not-for-production-123456,
TMX_ISOLATED_SECURITY_FIXTURE=network-none-dummy-redis and
SECURITY_TEST_REDIS_URL=redis://127.0.0.1:6379/15. No ambient variables were copied.
These keys are fixture strings, not platform credentials.

## Remaining before a complete security closure

Chromium and FFmpeg are independent network clients. A DNS preflight cannot
guarantee which IP those clients will connect to later, and HLS/DASH can choose
nested resources. Application guards and removal of file inputs reduce exposure,
but do not close the rebinding/private-network lead for these clients.

Complete closure needs a mandatory public-only egress boundary for isolated
browser/media workers, including redirected and nested media requests, with no
bypass from direct TCP, DNS, WebRTC or local-file protocols. That is an
infrastructure/worker separation decision, not a safe silent change to production
or a reason to disable legitimate downloads by default. It has not been
implemented or deployed here.

Still pending: complete Vitest suite on a compatible offline toolchain,
local browser A/B account-rendering fixture, nested/redirect transport tests and
PostgreSQL integration cases for identity/reconciliation. No production
confirmation, migration or release is claimed.
