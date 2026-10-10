# Isolated SyzePay fees

Fees belong to each SyzePay company connection, not the offer-level VendePay fee table. Store an explicitly configured JSON fee model and update timestamp; existing connections start unconfigured, never inherit VendePay defaults. Configure sale percentage, fixed tariff and currency, temporary reserve, chargeback tariff and refund tariff. Owner-only update with strict numerical bounds and integer minor amounts.

UI lives below the corresponding connection card. No sale normalization or fee deduction is enabled while SyzePay is reception-only; later normalization must use this connection's fees and real gateway amounts rather than VendePay assumptions. Do not change existing financial models for other gateways. Verify schema validation, owner-scoped updates, both builds and live form.
