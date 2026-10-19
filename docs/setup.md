# Setup local e comparação com produção — 18/10/2026

**Atualização posterior:** as falhas abaixo foram investigadas na tarefa seguinte.
O estado de testes, correções e limites mais recente está em
[validação local de testes e pendências](plans/2026-10-18-test-failures-validation.md)
e no acompanhamento de [lint e isolamento de processos](plans/2026-10-18-lint-process-isolation.md).
Este documento mantém o diagnóstico original do setup; suas contagens de falhas
não representam o resultado posterior. Nenhuma dessas correções foi publicada.

## Resultado e limites

Setup aplicado **somente localmente** no checkout original TMX-HUB, conforme
[plano aprovado](plans/2026-10-18-toolkit-local-live-setup.md). Sem commit, push,
deploy, migração, alteração de configuração remota ou envio de negócio.
Fonte do toolkit: `soumatheusgomes/vibe-coding-toolkit`, revisão única
`de66fe371a49f5a4d3b521759e5c401f390b6424`.

HEAD local avançou de `40b6cf300256614809783835966ad5697b28a9da` para
`0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e` por fast-forward de 11 commits.
O trabalho pendente **não foi descartado nem publicado**. Preservados backup privado
externo e stash `0d899930a40dee4641606d21190864a6d9c11447`. Não aplicar/pop esse stash
inteiro: reintroduziria versões antigas de arquivos de reembolsos e conflitos já resolvidos.
Localização/checksum do backup estão no chat, não no Git. `.env` ignorados não foram movidos.

## Código publicado e pendências

Metadados Railway reconsultados em 18/10/2026, somente leitura:

| Serviço | Deploy ativo SUCCESS | Commit |
|---|---|---|
| Web | `6b1b682d-87d5-4a4c-a6d1-7581f7afda00` | `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e` |
| API | `a6f87803-da10-4b5a-be3f-5f37715b386e` | `efed84b1d3b177ba7b9d8e7b94cb0256ad39bfd8` |

API teve tentativa SKIPPED no commit do web. Os trees de `packages/api`, `core` e
`shared` são idênticos entre os dois commits: não é backend desatualizado por esse hash.
Metadados não comprovam migrações executadas, dados ou comportamento do processo live.

| Grupo | Estado após reconciliação |
|---|---|
| Reembolsos: datas, evidências, dashboard, migration 101 e testes correlatos | Fontes já presentes nos commits publicados; execução da migration não consultada |
| Redesign/mobile de reembolsos | Mantida versão mais nova publicada; três conflitos eram cópias antigas exatas de `efed84b` |
| Cadastro/convite atômico, unicidade de email, rate limit | **Apenas local**, alteração preexistente preservada |
| Ownership de configuração global versus oferta e observação de upsell | **Apenas local**, alteração preexistente preservada |
| Validação de destinos/DNS/redirects, limites/cancelamento e limpeza de downloads | **Apenas local**, alteração preexistente preservada |
| Proteção contra mutações tardias de sessão no web | **Apenas local**, alteração preexistente preservada |
| Documentação, nove skills, lint adicional, lock e exclusões Graphify deste setup | **Apenas local**, novos nesta execução |
| `output/`, `tmp/`, `.graphite/` preexistentes | Preservados; não são código publicado nem entregas novas do setup |

Comparação física final confirmou que **25 fontes/testes rastreados e quatro novos**
do pacote de segurança são byte a byte iguais ao snapshot anterior à sincronização.
Arquivos novos: `api/src/lib/settle-downloads.ts`,
`api/src/services/upsell-observation-policy.ts`, `api/test/security-remediation.node.ts`,
`core/src/fetch/public-network.ts`, sob `packages/`. `git diff` sem untracked não basta.
Não houve correção adicional de regras financeiras, tracking ou webhooks neste setup.

## Contexto e ferramentas

PRODUCT.md/DESIGN.md preservados; AGENTS/CLAUDE/README atualizados e arquitetura,
onboarding e qualidade documentados. CLAUDE importa AGENTS. Sem hooks novos,
sem roster fixo, sem exigir worktree/branch ou substituir o harness existente.

