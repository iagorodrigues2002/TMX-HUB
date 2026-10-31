# Gestão de tarefas — implementação local e ativação controlada

## Estado

Base: checkout `tmx-live-local-20261029`, commit `9a6919d0dc53e9132d10410392940b6abe13ed14`.
Implementado localmente: dashboard, formulário, API admin, persistência, fila transacional, contrato de eventos e dois workflows n8n desativados. Não publicado. Os workflows foram importados no n8n autenticado como rascunhos, mas não executados nem publicados. A Central de Notificações existente continua sendo um preview separado; não recebe automaticamente estes dados ainda.

Rascunhos confirmados no navegador:

- Worker: `https://n8n.techcomunity.org/workflow/zk5J8wb1veSzK5nw` — “TMX — Gestão de tarefas | Comandos do painel · RASCUNHO”.
- Espelho: `https://n8n.techcomunity.org/workflow/5xYlteEYEhaBDwjS` — “TMX — Gestão de tarefas | Espelho Discord e ClickUp · RASCUNHO”.

O n8n autoassociou “Header Auth account” ao trigger do espelho durante a importação. Esse vínculo NÃO foi validado como credencial correta, não deve ser usado/ativado e precisa ser substituído por credencial exclusiva após autorização. Nenhum segredo foi revelado ou copiado. Variáveis da API/listas e credenciais exclusivas continuam pendentes; os nodes mostram origem indefinida enquanto não configuradas.

Atualização após autorização explícita do usuário: credencial **TMX Tasks API · Exclusiva** criada e confirmada na listagem do n8n em 29/10. Tipo Header Auth, header `x-tmx-task-secret`, segredo aleatório de 256 bits gerado sem exibição e domínio HTTP permitido restrito a `theminex.com`. O segredo foi salvo somente na credencial do n8n; não foi incluído em código, documentação, `$vars` ou arquivos locais. Ainda não foi configurado como `TASK_AUTOMATION_SECRET` na API nem vinculado aos nodes dos rascunhos. Não é a credencial da entrada do espelho, que precisa de configuração separada. Nenhum fluxo existente foi alterado, executado, publicado ou ativado nesta criação.

Validação local concluída em 29/10: build web em cópia isolada sem `.env`, build API, typecheck API/web, Biome dos novos módulos, 107 testes web aprovados e suíte API com 532 aprovados / 36 pulados. Os testes novos com PostgreSQL descartável foram executados, não pulados. A prévia foi testada no navegador (criação com dois responsáveis, filtro por pessoa, expansão e conclusão). Não houve execução comercial ou criação de tarefa externa de teste.

## Páginas

- `/tarefas`: entrada no menu lateral, somente admins. A API verifica admin independentemente do menu.
- `/preview/tarefas`: dados fictícios interativos, somente em desenvolvimento. Criar/concluir aqui não altera bancos ou sistemas externos.
- Resumo geral e carga por pessoa vêm de agregações de todas as tarefas no banco, não só da página carregada. A lista usa paginação de 50 e filtros no servidor.
- Campos iguais ao Discord: tarefa, descrição, oferta, setor, todos os responsáveis, prioridade e prazo. Setores do export existente: Infraestrutura, Tráfego, Funil & Desenvolvimento e Spy.
- Datas em São Paulo. `receivedAt` é a primeira recepção no TMX. `assignmentReceivedAt` registra quando cada responsável foi observado no TMX; não é uma reconstrução da atribuição histórica. `assignedAt`, início e conclusão permanecem desconhecidos quando o provedor não informa. `date_updated` sozinho não prova início do trabalho.
- Não há exclusão de tarefas nesta implementação. Concluídas continuam no dashboard e podem ser filtradas.

## Fluxo

1. Admin cria uma tarefa com Idempotency-Key estável. A API grava tarefa e comando na mesma transação.
2. O n8n reserva até cinco comandos a cada 15 segundos (`FOR UPDATE SKIP LOCKED`). Comando reservado não é reenviado automaticamente: timeout após criação pode ter resultado desconhecido.
3. Worker cria/altera no ClickUp, consulta o resultado e confere todos os responsáveis e o status específico da lista.
4. Persiste primeiro a confirmação e o ID ClickUp. Depois cria/edita a mesma mensagem Discord com Pendente / Em progresso / Concluído e `tmx_status|taskId|status`.
5. Persiste messageId/channelId e só então conclui o comando. O TMX não mostra uma conclusão otimista antes da confirmação.
6. Alterações iniciadas pelo Discord/ClickUp entram no espelho autenticado, são normalizadas e deduplicadas e atualizam o card Discord sem escrever novamente no ClickUp (evita eco).

## Arquivos n8n

- `automations/n8n-task-dashboard-worker.json`: painel → ClickUp → Discord → confirmação TMX.
- `automations/n8n-task-mirror.json`: tarefa já confirmada no ClickUp → TMX e card Discord.

Importar inicialmente em ambiente de homologação. Ambos estão `active:false`. IDs de credenciais são placeholders, não credenciais reais. Reutilizar as credenciais existentes de ClickUp/Discord, sem copiar tokens para código.

### Configuração necessária, ainda não aplicada

