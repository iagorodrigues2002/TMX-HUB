# TMX HUB: instruções compartilhadas

Responda em português brasileiro. Leia código/instruções relevantes antes de editar.
Faça a menor mudança completa; preserve alterações locais, validação, segurança,
tratamento de erros e acessibilidade. Não reformate arquivos fora do pedido.

## Contexto canônico

- [PRODUCT.md](PRODUCT.md): usuários, escopo e voz do produto.
- [DESIGN.md](DESIGN.md): design canônico, equivalente a `docs/design.md`; não duplicar.
- [Arquitetura](docs/architecture.md), [onboarding](docs/onboarding.md),
  [qualidade](docs/quality.md) e [setup/evidências](docs/setup.md).
- Planos em `docs/plans/` são registros datados, não prova de implementação. Ao retomar,
  verifique arquivos, Git, processos e resultados reais; invalide contexto obsoleto.

## Stack e comandos

Node >=22, pnpm 9 (pin em `package.json`), TypeScript estrito/ESM. Workspaces históricos:
`@page-cloner/shared`, `core`, `api`, `web`. Instale dependências somente na raiz.
Os comandos adicionais ESLint exigem Node 22.13+ ou 24; ver docs/quality.md.

| Finalidade | Comando na raiz |
|---|---|
| Instalação reproduzível | `pnpm install --frozen-lockfile` |
| Lint sem correção | `pnpm lint` |
| Tipos | `pnpm typecheck` |
| Testes | `pnpm test` |
| Build | `pnpm build` |
| Web local | `pnpm --filter @page-cloner/web dev` (porta 3100) |
| API local | `pnpm --filter @page-cloner/api dev` (porta padrão 4000) |

Comando documentado não é autorização de execução. Leia o isolamento em `docs/quality.md`.
`pnpm dev` inicia todos os pacotes em paralelo, inclusive API. **O boot da API inicia workers
e recupera filas; `api start` também executa migrações. Nunca validar setup com recursos reais.**

## Convenções e limites

- Biome: 2 espaços, aspas simples, ponto e vírgula, vírgula final, largura 100;
  `import type` para tipos. `pnpm format` escreve arquivos; não rodar indiscriminadamente.
- Contratos Zod em `packages/shared`; dependências internas `workspace:*`.
  `core` não depende de Fastify/Next; tarefas longas usam BullMQ, fora dos handlers.
- Preservar postgres.js/PostgreSQL, Redis e S3; não introduzir ORM/framework por template.
- Não fazer commit/push, deploy, migrações, envios de negócio, alterações remotas, uploads
  de código/segredos ou ações com custo sem autorização específica. Nunca autopublicar.
- Não instalar hooks Git, exigir branch/worktree ou bloquear `main` por padrão.
- Ferramenta/skill disponível não amplia autorização. Não inventar integrações, métricas
  ou checks aprovados; registrar incompatibilidades e verificações não executadas.

## Colaboração e continuidade

Delegue quando autorizado pelo usuário ou por workflow aplicável e houver benefício concreto;
não há roster obrigatório. Sem política explícita de seleção, preserve modelo/provedor/autenticação
da sessão. Tarefas paralelas exigem arquivos disjuntos e recursos isolados; um escritor por arquivo.
Revisão independente é somente leitura quando apropriada. Antes de assumir trabalho interrompido,
confirme que o escritor parou e inspecione o diff. Não repita tentativa sem evidência nova.
Respeite pausa/cancelamento. Bloqueios afetam somente tarefas dependentes; registre estado
verificado e próxima ação no plano existente. Relate checks reais e riscos, sem prometer retomada automática.
