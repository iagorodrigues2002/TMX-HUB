# Validação local: testes da API, web e alterações pendentes

> Rodada posterior: [lint e isolamento de Chromium/FFmpeg](2026-10-18-lint-process-isolation.md).
> As pendências de lint/egress descritas ao final deste registro são o estado anterior;
> consulte o acompanhamento para os resultados novos e os limites de implantação.

Data: 18/10/2026. Base Git mantida em `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e`.
Resultado: falhas reproduzidas e corrigidas, com **603 testes aprovados** na rodada
final, sem falhas nem testes ignorados nas suítes executadas. Tudo permanece local.
Não houve commit, push, deploy, alteração de ambiente remoto ou envio a provedores.

## O que foi corrigido

- **API / OAuth Google:** fixtures e expectativas estavam desatualizadas em relação
  aos dois escopos necessários, aos erros sanitizados e ao retorno interno do helper.
  O teste da rota verifica que tokens não são expostos na resposta HTTP e que o
  refresh token permanece criptografado. Não foi afrouxada a validação de permissões.
- **Webhooks:** testes VendePay agora verificam o aceite assíncrono `202`; Paysight
  continua `200`. Casos de assinatura inválida/corpo adulterado foram mantidos e
  ampliados. A fixture SyzePay recebeu uma chave de criptografia sintética, preservando
  o teste que exige falha sem chave. Nenhuma mudança nos envios financeiros reais.
- **Compatibilidade de upsell:** mocks acompanham a separação entre HTTP público
  protegido e endpoint fixo do provedor, incluindo casos negados.
- **Web:** o teste do rodapé mobile falhava por `React is not defined` no runner,
  não pelo CSS. `tsconfig.test.json` usa JSX automático, sem mudar o rodapé nem
  remover sua asserção. O web passa a integrar `pnpm test` na raiz.
- **Sessões no web:** testes exercitam os hooks reais de atualização de formulário
  e link, com React Query, em sucesso, erro, cancelamento e troca de sessão.
  As respostas de uma sessão antiga não podem repovoar o cache de outra.
- **Redirecionamentos:** a URL final protegida acompanha página e assets; CSS
  relativo resolve pela URL final. Bundles mantêm aliases para referências à URL
  original e não duplicam entradas no ZIP. O manifesto preserva `originalUrl`.
- **Observação pública de upsell:** corrigido um problema encontrado na revisão:
  destinos com mesmo caminho e queries distintas não podem escolher a primeira
  conta indiscriminadamente. A rota escolhe a URL configurada para a conta da compra
  aprovada, conforme a política de navegação existente, sem confiar na query enviada
  pelo cliente. A inserção revalida compra, visitante e conta atomicamente após o
  HTTP externo. Reembolso ou mudança de conta durante a consulta impedem o vínculo.
- **Comando raiz:** `pnpm test` compila core antes dos testes, pois a API consome
  suas exportações em `dist`. Assim não depende de um build antigo já presente.

As demais alterações locais preexistentes foram preservadas. O stash e backup da
sincronização anterior continuam disponíveis; não reaplicar o stash integralmente.
O histórico e a comparação de fontes publicadas estão em [setup.md](../setup.md).
Esta tarefa não voltou a consultar produção nem afirma uma nova verificação live.

## Evidência final

| Verificação | Resultado |
|---|---|
| `pnpm test` literal na raiz | Passou: shared 12, core 34, API 489 e web 58; total 593 |
| API Vitest | 83 arquivos, 489 testes aprovados; suítes PostgreSQL habilitadas |
| Segurança adicional `security-remediation.node.ts` | 10/10, com Redis descartável real |
| Total das duas execuções de testes acima | **603 aprovados, 0 falhas, 0 ignorados** |
| `pnpm typecheck` | Shared, core, API e web aprovados |
| Typecheck adicional dos novos testes da API | Fontes + boundaries, cancellation e segurança nativa aprovados |
| Typecheck focado dos testes de hooks web | Aprovado |
| `pnpm build` (core, API e web) | Aprovado; Next gerou 29 páginas |
| Biome nos 16 arquivos selecionados desta correção | Aprovado |
| ESLint quality / typed | 0 erros; respectivamente 57 / 125 avisos |
| Self-check das regras de qualidade | Três módulos aprovados |
| `git diff --check` | Aprovado |

