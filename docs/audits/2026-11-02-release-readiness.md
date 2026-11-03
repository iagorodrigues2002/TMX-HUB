# Validação pré-publicação — 02/11/2026

## Resultado: não liberar o pacote completo ainda

Base local conferida contra os deploys ativos web/API: `414e2b5`.
Nenhum push, deploy, alteração de configuração remota ou envio comercial foi realizado.

## Verificações executadas

- Biome: 1043 arquivos, sem erros.
- Typecheck: shared, core, API e web aprovados.
- API: 637 testes aprovados em 112 arquivos, incluindo PostgreSQL descartável e isolamento empresarial; saída externa bloqueada pelo sandbox.
- Web: 199 testes aprovados, nenhum ignorado.
- Core: 78 testes aprovados.
- Shared: 12 testes aprovados.
- Builds de produção da API e web concluídos; 35 páginas geradas.
- Reexecução das migrações até 112 no banco descartável: exit 0.
- Smoke local: atividade, Ads Intelligence, reembolsos, SyzePay e calls aprovados; rota desconhecida retorna 404 e saída externa permanece bloqueada.
- `git diff --check`: sem erros.
- ESLint adicional: 7 avisos no quality e 22 no typed, sem erros (há regras repetidas entre os comandos; não somar como problemas únicos).
- Build avisa sobre Browserslist antigo e depreciação de `module.register()`.

## Bloqueadores e limitações

1. Atualização posterior: o Financeiro agora possui backend persistente, migração 113, criptografia, conectores Wise/LootRush e worker incremental; valores fictícios foram removidos. A suíte da API passou com 652 testes. Falta validar respostas reais das contas após cadastro autorizado das chaves. A prévia padrão segue isolada de rede externa; veja `docs/financeiro-integracoes.md` para a cobertura e os limites (histórico liquidado, sem despesas de cartão ou reconciliação retroativa integral).
2. A migração 109 cria tabelas empresariais, mas não migra os usuários/ofertas existentes. Foi adicionada a rotina explícita `scripts/transition-companies.ts` na API, com simulação, cobertura integral do inventário, validação de papéis globais, conflitos e aplicação SQL transacional/idempotente. Ainda falta montar/revisar o manifesto real e aplicar em janela autorizada; ver `docs/company-transition.md`. Contas legadas e administradores globais mantêm caminhos de compatibilidade: não afirmar isolamento real nem liberar deploy apenas pelos testes sintéticos.
3. Ativação/cutover das automações nativas de tarefas e calls não foi exercitada no ambiente remoto nesta validação. Testes locais não comprovam entrega real no Discord nem exclusividade do publicador remoto.
4. `pnpm audit --prod --json`: 60 ocorrências altas, 43 moderadas, 14 baixas, nenhuma crítica. São resultados do scanner, não prova de exploração nem contagem de falhas independentes do TMX. Exigem análise de alcance e correção/mitigação; exemplos incluem xlsx, undici, sharp e @fastify/static.

## Limite da aprovação técnica

Compilação, testes automatizados e smoke local aprovados não equivalem a uma aprovação integral de produção. Não foi feito teste de carga, auditoria exaustiva de todas as permissões reais, transação financeira real ou teste comercial em produção.
