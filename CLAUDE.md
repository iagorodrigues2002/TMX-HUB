# TMX-HUB

Hub de ferramentas internas TMX (domínio principal `theminex.com`). Monorepo pnpm com 4 pacotes:

- `packages/shared` — contratos Zod e tipos TypeScript compartilhados
- `packages/core` — biblioteca pura TS (Playwright + cheerio + postcss + archiver/jszip)
- `packages/api` — Fastify v5 + BullMQ + Redis + S3/R2 (Node 22, ESM)
- `packages/web` — Next.js 15 (App Router) + Tailwind v4 + shadcn/ui + TanStack Query

Módulos: Page Cloner (`/cloner`), Cloaker URLs (`/cloaker-urls`), Video Shield (AssemblyAI + jobs BullMQ + envio em massa).

Deploy: Railway (api + web + Redis) + Cloudflare R2.

## Regras de comunicação e convenções

**IMPORTANTE: SEMPRE responda em português brasileiro (pt-BR).**

- Lint/format: **Biome** (`pnpm lint`, `pnpm format`). Aspas simples, vírgula final, semicolons, indent 2 espaços, lineWidth 100.
- TypeScript estrito, ESM puro (`"type": "module"`), Node `>=22`.
- `useImportType: error` — sempre `import type { ... }` para tipos.
- Nunca usar `pnpm install` em pacote isolado; rode na raiz. Workspaces em `pnpm-workspace.yaml`.
- Pacotes referenciam-se via `workspace:*` (ex.: `@page-cloner/shared`).
- Schemas Zod vivem em `packages/shared` e são reusados por `api` e `web`.
- `core` é pura — sem Fastify/Next; Playwright é peerDependency opcional.
- Web roda na porta `3100` (`pnpm --filter @page-cloner/web dev`).
- Jobs longos (Video Shield, Cloner) rodam em BullMQ; nunca bloqueie request handlers Fastify.

### Comandos pnpm essenciais

| Ação | Comando |
|---|---|
| Dev (todos pacotes em paralelo) | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Filtrar pacote | `pnpm --filter @page-cloner/<pkg> <script>` |

## AI Team Configuration (autogerado por team-configurator, 2026-05-06)

**Important: YOU MUST USE subagents when available for the task.**

### Stack detectada

- Backend: Fastify v5, BullMQ, ioredis, AWS SDK S3, Playwright, Zod, pino
- Frontend: Next.js 15 App Router, React 19, Tailwind v4 beta, shadcn/ui (Radix), TanStack Query v5, Zustand, react-hook-form
- Lib: cheerio, postcss, jsdom, dompurify, archiver, undici
- Infra: Node 22, pnpm 9, TypeScript 5.6, Biome 1.9, tsup, vitest, Railway, Cloudflare R2

### Mapeamento pacote → agente

| Pacote / Área | Agente principal | Notas |
|---|---|---|
| `packages/web` (Next.js 15 + App Router + RSC) | `@react` | Server/Client Components, hooks, TanStack Query, react-hook-form |
| `packages/web` (estilos Tailwind v4 + shadcn) | `@tailwind-css-expert` | tokens Tailwind v4, variantes shadcn, `components.json` |
| `packages/api` (Fastify + plugins + rotas) | `@backend-developer` | Fastify v5, plugins (`@fastify/multipart`, swagger, rate-limit), BullMQ workers, S3/R2 |
| `packages/api` (design de endpoints / contratos) | `@api-architect` | versionamento, schemas Zod, OpenAPI via `@fastify/swagger` |
| `packages/core` (lib TS pura: Playwright, cheerio, postcss, archiver) | `@backend-developer` | TS puro Node, sem framework; manter peerDeps opcionais |
| `packages/shared` (Zod + tipos) | `@api-architect` | contrato único entre `api` e `web` |
| Frontend genérico / acessibilidade / UX | `@frontend-developer` | fallback quando não for específico de React |
| Performance (jobs BullMQ, Playwright, bundle Next) | `@performance-optimizer` | obrigatório em PRs que tocam hot paths |
| Code review (todo PR) | `@code-reviewer` | obrigatório antes de merge |
| Onboarding / mapa do repo | `@code-archaeologist` | quando entrar em módulo desconhecido |
| Quebra de tarefa cross-package | `@tech-lead-orchestrator` | features que tocam web + api + core juntos |
| Análise de requisitos / planejamento | `@project-analyst` | scoping de novos módulos (ex.: nova ferramenta no hub) |
| Documentação (`docs/`, READMEs) | `@documentation-specialist` | manter `docs/` em pt-BR |

### Roteamento por intenção

| Pedido típico | Delegar para |
|---|---|
| "Criar página `/foo` no hub" | `@react` + `@tailwind-css-expert` |
| "Adicionar endpoint Fastify / job BullMQ" | `@backend-developer` (+ `@api-architect` para schema) |
| "Novo schema Zod compartilhado" | `@api-architect` em `packages/shared` |
| "Otimizar Playwright / fila / bundle" | `@performance-optimizer` |
| "Revisar PR" | `@code-reviewer` |
| "Feature nova cross-package" | `@tech-lead-orchestrator` divide → especialistas |
| "Entender módulo existente" | `@code-archaeologist` |

### Exemplo de uso

> `@backend-developer` adicione rota `POST /v1/shield/bulk` em `packages/api` consumindo schema Zod de `packages/shared` e enfileirando jobs no BullMQ.
