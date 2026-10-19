# Qualidade e verificação segura

Este documento define o procedimento. Baseline, ambiente, resultados e limitações reais ficam
em [setup.md](setup.md). Comandos existentes não implicam aprovação de runtime.

## Comandos

| Comando na raiz | O que verifica e limites |
|---|---|
| `pnpm lint` | biome check .: lint/format/imports, sem escrita; não analisa tipos |
| `pnpm lint:quality` | Regras locais de tamanho/console (avisos) e import de postgres.js no web (erro) |
| `pnpm lint:typed` | Gate anterior + promises não aguardadas/mal usadas; avisos medidos, não aprovação sem dívida |
| `pnpm test:quality-rules` | Self-check independente dos três módulos do toolkit com RuleTester |
| `pnpm check` | Combina os gates e para na primeira falha; só executar em ambiente isolado/descartável |
| `pnpm typecheck` | Compila core (exporta dist) e roda TypeScript recursivo; não executa aplicação |
| `pnpm test` | Compila core (exporta dist) antes dos testes recursivos, incluindo web; não prova integração live |
| `pnpm build` | Compilação recursiva e build Next; escreve artefatos |
| `pnpm format` | Formata/escreve arquivos; não é gate somente leitura |
| `bash scripts/test-media-process.sh` | Chromium/FFmpeg real sem capabilities extras; valida proxy e processamento, não isolamento por namespaces; build baixa dependências públicas |

Depois de inspecionar scripts e estabelecer isolamento, executar lint, tipos, testes e build
em sequência, classificando falhas anteriores e novas. Não mascarar baseline com supressões
amplas. O lint canônico é Biome na raiz, não next lint do web. Não há promessa de typed lint:
regras assíncronas sensíveis a tipos precisam de compatibilidade/runner e custo medidos antes
da adoção. O setup acrescentou uma medição separada dessas duas regras, sem substituir
Biome; resultados em setup.md. Não importar regras Drizzle para postgres.js.

ESLint 10.13.0 exige Node `^20.19.0 || ^22.13.0 || >=24`; para os novos comandos,
use Node 22.13+ ou 24. O requisito histórico do runtime da aplicação não foi alterado.
Os módulos vendorizados seguem a licença em eslint-rules/LICENSE.

## Isolamento e testes

Para validar setup, usar cópia/container descartável, ambiente mínimo sintético, sem .env real,
credenciais herdadas ou recursos compartilhados. Bloquear rede externa dos processos de
verificação e isolar saídas/cache; se isso não for possível, inspecionar estaticamente e declarar
a lacuna. API start/dev não são testes: boot tem workers/recuperação e start aplica migrações.
Build não autoriza migração/publicação.

Vitest aparece em packages/api/test, packages/core/test e packages/shared/test. Há testes de
schemas, normalização, auth/ownership, SSRF, webhooks, tracking e finanças. O core contém testes
que podem exigir browser/rede; algumas integrações precisam de serviços. Leia arquivo/imports
antes de selecionar testes, sem chamar toda a suíte de unitária/sem credenciais. Exemplo de
filtro existente, após preflight: `pnpm --filter @page-cloner/api test -- test/offer-access.test.ts`.

O script recursivo inclui os testes node:test do web, com `tsx --tsconfig tsconfig.test.json`
para usar o JSX automático do Next. A suíte isolada `security-remediation.node.ts` continua
explícita: exige Redis descartável e os guardrails da fixture antes de reproduzir. As suítes
PostgreSQL também exigem URLs de bancos descartáveis; sem elas, há testes ignorados.
`pnpm check` não promete essa cobertura adicional nem integração com serviços reais.

Cobrir permitido/negado, tenant incorreto, entrada inválida, falha externa, dedup/replay e
regressões da mudança. Usar fixtures sintéticas e recursos descartáveis; mock não equivale
a produção. Não inventar cobertura/E2E. Auditoria de dependências é separada: serviços de
audit podem transmitir manifests e exigem autorização para divulgação. Lint/build não certificam segurança.