| Catálogo | Decisão, evidência e próxima ação |
|---|---|
| 01 Superpowers | Reutilizado global; planejamento, execução e verificação aplicados |
| 02 Subagentes | Documentação disjunta, análise de conflitos e smoke tests independentes; revisão do setup separada |
| 03 RTK | Reutilizado conforme instrução global; sem wrapper extra |
| 04 Ponytail | Modo full aplicado; sem refatoração funcional adicional |
| 05 Caveman | Disponível global; comunicação pt-BR sem reescrever código/documentos em dialeto |
| 06 Qualidade | Biome/Vitest/TypeScript preservados; ESLint 10.13.0 + typescript-eslint 8.71.2 apenas dev; módulos/self-check do toolkit fixado |
| 07 Graphify | 0.9.92 reutilizado; `extract . --code-only --no-cluster`, sem LLM/upload; consulta `publicFetch --context call` retornou callers reais |
| 08 Obsidian | Inaplicável: nenhum vault/destino solicitado; nenhuma exportação |
| 09 Memória | Documentos canônicos e instrução de invalidar handoffs obsoletos; não promete memória global sincronizada |
| 10 Hooks | Nenhum instalado/alterado; integração global existente preservada |
| 11 agent-browser | Ausente; CUA existente não duplicado. Fluxo visual interativo local não executado |
| 12 Context7 | Resolver/consulta de typescript-eslint realizados; projectService e flat config confirmados. Não adicionado outro MCP |
| 13 Artefatos/skills | Recursos globais reutilizáveis; nenhum artefato de produto necessário |
| 14 DevTools | Sem endpoint DevTools específico validado; CUA/screenshot não equivalem a inspeção de rede/console |
| 15 Codex | AGENTS curto e CLAUDE por import, sem comandos de autopublicação |
| 16 Vercel/find-skills | Cinco skills web Vercel e find-skills instaladas localmente para Codex/Claude Code |
| 17 next-dev-loop | Incompatível com piso 16.3/Turbopack; TMX permanece Next 15.5.15/Webpack |
| 17 next-bundle-optimizer | CLI Next 15 não possui analyzer nativo do guia; não houve troca de bundler ou métricas inventadas |
| 18 PostgreSQL | supabase-postgres-best-practices local; orientação SQL, sem adoção de Supabase/ORM ou consulta ao banco |
| 19 gh-fix-ci | Inaplicável: sem GitHub Actions neste checkout; não criado CI remoto |
| 20 differential-review | Instalada localmente; procedimento privado com fonte fixada em quality.md, sem pentest live |
| 21 shadcn | Skill local; components.json/customizações mantidos, sem regeneração de UI |
| 22 Sentry | Pendente: falta organização/projeto/OAuth; não instalado SDK nem conector novo |
| Extras/React Native/Vercel ops | Não duplicados; app é web e hospedagem Railway, sem operação Vercel autorizada |

As nove entradas de `skills-lock.json` têm origem/hash; frontmatters e cópias entre
`.agents/skills` e `.claude/skills` conferidos. `skills list --agent codex` mostrou nove
skills para ambos os clientes. Isso não prova carregamento em cliente reiniciado.
Não foi executada atualização/reinstalação automática para uma revisão móvel.

Adaptação local de segurança: removida da skill shadcn, em ambas as cópias, a execução
dinâmica `npx shadcn@latest info --json` e a permissão automática de Bash. Contexto vem
de components.json; CLI exige preflight e versão verificada. O lock mantém o hash da
**origem instalada**, anterior a essa adaptação documentada, não um checksum da cópia
adaptada. Reinstalar upstream pode apagar a proteção: revisar/reaplicar antes de carregar.
As outras skills não foram modificadas; commits exatos das nove origens não foram
registrados pelo instalador, portanto fonte/hash não garantem clone reproduzível por ref.

Graphify analisou 620 arquivos: 3347 nós/9438 arestas. Cobertura parcial: 96 SQL sem
parser SQL instalado, 68 arquivos sem símbolos e 12 tipos não suportados; não instalar
parser global só para esconder lacuna. Grafo/cache ignorados pelo Git; padrões de
segredos, dependências e temporários excluídos e documentos omitidos por code-only.
O grafo ainda deriva de código privado: não exportar/upload. Regerar após fonte mudar.

## Verificações reais

Executadas em contêiner descartável Node **24.22.0**, sem `.env`/credenciais reais,
rede externa bloqueada, fontes copiadas, dependências somente leitura, saídas tmpfs,
usuário sem privilégios, memória/CPU/PIDs limitados. Redis de teste separado, sem
persistência/porta exposta e sem rede externa, apenas para a suíte de segurança.
Binários Linux opcionais das mesmas versões do lock foram preparados só na fixture;
dependências macOS não bastavam. A primeira criação precisou baixar a imagem oficial
node:24-alpine; nenhum serviço de produção foi iniciado.

Foram executados os binários dos scripts existentes por pacote, não `pnpm -r` literalmente,
para controlar ordem, cache, timeout e isolamento. Core foi compilado antes dos tipos da API,
que dependem de seu dist. Falhas de runner anteriores à preparação não contam como bugs.

| Check no término do setup, antes das correções posteriores | Resultado observado |
|---|---|
| Tipos shared/core/API/web | Passaram; core também com tsconfig.test.json canônico |
| Build core, API e Next | Passaram; web compilou e gerou 29 páginas. Shared não tem script build |
| Shared Vitest | 12/12 passaram |
| Core Vitest | 21/21 passaram |
| API Vitest, fontes live como baseline | 429 passaram, 5 falharam, 27 skipped; 3 arquivos com falhas |
| API Vitest, pendências preservadas | 425 passaram, 9 falharam, 27 skipped; 4 arquivos com falhas |
| Segurança node:test, fixture Redis + chave sintética | 12/12 passaram; primeira tentativa sem chave sintética retornou 503 e foi corrigido o ambiente, não o código |
| Web node:test/tsx | 46 passaram, 1 falhou ao renderizar footer mobile; posteriormente confirmado `React is not defined` no runner JSX |
| Biome, fontes live | 357 erros/16 avisos em packages; dívida anterior |
| Biome, pendências preservadas | 368 erros/16 avisos em packages; sem correção indiscriminada |
| Qualidade adicional | Exit 0; 52 avisos tamanho, 1 console e 4 diretivas ESLint sem uso; não significa zero dívida |
| Typed lint adicional | Exit 0; os avisos anteriores + 23 floating promises/45 misused promises |
| RuleTester vendorizado | Três regras passaram com casos válidos/inválidos |
| Config de fronteira UI | Import sintético de postgres no web negado com exit 1; código permitido exit 0 |
| Preservação | Comparação de bytes do stash contra 25 + 4 fontes pendentes passou |

