# Gateway-specific financial calculation

Existing tracking_fee_settings remain exclusively the VendePay per-offer model, unchanged. Generic Paysight/Explodely connections gain a separate fee_settings model with owner/offer-checked writes. SyzePay already has company-connection fees; its inbox is not a financial source until provider mapping and signature verification are completed.

One shared service scopes orders by authorized offer IDs, groups by provider and generic connection, and calculates approved-sale fees, temporary reserves, refund and chargeback tariffs independently. Legacy VendePay fixed tariff retains its configured currency; legacy reversal tariff remains USD27 as in the pre-existing model. No VendePay fee fallback for other providers. Orders missing a connection/model or currency conversion flag incomplete estimates. The home net/available KPIs display a dash rather than an apparently complete net value in that case.

Both tracking summary and financial overview consume the same gateway fee sums; owner totals aggregate offers only inside their authorization scope. Gateway table shows fee, reserve and reversal charges separately. Generic fee forms appear under their connections and in the offer fee section, while SyzePay stays company-scoped. No prices or fee values are invented for new gateways; no webhook/notification behavior is changed.