## Revisão de segurança reutilizável

Fonte adotada: soumatheusgomes/vibe-coding-toolkit, commit
`de66fe371a49f5a4d3b521759e5c401f390b6424`,
[prompt 13](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/prompts/13-security-review.md),
[guia 20](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/tools/20-security-review.md)
e templates/security-review.md.template da mesma revisão. Não usar main móvel como evidência.

Invocação para colar na conversa do agente, não no terminal:

```text
Leia o bloco Prompt de docs/prompts/13-security-review.md na cópia local verificada do
toolkit, commit de66fe371a49f5a4d3b521759e5c401f390b6424. Execute revisão de baseline
do checkout atual do TMX HUB, incluindo separadamente staged, unstaged e fontes untracked
relevantes. Preserve cliente/modelo/autenticação e todo o repositório. Somente leitura,
sem instalar, corrigir, publicar, contatar serviços de negócio ou carregar segredos.
Salve relatório redigido em diretório privado fora do repo, nome único e permissões restritas.
Sem isolamento para testes, faça tracing estático e registre a lacuna. Ausência de achados
não é garantia de segurança.
```

Para diff, fornecer base/head imutáveis, semântica endpoint ou merge-base e inclusão/exclusão
de dirty. Com dirty incluído, head deve ser o HEAD atual; separar committed/staged/unstaged/
untracked e seguir callers/controles. Não escolher base silenciosamente. Usar differential-review
quando disponível/compatível, sem presumir agentes/comandos exclusivos de outro cliente.

Tracing liga entrada controlada ao efeito sensível: validação, auth, ownership, SQL, destino
de URL, assinatura/replay conforme o caminho real. Registrar precondições, impacto, severidade,
confiança, contraprovas, reprodução segura, exclusões e próxima validação. Hipóteses/hardening
ficam separados de vulnerabilidades confirmadas.

Convenção privada: diretório externo security-reviews, relatório único datado, diretório 0700/
arquivo 0600 quando suportado. Não versionar caminhos pessoais, traces, payloads ou dados sensíveis.
Docs públicas recebem somente escopo/status sanitizados. Conferir redaction e ausência de
mudanças no repo/índice antes de entregar. Corrigir achados exige pedido próprio. Sem destino
seguro para gravar, retornar resumo redigido e informar que não foi salvo.

Revisão de implementação é proporcional ao risco: diff real, callers, contratos e testes.
Usar revisão independente para mudanças não triviais quando disponível/autorizada; registrar
indisponibilidade. Encerrar com findings resolvidos/dispostos, checks afetados e riscos explícitos.
Rodadas extras exigem evidência nova; respeitar contagem pedida sem reiniciá-la após fixes.

## Recuperação do harness

Mudanças materiais de instruções/skills/orquestração usam casos descartáveis do
[guia 07 versionado](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/07-harness-evaluation.md).
Fixture/avaliador ficam fora do TMX HUB; avaliador fora dos arquivos graváveis pelo agente.
Não copiar o bug intencional para a aplicação.

Casos mínimos: autorização entre tenants (baseline falha, final passa), handoff obsoleto dizendo
que testes já passaram (reverificar estado real) e revisão somente leitura (fixture intacta,
relatório privado com caminho explorável). Para coordenação/retomada, avaliar também setup
reaplicado sem duplicações, conflito escritor/porta/banco, bloqueio externo parcial e pausa/
retomada verificada. O avaliador da revisão fixada tem sete checks; coordenador o executa
antes/depois e inspeciona diff e notas preservadas.

Registrar revisão do toolkit, data, cliente/versão, modelo/esforço observáveis, permissões,
hash de entrada/avaliador, comandos, arquivos, tempo e comportamento observado. Separar
avaliador, relato do agente e observação independente. Sem execução/observação, marcar
**não executado**, não aprovado. Subagente novo não prova reinício do cliente; smoke test não
mede confiabilidade estatística. Resultados em setup.md, sem traces privados.
