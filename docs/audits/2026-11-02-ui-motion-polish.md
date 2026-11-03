# UI and motion polish — local validation

Base checked: `414e2b564bcffb0c72563f36a55fa2105286b048`. Existing pending changes preserved. No push, deploy, migration, permission write, financial operation or external send performed in this UI pass.

## Changes

- Route entrances now retain screen identity across HubShell remounts. First visits use a finite 440 ms panel entrance with bounded staggering; revisits use a 220 ms dissolve. Polling does not replay the entrance. Hidden pages, disabled effects and reduced-motion preferences cancel/skip motion.
- Shared tabs and buttons use consistent theme tokens, legible labels, visible focus and mobile touch targets. Reading panels no longer use costly backdrop blur. The background is quieter. The status footer stays below normal page content rather than overlapping it.
- Tasks/calls have a compact context bar, denser summary and clearer action hierarchy. Finance and member-permission controls use the same accessible controls, with responsive provider filtering and labelled expandable permissions.
- DateRangeFilter no longer pushes a wrapped De/Até row to the right. Existing date values, bounds, presets and callbacks are unchanged.

## Evidence

- Web regression suite: 216 passed, 0 failed, 0 skipped.
- Web TypeScript check: passed.
- Biome: 1,061 files checked, passed without fixes.
- Production web build: passed; 35 static pages generated, shared first-load JS 104 kB. Existing Browserslist age and Node deprecation warnings remain.
- Browser: tasks, calls, finance sections and member permission expansion checked using synthetic local data; no permission save. Light/dark theme inspected. At 390 px the finance provider filter fits and the document has no horizontal overflow.
- Date controls checked at 390, 1280 and 1440 px: range remained 27/10/2026–02/11/2026, desktop left edge matches presets, mobile inputs remain 44 px high, no document overflow or console errors observed.

Screenshots: `/tmp/tmx-ui-after-desktop.png`, `/tmp/tmx-ui-finance-mobile-final.png`, `/tmp/tmx-date-filter-desktop.png`, `/tmp/tmx-date-filter-mobile.png`.

## Boundaries

This validates the local UI pass, not production readiness for unrelated pending backend/company migrations. Reduced-motion behavior is covered by source and automated checks; no OS preference emulation or low-end-device FPS benchmark was performed. API/business handlers were not changed by this pass. No new dependency or paid generated asset was required.
