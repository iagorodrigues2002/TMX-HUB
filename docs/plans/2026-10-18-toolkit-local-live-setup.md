# Setup local do toolkit e reconciliação com produção

Status: execução local autorizada e aplicada em 18/10/2026. Resultado, checks reais,
incompatibilidades e itens não executados estão em [../setup.md](../setup.md).
Checkboxes abaixo preservam o checklist original; não substituem esse relatório.

> Execução: coordenador implementa; tarefas independentes e revisão podem usar subagentes.

## Objetivo e desenho

Preparar o TMX existente para desenvolvimento assistido por IA, preservando produto,
stack, dados e alterações locais. Reutilizar ferramentas globais, organizar fontes de
contexto e comandos verificáveis, cobrir todo o catálogo aplicável e reconciliar o
checkout original com o código publicado, sem publicar nada.

Referência: bloco Prompt de `docs/prompts/12-existing-project-setup.md` do toolkit
`soumatheusgomes/vibe-coding-toolkit`, revisão
`de66fe371a49f5a4d3b521759e5c401f390b6424`. Usar somente essa revisão nesta execução.

Stack observada: pnpm workspaces, TypeScript ESM, Next.js 15/React 19, Fastify 5,
PostgreSQL, Redis/BullMQ, storage S3, Biome e Vitest. Não introduzir ORM/framework.

## Limites

- Não fazer push, deploy, migrações, compras, automações ou envios externos de negócio.
- Consulta aos metadados de deploy do Railway é somente leitura, autorizada no chat.
- Não iniciar a API com configuração pessoal: há migrações no start e workers no boot.
- Não mudar autenticação, permissões, tracking, webhooks, pixels ou regras financeiras.
- Não apagar nem reformatar trabalho preexistente; não atualizar globalmente ferramentas.
- Não enviar código, dados pessoais, grafos ou segredos para serviços externos.
- Não instalar hooks Git, exigir worktree/branch ou bloquear main.
- Mudanças fora do projeto, custos, migrações incompatíveis e conflitos sem resolução
  mecânica segura exigem decisão específica. Contas ausentes bloqueiam só seus itens.

## Evidência inicial

- Checkout original: HEAD `40b6cf300256614809783835966ad5697b28a9da`, branch main.
- Existem 32 arquivos rastreados modificados, além de arquivos novos.
- Origin/main observado: `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e`, 11 commits à frente.
- Web ativo no Railway: deploy `6b1b682d-87d5-4a4c-a6d1-7581f7afda00`, SUCCESS,
  commit `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e`.
- API ativa: deploy `a6f87803-da10-4b5a-be3f-5f37715b386e`, SUCCESS,
  commit `efed84b1d3b177ba7b9d8e7b94cb0256ad39bfd8`.
- Diff entre esses commits em packages/api, packages/core e packages/shared: vazio.
  Hash diferente do serviço não significa mudança de backend ausente.
- Esses metadados não validam configuração, banco, migrações aplicadas ou comportamento
  do processo em execução. Nenhum banco de produção foi consultado.
- Preservação privada externa ao repositório: patches de índice/working tree e arquivo
  worktree.tar dos arquivos rastreados/não ignorados. Segredos ignorados não são movidos.
  Localização e checksum foram registrados no chat; não versionar caminhos pessoais.
- README cobre principalmente o clonador; PRODUCT.md e DESIGN.md são fontes existentes
  que precisam ser preservadas, não substituídas por templates genéricos.

## Matriz de cobertura planejada

Cada linha terá origem, versão/escopo, evidência, risco e próxima ação em docs/setup.md.
“Reusar” abaixo é decisão proposta, não prova de funcionamento nesta execução.

