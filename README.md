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

## Deploy — Railway

Setup completo em ~15 minutos. Você precisa de:
- Conta Railway com plano que permita Dockerfile builds (Hobby ou superior)
- Conta Cloudflare (free) para R2 storage

### Passo 1 — Criar bucket R2

1. https://dash.cloudflare.com → R2 Object Storage → Create Bucket
2. Nome: `tmx-hub-clones`, region: Automatic
3. Settings → CORS Policy → libera `Origin: *`, `Methods: GET, PUT, POST, DELETE`
4. R2 Overview → Manage R2 API Tokens → Create API Token
   - Permissions: **Object Read & Write**
   - Specify bucket: `tmx-hub-clones`
5. Anota: `Access Key ID`, `Secret Access Key`, `Endpoint` (formato `https://<account-id>.r2.cloudflarestorage.com`)

### Passo 2 — Criar projeto Railway

1. https://railway.app → New Project → **Deploy from GitHub repo** → seleciona `iagorodrigues2002/TMX-HUB`
2. Railway vai criar 1 serviço inicial. **Não deploya ainda** — vamos ajustar antes.

### Passo 3 — Configurar serviço `api`

Renomeia o serviço inicial pra `api` e configura:

- **Settings → Source:**
  - Root Directory: `/` (raiz do repo)
  - Dockerfile Path: `packages/api/Dockerfile`
  - Watch Paths: `packages/api/**`, `packages/core/**`, `packages/shared/**`
- **Settings → Networking:**
  - Generate domain (Railway gera um `*.up.railway.app` público)
  - Anota o domínio gerado
- **Variables:** copia bloco `Service: api` do `.env.production.example` e cola, substituindo os `<placeholders>` do R2

### Passo 4 — Adicionar Redis

1. No projeto, **+ New** → **Database** → **Redis**
2. Nome: `redis`, plano free
3. Vai pro serviço `api` → Variables → **+ New Variable Reference** → seleciona `redis.REDIS_URL`

### Passo 5 — Criar serviço `web`

1. No projeto, **+ New** → **GitHub Repo** → mesmo repo `TMX-HUB`
2. Renomeia pra `web`
3. **Settings → Source:**
   - Root Directory: `/`
   - Dockerfile Path: `packages/web/Dockerfile`
   - Watch Paths: `packages/web/**`, `packages/shared/**`
4. **Settings → Networking → Generate domain** (anota)
5. **Variables:**
   ```
   NEXT_PUBLIC_API_URL=https://<api-domain-do-passo-3>
   ```

### Passo 6 — Deploy

Os dois serviços vão buildar e subir. Acompanha em Deployments.

- API tarda ~5min no primeiro build (imagem Playwright pesada, fica em cache)
- Web tarda ~2min

Quando ambos ficarem `Active`:
- API: testa `https://<api-domain>/healthz` → deve retornar `{"status":"ok"}`
- Web: abre `https://<web-domain>` → vê a TMX HUB landing
- Cria um clone via UI, valida fluxo end-to-end

### Passo 7 — Domínio próprio

No serviço `web` → Settings → Networking → **Custom Domain** → adiciona `theminex.com`. Railway te dá um CNAME ou A record pra colocar no DNS da Hostinger.

Faz o mesmo no `api` se quiser tipo `api.theminex.com` (recomendado, ao invés de expor o `*.up.railway.app`). Aí atualiza `NEXT_PUBLIC_API_URL` no web pra apontar pro domínio bonito e redeploya o web.

### Custos esperados

| Componente | Custo |
|---|---|
| Railway Hobby ($5 crédito) | ~$5-10/mês conforme uso |
| Redis plugin (Railway) | Incluso no crédito |
| Cloudflare R2 | Free até 10GB armazenado, 1M requests/mês |
| Domínio Hostinger | Já tem |
| **Total** | **~$5-10/mês** |
