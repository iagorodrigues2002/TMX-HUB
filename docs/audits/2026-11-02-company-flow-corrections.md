# Correção dos fluxos empresariais — validação local

## Entrega

- Oferta exige empresa explícita e autorização owner/admin ou global. Criação
  vincula SQL/Redis; falhas têm compensação. Exclusão limpa associação/grants,
  listagem tolera oferta realmente removida e não esconde indisponibilidade Redis.
- Gestão de tarefas e calls usa `companyId` no backend, seletor na interface e
  capacidade própria de navegação. Administrador empresarial não vira global.
- Central mostra tarefas/calls somente aos responsáveis/participantes com vínculo
  ativo. Globais também precisam participar para recebê-las. Suspensão bloqueia
  fallback legado; replay revalida empresa e atribuição atuais.
- Vínculos externos Discord/ClickUp só podem ser estabelecidos por global. Um
  administrador empresarial não pode assumir a identidade externa de outra pessoa.
- Calls legadas continuam no bridge original, mesmo em modo nativo. Claim,
  checkpoint e result rejeitam registros nativos, evitando dois publicadores.
- Worker nativo revalida membros e canal empresarial; nunca usa canal global
  como fallback para uma empresa. Sem mapa de canal a entrega fica pendente.
- Manifesto de transição distingue convidados em onboarding e rebaixamentos
  explícitos de global para empresa. Permite preparar SQL antes da troca de role.
  `legacyCallIds` associa calls revisadas sem mudar revisão/recibos/publicador.

## Evidência

Rodada de 02/11/2026, após correções:

- API: **696/696 testes**, 120 arquivos, todas as variáveis de testes PostgreSQL
  habilitadas em bases descartáveis locais.
- Web: **204/204**; shared: **12/12**; core: **78/78**. Total **990**.
- Typecheck shared/core/API/web aprovado. Build API aprovado; Next web compilado e
  35 páginas geradas em `.next-build`, separado do cache da prévia local.
- Rede externa negada nos testes; sockets Unix locais permitidos no core, pois
  seus testes de proxy precisam de `proxy.sock`.
- Biome corrigido nos arquivos alterados. Quality-rules aprovado. ESLint quality
  e typed não têm erros, mas ainda reportam avisos de tamanho de arquivo e
  `no-misused-promises`; não declarar zero avisos.
- Smoke do localhost aprovado: activity, ads-intelligence, refunds-dashboard,
  SyzePay companies/connections, calls, contrato 404 e bloqueio outbound.
- Navegador local autenticado: empresa obrigatória no formulário; criada oferta
  sintética `QA fluxo empresarial local` com UTMify desativada. Criada tarefa
  `QA local · fluxo empresarial 03-11`, atribuída a QA admin e QA member,
  marcada em progresso e concluída pela central. Após concluir, sai da central
  e permanece no histórico/lista; call já agendada continua na central.

## Limites / antes de publicar

Nenhum push, deploy, alteração de role real, migração de contas reais ou envio
Discord foi realizado. Nenhuma venda/conversão foi criada. Os dois registros QA
citados ficam somente na homologação local, sem worker de publicação externo.

Antes do corte live: fechar manifesto com IDs reais, revisar RWS_TTK ainda presente
no inventário remoto anterior, associar calls existentes revisadas, preparar SQL,
publicar API empresarial e só então retirar o role global legado de Douglas.
Iago/Lucas permanecem globais; Douglas deve administrar somente TMX.

Configurar `TASK_DISCORD_CHANNELS_JSON` com chaves `companyUUID:Área` / `companyUUID:Calls`;
o fluxo n8n de criação precisa enviar `companyId`. Validar um único publicador e
os recibos Discord reais na janela autorizada. Testes locais não comprovam que
esse mapa externo ou as contas de produção já foram migrados.

Procedimento detalhado: `docs/company-transition.md`.