| Componente do catálogo | Necessidade/estado observado | Ação e escopo | Dependência/risco | Critério |
|---|---|---|---|---|
| 01 Superpowers | Skills disponíveis | Reusar global | Descoberta por cliente | Aplicar planejamento/verificação |
| 02 Subagentes | Ferramentas disponíveis | Delegação proporcional | Recursos/arquivos disjuntos | Revisão independente com evidência |
| 03 RTK | Instrução e CLI presentes | Reusar, sem wrappers extras | Saída condensada | Conferir comando e fallback |
| 04 Ponytail | Modo full ativo | Reusar | Evitar escopo extra | Diff mínimo completo |
| 05 Caveman | Skill disponível | Comunicação curta pt-BR | Não comprimir código/docs | Clareza e fatos preservados |
| 06 Qualidade | Biome/Vitest/TypeScript existentes | Preservar; adaptar gate local | Dívida anterior/typed lint | Baseline, self-check, sem supressões amplas |
| 07 Graphify | CLI/skill presentes; grafo ausente | Exclusions e modo determinístico local | Fonte sensível/cobertura parcial | Consulta estrutural e freshness |
| 08 Obsidian | Sem destino/necessidade indicada | Inaplicável no setup | Não exportar dados | Registrar justificativa |
| 09 Memória | Documentos e contexto nativo | Índice curto e referências | Fatos obsoletos | Recuperação e invalidação documentadas |
| 10 Hooks | RTK já integrado | Não adicionar interceptores | Duplicação/execução automática | Inspeção de configuração |
| 11 agent-browser | CLI não encontrada | Reusar browser disponível se suficiente | Nova ferramenta global não autorizada | Fluxo local com dados fictícios |
| 12 Context7 | Ferramentas disponíveis | Reusar integração ativa | Possível duplicação global | Resolver e consultar documentação pública |
| 13 Artefatos/criação de skills | Skills globais disponíveis | Reusar sob demanda | Sem necessidade de artefato agora | Registrar descoberta/limites |
| 14 DevTools MCP | Capacidade específica a conferir | Reusar equivalente ou registrar pré-requisito | Console/rede/runtime distintos | Não confundir screenshot com diagnóstico |
| 15 Codex | Cliente e AGENTS presentes | AGENTS curto; CLAUDE importa AGENTS | Instrução antiga manda publicar | Contratos do setup prevalecem |
| 16 Vercel/find-skills | Next/React presentes | Instalação local portátil do conjunto web aplicável | Licença, fontes e nomes atuais | Frontmatter, lock e descoberta |
| 17 next-dev-loop | Next 15 com Webpack | Incompatível com piso documentado 16.3/Turbopack | Sem upgrade para satisfazer skill | Registrar incompatibilidade |
| 17 next-bundle-optimizer | Analyzer nativo a conferir | Preflight; bloquear execução se não suportado | Não trocar bundler | Help/analyzer real, sem métricas inventadas |
| 18 PostgreSQL | postgres.js e SQL existentes | Skill local aplicável | Não adotar Supabase/ORM | Revisão SQL local, sem banco remoto |
| 19 gh-fix-ci | Sem workflow GitHub Actions observado | Inaplicável ao checkout atual | Não criar CI remoto por checklist | Reavaliar se workflow/PR existir |
| 20 differential-review | Código sensível e diferenças locais | Skill e procedimento reutilizável | Relatório privado; não pentest | Escopo exato e tracing de controles |
| 21 shadcn | components.json e componentes existentes | Skill local, preservar customizações | Sem regenerar UI | Configuração, aliases e componentes |
| 22 Sentry MCP | Sem organização/projeto selecionado | Pendente de destino/autorização | Conta/OAuth, não SDK | Retomar com escopo explícito |
| Extras/aia-harness/plugins | Vários equivalentes já disponíveis | Não duplicar harness | Dependências globais | Justificar necessidade antes de instalar |
| React Native/Expo | Aplicação web | Inaplicável | Mobile web não é React Native | Registrar plataforma |
| Operações Vercel | Hosting atual Railway | Não executar; avaliar instruções opcionais do conjunto web | Nenhuma autorização de publicação | Preservar hosting e credenciais |

## Entregas e verificações

### 1. Baseline e preservação

- [x] Inventariar Git, scripts, stack e principais documentos sem iniciar serviços.
- [x] Obter uma revisão única do toolkit fora do projeto.
- [x] Consultar metadados de deploy e preservar snapshot privado do trabalho local.
- [ ] Concluir leitura dos guias exigidos e inventário de integrações, sem segredos.
- [ ] Executar lint/types/tests/build em cópia ou contêiner descartável, com ambiente
  mínimo, rede externa bloqueada e saídas isoladas. Registrar falhas anteriores.