1. Aplicar a migração aditiva `105_task_management.sql` em banco de homologação e publicar API/web somente após autorização. Nenhuma migração foi aplicada em produção.
2. Criar segredo aleatório exclusivo de pelo menos 32 caracteres na API (`TASK_AUTOMATION_SECRET`). Configurar uma credencial Header Auth n8n com nome de header `x-tmx-task-secret` e o mesmo segredo. Não colocar em `$vars`, navegador ou JSON versionado. O logger da API oculta esse header.
3. Criar outra credencial Header Auth para a entrada do espelho (`TMX Task Mirror Inbound`), usada pelo fluxo produtor. Exigir HTTPS com validação TLS, nunca URL pública sem autenticação.
4. Configurar a variável n8n `TMX_TASK_API_BASE` com origem HTTPS da API acessível pelo n8n, sem barra final. Para homologação, usar a origem de homologação, não `theminex.com`.
5. Configurar `TMX_TASK_CONFIG_JSON` com listas, canais e nomes EXATOS dos status de cada lista. Estrutura (valores abaixo não são configuração real):

```json
{
  "Spy": {
    "listId": "ID_REAL_DA_LISTA",
    "channelId": "ID_REAL_DO_CANAL",
    "statuses": { "pending": "STATUS_PENDENTE_REAL", "progress": "STATUS_PROGRESSO_REAL", "done": "STATUS_CONCLUIDO_REAL" }
  }
}
```

Repetir para os outros três setores. Não usar status genérico sem conferir a lista.

6. Em Vincular pessoa, cadastrar o ID ClickUp e Discord correto de cada pessoa. O export antigo tinha Iago e Lucas mapeados, mas Dods sem ID ClickUp. Não inventar esse ID nem assumir que o nome identifica a conta. O cadastro não concede acesso ao TMX.
7. Ligar o espelho DEPOIS da criação/atualização confirmada no ClickUp e do retorno da mensagem Discord nos fluxos atuais. Não chamar antes de receber taskId. Preservar os roteamentos atuais das ofertas e Spy e os botões existentes. Não substituir o workflow antigo inteiro.

Envelope de entrada do espelho:

```json
{
  "eventId": "ID_ESTAVEL_DO_EVENTO_ORIGINAL",
  "source": "discord",
  "task": { "id": "TASK_ID", "name": "Título", "date_updated": "TIMESTAMP_MS", "list": { "id": "LIST_ID" }, "status": { "status": "STATUS_REAL" }, "assignees": [] },
  "offer": "PJR_ENG",
  "discordMessageId": "MESSAGE_ID",
  "discordChannelId": "CHANNEL_ID"
}
```

`task` deve ser a resposta completa atual do ClickUp, não o exemplo reduzido acima. `source` aceita `discord` ou `clickup`. Usar o ID do evento original, preservado em retries. A data/ID da tarefa só bastam para deduplicar snapshots idênticos, não eventos distintos de uma mesma versão. O espelho exige correspondência dos responsáveis.

## Histórico inicial

Importação histórica NÃO executada. Antes de ativar, exportar tarefas das quatro listas com todas as páginas e `include_closed=true`, cruzar com o estado único por tarefa do workflow existente para recuperar messageId/channelId e enviar snapshots pelo contrato autenticado. Fazer primeiro uma amostra em homologação; não disparar novamente criação de tarefa nem notificações antigas.

Não é possível reconstruir a data original de atribuição só com a data de criação/atualização. Usar histórico real quando existir, senão manter campo vazio. Tarefas antigas sem vínculo de mensagem precisam de conciliação antes de alterar status pelo painel. O endpoint de lookup pelo ClickUp/requestId permite que eventos concorrentes de criação local e webhook apontem para a mesma tarefa.

## Falhas e reconciliação

- Falha após efeito externo não autoriza repetir criação. Comando em processing ou failed exige conferir execução n8n e taskId real antes de qualquer reprocessamento.
- Eventos antigos ficam no histórico, mas não sobrescrevem status mais recente. Mesmo eventId com outro corpo retorna 409.
- Status só é considerado sincronizado após confirmação do ClickUp e Discord. A falha de um deles não pode marcar sucesso completo.
- Atualização externa sem pessoa/setor/status mapeado falha explicitamente; não omitir responsáveis silenciosamente.
- Credencial inválida retorna 401 antes de ler o banco. Usuário sem admin recebe 403 antes de ler ou gravar dados. Credencial de automação não é token de sessão de navegador.
- Leitura/ocultação individual da Central não apaga mensagens públicas no Discord. A integração da Central deve manter essa separação.

## Critérios antes de ativar

- Importar JSONs na versão instalada do n8n e conferir os tipos de node/expressões/credenciais no editor. Testes locais de contrato e sintaxe não substituem a execução real no n8n.
- Confirmar dois responsáveis no ClickUp, dois responsáveis na mensagem e uma única tarefa no TMX.
- Validar ida e volta de cada um dos três botões e evento antigo chegando fora de ordem.
- Simular timeout após criação; não pode criar segunda tarefa.
- Importar amostra histórica sem publicar novamente mensagens antigas.
- Confirmar acesso negado para membro e origem de produção sem exposição da prévia.
- Revisar diff, aplicar configuração autorizada e verificar o resultado real após deploy. Não declarar integração live pronta antes desses passos.
# Atualização de arquitetura — 30/10

As instruções antigas sobre publicar cards pelo worker/espelho estão substituídas: ambos agora somente persistem confirmações. O único publicador é a revisão do workflow existente `I6IOSlHHIphQoCXx`, exportada em `automations/n8n-task-single-publisher.json`. O nó paralelo Spy do processador antigo está desativado somente no rascunho. Ver `2026-10-30-task-validation.md` para provas e pendências de liberação. Não publicar os rascunhos com a URL/credencial temporária de homologação.
