# Owner-scoped Ads Intelligence campaign exclusions

The user requested removing exactly two unrelated campaigns from TMX Ads Intelligence. Store exact campaign names in the owner's connection `excluded_campaigns` JSON array (default empty). Apply exclusion before classification, pending grouping and ad aggregation to both retained and future imported snapshots. No names are globally hardcoded, no provider campaign is modified, and no raw snapshot is deleted. Removing a name from the array restores its visibility.

Production read-only resolution found the exact names `[Rede Pesq][Leads] Arte Country Club | 16.12` and `[SEARCH] Hillside - Leads | 28.09`: each has 1,095 Google/BRL daily snapshots, 01 August–12 October, zero recorded spend. The requested owner's list is populated only after deployment verification and explicit root authorization; schema migration initializes every owner's list empty.

Tests cover exact-name exclusion, nonmatching suffix retained, future/older snapshots, legacy empty default, different owner unaffected and absence of DELETE operations. This change does not add a provider import or mutate financial orders.
