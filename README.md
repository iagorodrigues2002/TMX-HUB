# TMX HUB

Hub interno TMX para operações de direct response, ferramentas de páginas/mídia, tracking,
integrações e análise financeira. Domínio do produto: theminex.com.
[PRODUCT.md](PRODUCT.md) define usuários, propósito e voz; código existente não equivale
a garantia de disponibilidade de cada integração em produção.

## Módulos observados

Rotas presentes no checkout, sem afirmar validação ponta a ponta:

| Área | Rotas |
|---|---|
| Page Cloner e Funnel Clone | `/tools/cloner`, `/tools/funnel-clone` |
| Cloaker URLs e Page Diff | `/tools/cloaker-urls`, `/tools/page-diff` |
| Video Shield, VSL, Creative Studio | `/tools/video-shield`, `/tools/vsl`, `/tools/creative-studio` |
| Upsell Analyzer, Webhook Tester, Digi Approval | `/tools/upsell-analyzer`, `/tools/webhook-tester`, `/tools/digi-approval` |
| Tracking e UTMify geral | `/tracking`, `/utmify-geral` |
| Ofertas, reembolsos e recuperação | `/ofertas`, `/reembolsos`, `/recovery` |
| Ads Intelligence, Meta e Syzepay | `/ads-intelligence`, `/contas-meta`, `/integracoes/syzepay` |

## Stack e estrutura

pnpm workspaces, Node >=22, TypeScript/ESM; Next.js 15/React 19, Tailwind v4,
shadcn-style/Radix e TanStack Query; Fastify 5, postgres.js/PostgreSQL, Redis/BullMQ
e S3 compatível. Os nomes históricos `@page-cloner/*` permanecem.

- `packages/shared`: contratos Zod/tipos entre web e API.
- `packages/core`: clonagem, sanitize/assets, bundle e ferramentas TS sem framework web.
- `packages/api`: rotas, serviços, banco, workers e integrações.
- `packages/web`: aplicação Next.js e componentes.
- `docs`: especificações, planos e procedimentos.

## Começar com segurança

Siga [o onboarding](docs/onboarding.md) antes de instalar ou iniciar serviços. A API abre
recursos externos, inicia workers e recupera filas; seu script start também aplica migrações.
Não validar usando credenciais/recursos de produção. `.env.example` é inventário, não ambiente
pronto. O compose existente requer os cuidados registrados no onboarding.

Comandos canônicos na raiz, após preflight/isolamento:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Web: `pnpm --filter @page-cloner/web dev` (3100).
API: `pnpm --filter @page-cloner/api dev` (4000 por padrão), somente com ambiente local
preparado e boot autorizado. Não há publicação automática autorizada por este README.

## Documentação

- [Produto](PRODUCT.md) e [design canônico](DESIGN.md) (equivale a docs/design.md).
- [Arquitetura](docs/architecture.md) e [preparação local](docs/onboarding.md).
- [Qualidade e revisão privada de segurança](docs/quality.md).
- [Instruções compartilhadas para agentes](AGENTS.md); [CLAUDE.md](CLAUDE.md) importa AGENTS.
- [Setup e evidências datadas](docs/setup.md).
- [Referência OpenAPI existente](docs/openapi.yaml), sem garantia de cobertura de todas as rotas.

## Deploy — Railway (referência manual histórica)

Esta seção preserva o roteiro operacional anterior. Não foi revalidada neste setup e não deve
ser executada automaticamente: criação de recursos, custos, DNS, push, deploy e migrações
exigem autorização específica. Preços, planos, permissões CORS e Watch Paths abaixo precisam
de revisão para o ambiente escolhido. Push em main pode disparar Railway; não publicar como
consequência de uma edição local. O start da API aplica migrações e inicia workers.

Você precisa de:
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
