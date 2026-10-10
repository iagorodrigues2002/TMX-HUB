# SyzePay observed contract and explicit classification

Actual signed payload uses root id/type/created/api_version and data.object, not event.id/order.id. Signature is t=seconds,v1=HMAC-SHA256(timestamp+'.'+raw bytes) using the provider's text secret. Verify at receipt time (5-minute tolerance); archived replay verifies against original received_at. Store secrets encrypted; no provider keys in code or tests.

The observed order.created and order.paid refer to one order. Only production order.paid, status succeeded, kind sale and positive integer amount can create a paid record. User confirmed the observed R$124.17 payment is PJR_ESP Front, and its signed TMX src also identifies that offer. No vendor product ID is supplied: expose manual per-order offer/stage classification, use an explicitly internal product identity, and do not infer a store-wide front rule from this one example.

Owned company connection and owned offer must match. Signed attribution must match selected project. Immutable mapping prevents reclassifying an already dispatched payment. Transaction writes one provider/order record plus durable Meta/UTMify/TikTok/Pushcut outboxes. Only front goes to pixels, honoring product filters; UTMify scope/global offer route and notification preferences are preserved. Replay does not create additional deliveries.

Merge real first-party visitor attribution; do not invent email, name, phone or click IDs. Retain provider fee/net monetary information and use reported net in UTMify when valid. Actual successful API delivery must be checked before claiming sent; acceptance is not proof of perfect match/attribution. Internal diagnostic receipts are non-financial and hidden from classification.
