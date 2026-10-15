# Consolidate logical ads across advertising accounts

The user explicitly requested one batch per offer/batch, independent of advertising account or platform. Read-time batch identity is now `[offerId,batch]`; ad identity is `[offerId,batch,ad,variant]`. This supersedes the earlier account/platform-separated display decision. Owner filtering and unique offer identity preserve company separation; hook/avatar variants remain distinct.

Every physical daily snapshot retains its original identity and stored costs; no import or database mutation is necessary. All physical source account/platform/campaign/ad IDs and advertiser pages remain in the expanded source details. Known metrics are summed, not averaged. Ratios are recalculated from total converted BRL revenue and BRL spend: e.g. R$500/R$400 = 1.25 ROAS and 25% gross ROI.

Revenue/checkout facts are assigned once to a uniquely identified logical creative, including when multiple source records share its ad ID. The same ID pointing to different logical creatives remains ambiguous. Unknown cost or any failed cost source blocks its combined creative/batch ratio rather than hiding the missing component; unrelated healthy creatives can still expose provisional ratios.

Tests cover two platforms/accounts merged, weighted ratios, preserved physical source IDs/pages, duplicate fact counted once, offer/company boundaries, hook variants, partial-source gaps and legacy owner isolation. No weekly scheduler, provider credentials, payment/order data or physical deduplication key changes.
