# Existing Ads Intelligence classification and calculations

User-approved rules: the ad name can identify the offer, creative and batch. `PJR_ESP_AD03_L17` resolves to that offer, AD03/L17. `SLM_DE_AD75_H2_AV13` resolves to AD75/H2_AV13 with default L1 (shown as Leva 01). An explicit single batch in ad or adset overrides the default. Conflicting batches or creative numbers remain pending. Offer prefixes and copy suffixes do not create creative variants; hook and avatar do. Automatic conflicting campaign/ad offers remain pending; existing owner-authorized manual mapping is authoritative.

Classification applies when reading existing immutable snapshots: no provider import, order mutation or physical cost deduplication change. Account, platform, offer and variant remain part of the logical aggregation key. Sales and checkout facts require a unique matching logical row; duplicate ad IDs across accounts are not arbitrarily attributed. Financial facts are restricted to imported coverage dates, not individual ad snapshot days, to preserve legitimate delayed conversions.

ROAS = attributed TMX gross BRL revenue / UTMify BRL spend. ROI = (attributed gross revenue - spend) / spend × 100. These are not net profit and do not deduct refunds, gateway fees or reserves. Unknown/zero spend and accounts with cost gaps overlapping coverage cannot produce ratios. A first import must have completed at least once; currently committed partial days are visible with their actual date range.

An unrelated failed account or pending campaign no longer suppresses all healthy row ratios. Each ad and batch totals expose `calculation_status` (complete/provisional/unavailable) and `calculation_reason`. Partial global coverage or unattributed paid orders makes numeric eligible ratios provisional, not complete attribution. Batches propagate unknown spend and their own account gap; never sum unrelated accounts into one batch.

Paid orders with BRL conversion pending are counted as sales but never treated as zero-value revenue. Their matched ad/batch ratios remain unavailable with `Faturamento com conversão pendente`; other healthy rows are provisional. Unknown unattributed revenue counts are exposed separately; known sums ignore NULL rather than invent a conversion.

Regression evidence: parser tests cover prefixes, default batch, hook/avatar, accented copy and conflicts; route tests cover partial account isolation, gross formulas, unknown/zero spend and revenue, variant separation, owner isolation, unique ID attribution and no external calls on read.
