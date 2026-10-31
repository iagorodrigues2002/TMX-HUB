# Calls — implementação e porta de publicação

## Escopo aprovado

Cadastro admin no TMX, persistência e atualizações ClickUp, card e lembretes no canal Discord calendário, avisos particulares no TMX. Hora São Paulo, padrão 30/5/0 minutos, reagendamento/cancelamento e deduplicação. Publicar somente após validação real completa, incluindo tarefas e central de notificações.

## Descobertas reais

- Canal Discord `1564354609957576884` (`📅・calendario-de-calls`).
- Fluxo publicado já existente `HJTgCXBWt81DpwAJ` envia lembretes de 24h/1h/10min. Não ativar segundo agendador para os mesmos registros.
- Leitura real ClickUp pela execução n8n `101378`: call `86e3w2x8e`, lista `901717610726` (Comercial & Parcerias), status `pendente`. Nenhuma call existente foi alterada.
- A Central de Notificações anterior é uma prévia fictícia em desenvolvimento. A nova caixa de Calls é real e separada; não torna a central antiga integrada.

## Implementação local

- Migração106 aditiva, contrato compartilhado, API admin e fila persistente de comandos/lembretes com revisão.
- Notificações privadas exigem vínculo explícito entre pessoa e conta TMX; cadastro não concede permissões.
- Página /tarefas contém tabs Tarefas/Calls e controles de criação, reagendamento, cancelamento e conclusão.
- Workflow `automations/n8n-call-worker.json` é export inativo gerado por `automations/call-worker.mjs`. Exige credenciais próprias, base API e `TMX_CALL_CONFIG_JSON` com lista/canal/status reais. Não copiar URL temporária de homologação para produção.
- Falhas de efeito desconhecido devem ficar em processamento/quarentena, sem repetir criação automaticamente.

## Bloqueadores de publicação

- Não houve validação ponta a ponta da criação de call e dos três lembretes nos provedores reais.
- Faltam comprovar todos os status reais da lista, configurar a credencial definitiva e coordenar a retirada do agendador antigo.
- Central real implementada em revisão subsequente: /notifications consulta tarefas vinculadas, vendas com permissões/preferências e calls particulares; /read persistente, ações de status enfileiradas. Migração107 aplicada apenas na prévia isolada. Componente real substitui a entrada demonstrativa no HubShell. Validar visual e execução externa antes da ativação.
- Corrida entre claim e cancelamento corrigida: bloqueio comum da call e 409 ao editar/cancelar com envio reservado. Testes verificam exclusão mútua e processamento único por workers concorrentes.
- Nenhum push/deploy/ativação foi realizado nesta implementação. Permissão de publicação é condicional aos testes completos, não automática.

## Evidências de testes

- Suíte API: 531 aprovados /45 pulados, sem usar produção.
- Tarefas com PostgreSQL descartável: 9 aprovados, incluindo conta TMX inexistente e vínculo privado duplicado.
- Calls com PostgreSQL descartável: 5 aprovados, incluindo leitura de outro usuário, revisão antiga, replay, concorrência, checkpoint ClickUp e cancelamento com envio reservado.
- Contrato do worker: 4 aprovados; conferência de canal/participantes/horário e nonce distinto por lembrete/revisão. Export JSON conferido contra gerador.
- API e web typecheck aprovados. Suíte web completa: 123 aprovados após tornar o teste de contrato tolerante a quebras de linha, preservando a verificação.
- Validação visual autenticada: abas Tarefas/Calls, formulário, bloqueio de participantes ausentes, cadastro de uma call TESTE somente no banco local com Lucas/Douglas para02/11 10:30 São Paulo e lembretes30/5/0. API confirmou queued. Diálogo particular de avisos vazio funcionou sem erro. Screenshot `/tmp/tmx-calls-local.png`.
- Migração106 aplicada somente em `tmx_live_preview_20261029`. Não há migração em produção.

## Revisão para publicação solicitada

- GitHub remoto e ambos os checkouts ainda no commit9a6919d; nenhuma divergência remota a incorporar.
- Railway CLI da pasta aponta para N8N. Ao publicar usar explicitamente projeto TMX `3704cd93-6011-4e5f-be52-f229b499b018`, ambiente production. Web serviço `37eb63d7-2ba4-46ed-bc0f-113c275eba37`, API `a8bb8afa-b7a3-4b41-827d-d91fd3a283a4`.
- Metadados confirmaram ausência de `TASK_AUTOMATION_SECRET` na API de produção. Foi solicitada confirmação para criar credencial definitiva exclusiva e configurar o segredo correspondente; não utilizar o segredo da ponte temporária.
- Builds API e web inicialmente aprovados; verificação final após a central real em andamento. Não houve commit/push/deploy nesta revisão.
- Verificação final da central: 127 testes web, 532 API (47 pulados),16 testes focados com PostgreSQL e5 de workflow aprovados. Builds e typechecks API/web e Biome dos módulos da central aprovados.
- Navegador autenticado AdminLocal: quatro abas reais Todas/Tarefas/Vendas/Calls, zero registros honesto sem dados demonstrativos, sem erro de API e layout estável. Captura `/tmp/tmx-central-real-local.png`. Outras contas validadas por testes de isolamento, não por sessão de navegador.
- Após configurar e homologar integrações: migrações105/106/107 aditivas, API antes de frontend; vincular contas TMX aos IDs já confirmados; validar recibos ClickUp/Discord, retirar publicador paralelo/antigo agendador de maneira coordenada. Só então ativar os novos agendamentos.

## Recuperação de efeitos externos incertos

`processing` após timeout ou falha não prova que o provedor rejeitou a operação. Não recolocar comandos de criação na fila nem executar novamente o POST às cegas. Isso pode duplicar a call, o card ou os lembretes.

1. Identificar o comando, a revisão e a execução n8n exatos; consultar a tarefa real no ClickUp e a mensagem no Discord.
2. Conferir título, participantes, horário, status, canal e IDs contra o comando reservado. O checkpoint ClickUp preserva a identidade já confirmada antes do envio Discord.
3. Quando ambos os efeitos estiverem confirmados, encaminhar os IDs reais ao endpoint autenticado `/v1/call-automation/result`, preservando o ID e a revisão originais; nunca criar outro comando como substituto.
4. Se o efeito não puder ser comprovado, manter em quarentena e investigar. Apenas uma rejeição comprovada sem efeito permite registrar `ok:false`; uma recuperação posterior exige nova operação explicitamente reconciliada.
5. Resolver envios em andamento antes de reagendar/cancelar: a API retorna409 para impedir que alterações concorrentes usem lembretes antigos.

Não há promessa de entrega exatamente uma vez entre serviços independentes. A fila, revisões, recibos, PATCH e nonce reduzem duplicações; a reconciliação é necessária quando a resposta se perde. Uma falha de configuração deve ser corrigida antes de ativar o agendador, não testada contra todos os registros reais.
