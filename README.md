# TMX HUB

Hub de ferramentas internas TMX. Domínio principal: **theminex.com**.

Cada módulo é uma ferramenta independente; todas compartilham branding, layout e infraestrutura.

## Módulos

| Módulo | Status | Rota | Descrição |
|---|---|---|---|
| **Page Cloner** | Ativo | `/cloner` | Clona qualquer página pública, sanitiza scripts/trackers e permite reescrever forms e links antes de empacotar como HTML/ZIP |

## Stack

- **Monorepo:** pnpm workspaces, TypeScript 5, Node 22, ESM
- **Web:** Next.js 15 (App Router), Tailwind v4, shadcn-style UI, TanStack Query
- **API:** Fastify v5, BullMQ + Redis, S3-compatível para storage
- **Core:** biblioteca pura TS — Playwright para render, cheerio + postcss para sanitize/asset-resolve, archiver/jszip para bundling
- **Shared:** zod schemas + tipos compartilhados

## Estrutura

```
packages/
├── shared/   # tipos + zod schemas (HTTP contract)
├── core/     # biblioteca de clonagem (fetch, sanitize, resolveAssets, extract, bundle)
├── api/      # Fastify + BullMQ workers + S3 storage
└── web/      # Next.js TMX HUB (landing + /cloner)
docs/
└── openapi.yaml   # contrato da API
```

## Desenvolvimento local

Pré-requisitos: Node 22, pnpm 9, Redis, MinIO (ou S3), Playwright Chromium.

```bash
# 1. Dependências
pnpm install
pnpm --filter @page-cloner/core exec playwright install chromium

# 2. Infraestrutura local (escolha)
docker compose up -d redis minio minio-init     # via Docker
# ou
brew install redis minio/stable/minio
redis-server --port 6379 &
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin minio server .runtime/minio --address :9000 --console-address :9001 &
node packages/api/scripts/init-bucket.mjs

# 3. Build da core (workers da API importam dist/)
pnpm --filter @page-cloner/core build

# 4. Subir API + Web
pnpm --filter @page-cloner/api dev    # http://localhost:4000  (docs em /docs)
pnpm --filter @page-cloner/web dev    # http://localhost:3100
```

## Variáveis de ambiente

Copia `.env.example` → `.env` na raiz. Para o web, criar `packages/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
```

## Testes

```bash
pnpm test                   # roda todos os pacotes
pnpm -r typecheck           # typecheck do monorepo
```

## Deploy

Pretendido: Railway. `railway.toml` será adicionado em commit subsequente.
