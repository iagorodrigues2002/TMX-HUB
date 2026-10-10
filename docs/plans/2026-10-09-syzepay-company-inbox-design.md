# SyzePay company reception — approved scope

SyzePay only is company-scoped; existing gateways and offer URLs are untouched. In the payment context the top selector includes company choices leading to a dedicated SyzePay page. Companies are derived from the owner's offers and keyed by owner + normalized company name; guests cannot inspect a company-wide inbox through an offer invitation. No global access is inferred from admin role or matching display names.

Generate a random capability token; store its hash for lookup and encrypted value for owner-only copy. Capture exact raw bytes and a restricted set of signature/event headers encrypted. Persist before 202; database failures return 503. No vendor authenticity claim: token-only until the signature contract arrives. Never create orders, access entitlements or enqueue pixel/UTMify deliveries. A dedicated inbox table keeps it out of existing workers.

Exact-body hash collapses byte-identical transport retries within a connection and increments attempts; it is NOT transaction/business deduplication. Correct event IDs and replay logic will be implemented after the real contract arrives. Retain payloads for that later mapping. UI exposes metadata only, never customer payloads. Product mapping remains explicitly unavailable until first payload is understood.

UI uses existing TMX design tokens, company selector, connection list, secure URL reveal/copy and recent receipt list. Reception-only warning remains visible. Verify authentication/owner isolation, invalid tokens, raw JSON/form/binary bytes, duplicates, storage failure, body cap and no downstream effects. Build/typecheck both packages and verify both deployments.
