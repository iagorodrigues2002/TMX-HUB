# Page Cloner API container — bundles Chromium for the render worker.
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS base
WORKDIR /app

# Enable corepack so the right pnpm version is available.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json biome.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/
RUN pnpm install --frozen-lockfile
# Install the exact Chromium revision that playwright@x.y.z (lock file version) expects.
# playwright is a runtime dep of @page-cloner/api so the workers can resolve it.
# PLAYWRIGHT_BROWSERS_PATH=/ms-playwright is inherited from the base image.
RUN pnpm --filter @page-cloner/api exec playwright install chromium

# ---- build ----
FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY packages/api ./packages/api
COPY docs ./docs
RUN pnpm --filter @page-cloner/core build && pnpm --filter @page-cloner/api build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
# Railway / generic platforms set PORT; env.ts falls back to API_PORT/4000.

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/api ./packages/api
COPY --from=build /app/docs ./docs
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Bring the correct Chromium revision into the runtime image.
COPY --from=deps /ms-playwright /ms-playwright

WORKDIR /app/packages/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
