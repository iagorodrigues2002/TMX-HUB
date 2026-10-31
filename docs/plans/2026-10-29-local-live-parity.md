# Local/live parity — 2026-10-29

- Local and remote main: `9a6919d0dc53e9132d10410392940b6abe13ed14`.
- Railway web: `8d24d99ee72afe42330bacf5cd85c68711400b77`; no web/shared differences to main. Railway API: `9a6919d`.
- Local web: http://localhost:3100, signal preview enabled as in live, API proxy to local port 4000.
- Replaced the API runtime from the 16 October export with the current checkout's HTTP-only `packages/api/scripts/local-preview-api.mts`.
- Database: isolated local `tmx_live_preview_20261029`, cloned from existing local `tmx_hub_dev`; 9695 orders retained, migrations through 105 applied. Original database retained unchanged.
- Redis: isolated `tmx-live-preview-redis-20261029`, loopback port 32769; copied local auth/catalog only, not queued jobs.
- Configuration: ignored `.runtime/local-preview.env` (mode 600) and `packages/web/.env.local`. Never commit credentials.
- Start API with a loopback-only network sandbox, `node --env-file=.runtime/local-preview.env --import tsx packages/api/scripts/local-preview-api.mts`; do not use server.ts for this preview because it starts business workers.
- Start web with `pnpm --filter @page-cloner/web dev` from this checkout.
- Pending notification/task implementation preserved. No push, deploy, or production data mutation.
- Browser verified current shell and signal-preview banner. Current browser identity is Admin Local, with no available offers; this is not a copy of production account access or current production data.
- Validation: web typecheck passed; two local-runtime regression checks passed; unauthenticated API and web proxy return 401.
