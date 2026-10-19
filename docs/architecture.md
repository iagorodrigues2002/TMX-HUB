# Arquitetura do TMX HUB

Mapa estático conferido em 2026-10-18, sem certificação de runtime/produção. Escopo em
[PRODUCT.md](../PRODUCT.md); design canônico em [DESIGN.md](../DESIGN.md), equivalente
a `docs/design.md` sem cópia adicional.

## Stack e mapa

Monorepo pnpm, Node >=22, TypeScript estrito/ESM. Os nomes históricos dos workspaces
continuam `@page-cloner/*`, mesmo após a expansão do produto.

| Área | Responsabilidade observada |
|---|---|
| `packages/web/src/app` | Next.js 15 App Router/React 19: páginas, sessão e ferramentas |
| `packages/web/src/components` | UI existente, Tailwind v4, shadcn-style/Radix |
| `packages/shared/src` | Schemas Zod e tipos compartilhados, exportados por index.ts |
| `packages/api/src/routes` | Rotas Fastify 5 e controles por operação |
| `packages/api/src/plugins` | Auth, banco, filas, storage, CORS, limites, erros e Swagger |
| `packages/api/src/services` | Lógica/persistência dos módulos, integrações e outboxes |
| `packages/api/src/workers` | BullMQ: render/bundle, mídia, tracking e entregas |
| `packages/api/src/integrations` | Adaptadores de provedores |
| `packages/core/src` | Clonagem, sanitização, assets, bundle e ferramentas TS sem framework web |
| `packages/api/migrations` | SQL versionado aplicado pelo runner da API |

A web usa a API; contratos reutilizáveis pertencem a shared. Handlers usam serviços e
filas; workers executam tarefas longas. O core usa cheerio/postcss/archiver/jszip e pode usar
Playwright, declarado como peer dependency opcional. Não transformar core em camada Fastify/Next.
`docs/openapi.yaml` é referência existente, não garantia de cobertura de todas as rotas;
confira também `packages/api/src/routes/index.ts`.

## Dados e efeitos de boot

PostgreSQL usa **postgres.js**, não Drizzle/Supabase. O plugin
`packages/api/src/plugins/database.ts` cria o cliente quando DATABASE_URL existe, com pool
máximo de 10, timeout de conexão 10s e encerramento no fechamento da aplicação. O wrapper
de retry em `src/lib/postgres-retry.ts` não torna toda escrita automaticamente segura para retry.
Redis sustenta filas/caches; S3 compatível guarda artefatos (MinIO local, R2 no desenho de deploy).
Ambiente é validado em `packages/api/src/env.ts`; logs usam Pino.

`packages/api/scripts/migrate.mjs` lista SQLs explicitamente, mantém app_schema_migrations
e usa conexão própria com máximo 1. O script start da API executa esse runner antes do servidor:
iniciar produção pode mudar dados/schema. Migrações exigem SQL revisado, destino autorizado
e plano de recuperação. Não executá-las durante setup, build ou revisão somente leitura.

`src/server.ts` registra plugins/rotas em buildApp(), o que já pode abrir recursos externos;
não é fábrica de teste sem efeitos. main() inicia workers no mesmo processo, recupera backlogs
e agenda tarefas. Um boot pode reprocessar entregas, modificar filas/registros e contatar
provedores. Não usar banco, fila ou credenciais reais em validação local.

## Limites e manutenção

Auth, isolamento de usuários/ofertas, webhooks, atribuição, dedup/replay, valores financeiros,
credenciais e destinos de URLs exigem tracing dos controles nos callers. Comentário antigo
de MVP não prova um controle atual: verificar plugin de auth, rotas e testes. Não alterar
essas regras como efeito colateral do setup. Documentos de segurança existentes são históricos;
novos relatórios detalhados seguem o procedimento privado em [quality.md](quality.md).

Preservar stack/fronteiras evita migração incidental num produto em operação. Skill não exige
troca de ORM, hosting, bundler ou UI. Railway/R2 são referências operacionais, não autorização
para publicar. Atualize o mapa quando fronteiras, persistência ou boot mudarem. Registre em
[setup.md](setup.md) instalação, descoberta e execução real separadamente.
