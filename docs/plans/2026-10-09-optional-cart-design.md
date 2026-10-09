# Optional offer cart

Approved by the user on 2026-10-09. Add an optional, functional cart for RWS_TTK without changing its entry URL or A/B destinations. A visitor starts with an empty cart, adds the configured real product, then may continue to the existing A/B checkout. No payment, purchase, member access, Meta or UTMify delivery is produced by adding an item.

Store product configuration and anonymous baskets in PostgreSQL, scoped to project. Product ID, name, price, currency and checkout test are authoritative server values. Persist the basket, AddToCart tracking event and TikTok delivery outbox atomically. A unique basket key makes double clicks, network retries and reloads idempotent. Reuse the existing TikTok worker/recovery queue, preserving Purchase handling. The browser and server share the event ID for deduplication. Access tokens never enter HTML.

The public page is available only for explicitly enabled cart configurations. Basket IDs are random UUID capabilities scoped to the public project; no buyer or order information is returned. Use canonical product IDs in both content_id and contents. Basket restoration does not send AddToCart again. Display acceptance of the basket, not a false claim of TikTok delivery or optimization eligibility.

UI: compact two-column product/cart layout that stacks on mobile. Existing TMX navy/teal palette (#08181f, #102630, #f3fafc, #97abb4, #23cbd5, #31515d), system UI typography, strong focus states, clear empty/loading/error/added states and no promotional claims. Explain that adding does not charge the visitor.

Verify route validation, project isolation, price tampering rejection, idempotency, HTML escaping, persistence before queueing, AddToCart payload without order_id and unchanged Purchase payload. Deploy and configure only RWS_TTK; use the browser to click the real button once and verify one basket/event, two accepted TikTok deliveries, unchanged order count and the existing checkout destination.