- [ ] Usar scripts existentes: pnpm lint, pnpm typecheck, pnpm test, pnpm build;
  verificar antes os efeitos e os recursos necessários de cada pacote.

### 2. Contexto e ferramentas compatíveis

Arquivos: AGENTS.md, CLAUDE.md, README.md, PRODUCT.md, DESIGN.md; criar somente as
lacunas docs/architecture.md, docs/onboarding.md, docs/quality.md e docs/setup.md.
DESIGN.md permanece fonte canônica equivalente a docs/design.md, com mapeamento.

- [ ] Backup antes de editar configurações/documentos existentes.
- [ ] Consolidar instruções e links; substituir fatos desatualizados por observações.
- [ ] Selecionar skills locais por nomes/fontmatter/fontes atuais, manter licenças e
  lock de skills; não duplicar globais equivalentes.
- [ ] Criar exclusões Graphify para segredos, dependências, temporários e gerados;
  gerar apenas o grafo estrutural necessário por modo oficialmente suportado.
- [ ] Registrar descoberta separada de instalação; não simular reinício do cliente.
- [ ] Validar links, sintaxe de configurações, consulta Context7 e consulta do grafo.

### 3. Gate local e avaliação do harness

Arquivos: scripts de verificação estritamente necessários, package.json/configuração
de qualidade somente se houver lacuna provada; preservar pnpm-lock.yaml e Biome.

- [ ] Medir violações por regra antes de endurecer; avaliar typed lint sem substituir
  Biome ou instalar dependências redundantes sem evidência.
- [ ] Adaptar módulos de qualidade/self-check da mesma revisão do toolkit quando
  compatíveis. Regras Drizzle não se aplicam ao driver postgres.js existente.
- [ ] Canonicalizar comandos sem publicar ou migrar; novos scripts não triviais têm
  teste/self-check que reproduza erro e sucesso.
- [ ] Avaliar casos descartáveis de autorização, retomada desatualizada e revisão
  somente leitura; registrar cliente/modelo, ação observada e limites.
- [ ] Documentar procedimento de revisão de segurança com fonte versionada; relatórios
  detalhados ficam privados, fora do repositório.

### 4. Reconciliação local/live e entrega

- [ ] Reconsultar as versões ativas depois do setup; não assumir que continuam iguais.
- [ ] Comparar bytes dos arquivos físicos locais, inclusive fontes não rastreadas,
  com os arquivos nos commits ativos. git diff sozinho não cobre esse caso.
- [ ] Separar: já publicado, parcialmente publicado, apenas local, fonte nova no
  remoto, gerado/temporário e mudança do próprio setup.
- [ ] Atualizar a base main por fast-forward local após preservação verificável;
  reaplicar somente deltas locais ainda pendentes. Nada de reset hard, clean ou push.
- [ ] Ensaiar a mesclagem com Git em recurso descartável antes de tocar o checkout.
  Conflitos sem resolução inequívoca preservam a base e pedem decisão, sem perda.
- [ ] Não prometer sincronização automática futura: documentar fetch + comparação
  de versões antes do trabalho; não criar cron, hook ou deploy automático.
- [ ] Revisão independente somente leitura do diff próprio e da reconciliação;
  repetir verificações afetadas e atualizar a matriz com status real.

## Riscos que a revisão precisa cobrir

1. Arquivo já publicado, mas não rastreado na base antiga, não pode ser tratado como perdido.
2. Mesclagem não pode reintroduzir datas, escopo financeiro ou layout antigos.
3. Backups e logs não podem expor credenciais nem dados pessoais no Git.
4. Comando de teste/start não pode alcançar serviços reais nem acionar workers de envio.
5. Presença de skill/configuração não prova descoberta em novo cliente ou integração real.

## Aceitação

Documentos refletem o checkout entregue; catálogo completo tem decisão/evidência;
verificações disponíveis foram executadas com falhas antigas separadas; trabalho local
preservado; base publicada identificada e reconciliação comprovada ou bloqueio específico
registrado. Nenhuma alteração remota, migração, evento ou envio de negócio.
