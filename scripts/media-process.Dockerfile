# Local media integration fixture only; never use this image for the application.
FROM node:24-alpine

RUN apk add --no-cache chromium ffmpeg \
    && corepack enable \
    && corepack prepare pnpm@9.12.0 --activate

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=true
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm --filter @page-cloner/core... install --frozen-lockfile --ignore-scripts

COPY packages/core/tsconfig.json packages/core/tsup.config.ts ./packages/core/
COPY packages/core/src ./packages/core/src
COPY packages/core/test/media-process.integration.mjs ./packages/core/test/
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src
RUN pnpm --filter @page-cloner/core build

WORKDIR /app/packages/core
CMD ["node", "--test", "--test-concurrency=1", "test/media-process.integration.mjs"]