As cinco falhas já no baseline: três expectativas de OAuth Google, uma de origem
SyzePay e uma de HMAC VendePay. As quatro adicionais são mocks de upsell compatibility
que não interceptam o novo transporte público/DNS na rede isolada. Precisam revisão de
fixtures/contratos antes de publicar a pendência; não chamar a suíte inteira de verde.
O teste de footer também requer revisão; esta tarefa não altera esse layout.

Medição via API ESLint no mesmo runner isolado (2 CPUs, teto 3 GiB), sem somar os dois:
quality: 7,59 s e maxRSS 460 MiB; typed: 24,80 s e maxRSS 1469 MiB. O custo justifica
manter typed explícito, fora do caminho rápido e sem hook. São duas observações locais,
não benchmark estatístico nem estimativa de CI.

Biome continua obrigatório e está falhando; novos gates não o substituem. Não corrigidos
centenas de arquivos fora do pedido. Avisos de typed lint são medição inicial, sem disable
em massa. ESLint 10 exige Node 22.13+ (ou 24); engines de produção não alterado.
Exclusões novas do Biome limitam-se às skills e regras/self-check vendorizados, não às
fontes de aplicação. Licença MIT do toolkit preservada em eslint-rules/LICENSE.

`pnpm check` combina os scripts existentes e os novos gates, parando na primeira falha;
o resultado global continua bloqueado pelo Biome. Os subcomandos foram exercitados
isoladamente; o agregador não foi executado literalmente. O web não tinha script test
e a suíte de segurança exige fixture, portanto ambos são checks adicionais explícitos.
Audit de dependências contra serviço remoto não executado: a consulta pode transmitir
o manifest privado. Não confundir versões instaladas com ausência de vulnerabilidades;
requer autorizar esse envio ou fornecer base de vulnerabilidades offline.

Burndown futuro, fora deste setup: revisar os 23 floating promises e 45 callbacks primeiro,
com testes de falha/cancelamento; depois console e arquivos >350 linhas por responsabilidade,
sem alterar contratos. Promover cada regra warn para error apenas com contagem zero
verificada. Não aumentar o teto nem suprimir diretivas para declarar o projeto limpo.

## Avaliação do harness

Fixtures externas descartáveis da revisão fixada, sem dados TMX. Coordenador reproduziu
baseline 5/7, duas falhas; agente novo recebeu handoff falso de sucesso, inspecionou estado
e corrigiu somente access.mjs. Coordenador repetiu avaliador: **7/7**. Na revisão somente
leitura, fixture ficou idêntica ao original e relatório externo identificou leitura entre
tenants/IDs inválidos com exemplo concreto, precondições, confiança e limites.
Instruções, notas, handoff e avaliador preservados; hash do avaliador SHA-256
`14220a750afbcf228fc397d5d3d32f10631c0f2e0a533c0ba8fa79b553f62e1c`.
Cliente Codex desktop, contexto novo de subagente com modelo/esforço herdados, sem
troca de autenticação; versão binária/model ID exatos não expostos nesta evidência.
Check final levou ~5 ms no Node (não é tempo total da tarefa). Um smoke test não mede
confiabilidade estatística. Reinício de cliente, dupla reaplicação integral, conflito
real de workers, pausa/retomada e integração externa bloqueada não foram avaliados como
casos comportamentais separados. Ausência de Sentry foi registrada, não simulada.

## Próxima publicação e manutenção

Revisão independente somente leitura conferiu configs, módulos, RuleTester, cópias de
skills, links, lock e trees publicados. Identificou a execução dinâmica da skill shadcn;
ela foi removida nas duas cópias e conferida estaticamente. Não é uma auditoria da
aplicação nem certificação de produção.
O revisor confirmou a resolução desse achado em nova leitura dos trechos afetados.
Contêineres e volume de validação criados nesta execução foram removidos ao encerrar;
backup privado, stash e arquivos de trabalho do usuário foram mantidos.

Antes de publicar pendências: resolver/explicar testes acima, revisar controles de
rede de Chromium/FFmpeg (hardening local não é isolamento completo), depois revisão
de segurança privada. Não atestar que toda vulnerabilidade foi eliminada.

Para manter atualizado futuramente: preservar dirty e arquivos novos, `git fetch origin`,
reconsultar commits ativos por serviço, comparar trees/código físico e só então ensaiar
integração/fast-forward local. Sem cron/hook/push automático. Configuração e banco live
continuam fora da evidência desta tarefa. Ver onboarding/quality para comandos seguros.