O total não é cobertura percentual nem prova de todos os fluxos possíveis. A suíte
web mistura testes de renderização/hooks com verificações estáticas já existentes;
não é uma execução completa em navegador.

### Regressões verificadas

- Casos PostgreSQL reais confirmam inserção idempotente e rejeição quando status ou
  conta mudam durante a consulta externa, além dos testes existentes de atribuição,
  créditos de operador e reembolsos.
- Casos Redis reais exercitam convite concorrente, primeiro administrador único,
  email duplicado e convite revogado, sem contas residuais.
- HTTP público usa Undici com rede desabilitada no MockAgent para testar redirects,
  bloqueios, cancelamento e preservação de método/corpo conforme o contrato.
- Cancelamento de render impede que um fetch concluído depois do timeout grave
  resultado ou transforme a falha em sucesso.
- Mutantes somente na cópia descartável confirmaram que remover as proteções de
  sessão e cancelamento faz os testes específicos falharem. Nenhum mutante ficou
  no checkout. Foram observadas falhas antes das correções de redirects e conta.

## Ambiente e reprodução segura

Node 24.22.0, pnpm 9.12.0, PostgreSQL 16 e Redis 7 em contêineres descartáveis;
sem `.env` real, credenciais herdadas, portas expostas ou acesso à rede externa.
Fontes copiadas, dependências isoladas e dados/artefatos temporários. O esquema foi
aplicado exclusivamente ao PostgreSQL vazio da fixture. Não se executou o start
da API, que inicializa workers e migrações. Não houve dependência nova nesta correção.
Os três contêineres e o volume desta fixture foram removidos após a validação;
continham apenas dependências copiadas e dados sintéticos descartáveis. Nenhum
contêiner preexistente, arquivo do projeto ou backup foi removido.

Na fixture preparada, executar:

```sh
pnpm test
pnpm typecheck
NODE_ENV=production pnpm build
cd packages/api
node --import tsx --test test/security-remediation.node.ts
```

Os testes PostgreSQL exigem `ATTRIBUTION_TEST_DATABASE_URL`,
`ATTRIBUTION_REPORT_TEST_DATABASE_URL`, `REFUNDS_TEST_DATABASE_URL` e
`SECURITY_BOUNDARIES_TEST_DATABASE_URL` apontando exclusivamente para banco
descartável. Sem essas variáveis, parte deles é ignorada. A suíte nativa exige
`TMX_ISOLATED_SECURITY_FIXTURE`, `SECURITY_TEST_REDIS_URL` e chave sintética conforme
seus guardrails. Não reutilizar Redis/banco de desenvolvimento compartilhado ou live:
há limpeza de fixtures. A contagem 603 pressupõe esse preparo, não apenas um comando
num checkout sem serviços.

## Limites e dívida ainda existente

- **O gate global de lint não está verde.** Medição comparável de Biome em `packages`
  com a mesma configuração: HEAD, 438 erros/49 avisos; checkout final, 433 erros/46
  avisos. A dívida predominante já existia e não foi escondida com supressões nem
  reformatação massiva. Portanto não se declara `pnpm check` aprovado. Contagens
  históricas do setup vieram de outra rodada e não substituem esta comparação.
- **Chromium/FFmpeg:** preflight de URL não equivale a isolamento de rede de todos
  os recursos internos/redirects. Egress obrigatório ainda precisa ser implementado;
  esta validação não encerra toda a auditoria de SSRF.
- Não foram testados navegador E2E, email real, pagamentos, pixels, UTMify ou outros
  provedores reais. Os envios de negócio permaneceram intactos nesta execução.
- O cancelamento testado não promete desfazer uma escrita S3/Redis já em andamento.
- Os arquivos alterados continuam pendentes, sem commit. Publicação exige decisão
  separada e revisão das limitações acima; não há autorização implícita de deploy.
