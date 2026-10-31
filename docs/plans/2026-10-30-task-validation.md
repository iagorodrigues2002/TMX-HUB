# Validação de Gestão de tarefas — 30/10/2026

## Homologação com criação pelo painel — resultado mais recente

- Autorização recebida para habilitar MCP somente nos dois rascunhos e criar credencial temporária. Ambos continuam `active:false`, sem publicação.
- Credencial `TMX Tasks · Homologação temporária 30-10` (`PZDd6anHTNJWAH0b`), restrita ao domínio temporário de homologação. O segredo está apenas na configuração local ignorada/protegida e no cofre n8n, nunca neste documento ou no frontend.
- A ponte expõe somente rotas de automação de tarefas autenticadas. `/v1/auth/me`, `/v1/offers` e acesso sem segredo retornaram 404. Processo da ponte tem encerramento automático após uma hora; não é infraestrutura de produção.
- Criação REAL pelo formulário de `http://localhost:3100/tarefas`, com Lucas e Douglas, gerou tarefa ClickUp `86e3xfxvq`, comando local `16c06645-31f9-4a35-84cc-1537350a6474`. Execução manual n8n `101156`: sucesso até Concluir comando; API local registrou ClickUp e Discord sincronizados.
- Mudança para Em progresso pelo painel gerou execução manual `101159`, concluída com sucesso; card Discord atualizado com menções de Lucas e Dods.
- Botão Concluído clicado no Discord: fluxo existente `1CLSOk0HJe6phaTt`, execução `101161`, sucesso; retorno ClickUp no fluxo `I6IOSlHHIphQoCXx`, execução `101162`, sucesso, dois responsáveis preservados.
- O espelho de homologação foi executado MANUALMENTE com esse evento real, execução `101163`, sucesso. TMX ficou `done`, com `completedAt=2026-10-30T18:14:31.803Z`. Isso NÃO comprova assinatura automática de callbacks enquanto os workflows seguem desativados.
- Repetição do mesmo evento, execução `101166`: sucesso com `duplicate:true`; permaneceu uma tarefa e seis eventos armazenados. Nenhuma nova criação no ClickUp por essa repetição.
- Vínculo de Lucas testado pelo formulário com os mesmos IDs: atualizou o registro existente, mantendo duas pessoas no total. Douglas confirmado pelo usuário como Dods: ClickUp `101399101`, Discord `1357487279454556281`.
- Corrigidos na homologação: JSON vazio indevido na ponte, uso de global URL indisponível no sandbox n8n, erro 500 em conflito de identidade (agora 409), e reuso do ID ao atualizar pessoa pelo formulário.
- Validação final: 113 testes web aprovados; 534 API aprovados, 36 da suíte geral pulados; todos os 7 testes de tarefas executados com PostgreSQL descartável. Typechecks API/web e Biome dos seis arquivos modificados aprovados. A primeira tentativa da suíte geral atingiu timeout; a repetição com dois workers terminou normalmente.

### Bloqueador descoberto — não ativar os dois publicadores

O fluxo antigo publicado e o worker novo enviam cards para o mesmo pedido de tarefa. A criação pelo painel produziu os cards Discord `1565790248066097332` (publicador antigo) e `1565790246455607390` (worker novo). O publicador antigo ainda não mapeia a menção de Douglas. Nenhum deles foi apagado ou escondido para mascarar a falha.

Antes da operação automática, escolher UM publicador e conectar a confirmação real dele ao TMX. Recomendação: preservar o publicador existente, adicionar retorno autenticado ao TMX e remover publicação paralela do worker. Essa integração exige revisão e autorização para alterar/publicar o fluxo existente, fora da autorização atual de homologação. Os outros setores ainda precisam de validação real das listas, status e destinos; o teste externo desta seção cobre Infraestrutura.

## Teste externo autorizado — 30/10 às 14:38–14:39 (São Paulo)

Complemento: Douglas foi atribuído à mesma tarefa por controle nativo e confirmado na atividade do ClickUp. Reabertura da tarefa executou n8n `101144` com sucesso; o output do node Preparar estado atual confirmou responsáveis ClickUp Lucas `101375637` / `lucas@mainex.info` e Douglas `101399101` / `douglas@mainex.info`. A tarefa foi concluída novamente após o teste. Foram cadastrados os dois vínculos no banco LOCAL `managed_task_people` (não em produção): Lucas com Discord confirmado `343585375618334732`; Douglas com Discord null, pois o perfil ainda não foi comprovado. O cadastro local foi feito no banco, não via formulário, e não comprova a criação pelo painel. Cloudflared instalado pela fórmula oficial Homebrew; nenhum túnel foi aberto nem serviço de túnel ativado.

- Criada via interface ClickUp, não via painel TMX: `TESTE TMX — integração de tarefas — 30/10/2026`, ID `86e3xfam5`, lista Infraestrutura, responsável Lucas Gomes.
- Transição pendente → em progresso confirmada na interface.
- Discord canal `1557062462199562280`: mensagem `1565782004010848256`, criada `2026-10-30T17:38:40.579Z`, contém o mesmo taskId, status em progresso e menção `<@343585375618334732>`.
- Transição para concluído realizada na interface ClickUp. Discord recebeu `1565782162630905948` com confirmação de conclusão em 30/10 às 14:39. A mensagem anterior deixou de aparecer na lista recente após a conclusão, consistente com o fluxo existente de mensagem única.
- Workflow publicado `I6IOSlHHIphQoCXx` lido pelo MCP, sem edição: mapeamento atual ClickUp `101375637` → Discord `343585375618334732` (Lucas), e `246130969` → `854014263092969484` (Iago). Douglas ainda não consta nesse mapeamento; não foi inventado um ID para ele.
- Isso valida ClickUp → fluxo existente → Discord, NÃO painel local → n8n, nem os botões Discord → ClickUp. Nenhuma tarefa da operação foi modificada. A tarefa de teste foi mantida concluída para auditoria.

## Resultado e limite

Código e testes locais revisados. A integração externa NÃO está validada de ponta a ponta nem pronta para ativação: credenciais/configuração dos rascunhos continuam pendentes. Nenhum workflow publicado/ativado, tarefa real alterada, convite enviado ou deploy realizado.

## Evidência real consultada

- Servidor Discord TMX: `1167231425460838400`.
- Entrada de solicitações: `1557425385086648430`, formulário com Tarefa, Setor, Responsável, Oferta, Prazo, Prioridade e Descrição.
- Infraestrutura: `1557062462199562280`, mensagens de conclusão existentes. Uma mensagem de conclusão não contém, necessariamente, o ID suficiente para reconstruir a tarefa; não cruzar só pelo título.
- Spy: `1557087913542549526`, card `1565248221981319198`, tarefa ClickUp `86e3x0y4b`, menciona Dods e Lucas e contém os botões `tmx_status|86e3x0y4b|pending`, `progress`, `done`.
- Outro card Spy (`1565246454283370576`, ClickUp `86e3x0xm4`) aparece concluído, editado em 29/10. Não houve alteração durante a auditoria.
- Tráfego tem canais individuais: tarefas-yan `1547437971932713051`, tarefas-jessica `1547438005986267247`, tarefas-lucas-ttk `1555646677984223243`. As amostras consultadas são mensagens manuais, sem ID ClickUp/botões. Não importar automaticamente essas mensagens como tarefas nem duplicá-las.
- Ofertas, processos, acessos, contingência, financeiro, calls e arquivos são outras áreas do servidor, não equivalem automaticamente a setores de tarefas. Movimentações financeiras permanecem fora da central solicitada.
- Processador n8n `FdB40Pz6MTSr8Ib4` observado Published, com validação do formulário, criação ClickUp, idempotência, resposta Discord e notificação específica Spy. Não foi editado.
- Novo worker `zk5J8wb1veSzK5nw` observado como RASCUNHO; requisições TMX ainda aparecem com destino undefined. Não executar nessa condição.
- Mapeamentos do export local do processador: Infraestrutura `901717610657`, Tráfego `901717610703`, Funil & Desenvolvimento `901717610683`, Spy `901718018881`. São pistas do export, NÃO confirmação atual das listas/status pelo ClickUp.

## Correções locais nesta auditoria

1. A consulta de tarefas usava um fragmento WHERE separado; o cliente resiliente de PostgreSQL executava esse fragmento como consulta independente. Reproduzido com o cliente real em teste e corrigido dentro da rota de tarefas, sem alterar o cliente compartilhado/comercial.
2. Busca por nome do responsável agora é feita no servidor, incluindo totais e paginação, e não só sobre a página carregada.
3. Worker recusa confirmação de atualização se o ClickUp retornar um ID diferente da tarefa solicitada.
4. Teste da API passou a configurar segredo sintético isolado, sem depender de credencial externa.
5. Adicionados testes de regressão da conexão resiliente, busca, identidade e renderização/menções do espelho.

## Validação executada

- Web: 111/111 testes aprovados, nenhum pulado.
- API: 533 aprovados, 36 pulados da suíte geral. Os 6 testes de Gestão de tarefas foram executados com PostgreSQL descartável, incluindo os de banco.
- Typecheck API e web: aprovados.
- Testes não fizeram chamadas de escrita a Discord, ClickUp ou n8n.
- A API local foi reiniciada após correção. Login pelo navegador retornou 401 com os dados preenchidos atualmente; não houve redefinição de senha nem bypass.

## Bloqueios concretos antes de ativar

1. MCP n8n configurado localmente respondeu HTTP 403 na autenticação. Não alterar proteção para contornar; reconectar/validar a credencial de acesso.
2. ClickUp MCP exige `link_id` de conexão não fornecido pela ferramenta. Consulta de tarefa e listagem de workspaces não puderam executar. Navegador ClickUp está no login.
3. Reentrar no TMX local com conta válida para concluir conferência visual autenticada.
4. Configurar origem HTTPS de homologação acessível ao n8n, segredo exclusivo correspondente na API e nodes TMX. A credencial previamente criada no n8n, por si só, não configura a API.
5. Confirmar status EXATOS de cada lista e todos os IDs ClickUp/Discord de responsáveis; não inferir pelo nome.
6. Confirmar destinos por setor: os canais pessoais de tráfego não podem ser substituídos silenciosamente por um canal único.
7. Vincular espelho ao fluxo existente e testar criação com dois responsáveis, três mudanças de status, eventos fora de ordem, repetição e timeout após criação, primeiro em homologação. Os rascunhos importados ainda não contêm as correções locais desta auditoria.
8. Integrar a Central de Notificações (ainda demonstrativa) aos eventos persistidos e leituras individuais. Sem essa etapa, o painel não implica notificações reais.
9. Só depois de autorização específica, publicar/configurar e validar recibos reais. Nenhuma garantia de 100% até a prova de ida e volta.
# Revisão: publicador único — 30/10, 20:05 UTC

- Removidos todos os publicadores Discord do worker e do espelho, tanto nos JSONs locais quanto nos dois rascunhos n8n inativos. Nenhum deles deve postar cards.
- Publicador canônico `I6IOSlHHIphQoCXx`: revisão em rascunho, sem publicar. Atualiza a mensagem existente com PATCH, preserva os dois responsáveis (incluindo Douglas/Dods), encaminha Spy e só confirma ao TMX após a resposta real do Discord. Export revisado: `automations/n8n-task-single-publisher.json`.
- Testes reais manuais 101197 e 101198: ambos PATCH na mesma mensagem `1565791036972998800`, da tarefa `86e3xfxvq`; retorno ao TMX automático dentro da execução, sem chamada manual separada do espelho. Segundo recebimento retornou `duplicate: true`. Nenhum card novo foi criado por esses testes.
- Entrada temporária restrita à tarefa de teste foi removida do rascunho após a validação. A versão publicada do canônico permaneceu `18dc8878-c038-4519-968e-5fb70da5fcc9`.
- API: o recibo completo do publicador conclui somente comando em processamento com identidade, responsáveis e status compatíveis. Um checkpoint ClickUp atrasado da mesma versão não rebaixa o recibo Discord confirmado.
- Validação nesta revisão: 8 testes API com Postgres descartável; 8 testes dos workflows; 2 testes da ponte. Typecheck API e web, Biome dos arquivos alterados e git diff --check aprovados.
- A ponte temporária de rede foi encerrada após a homologação. Não usar a URL temporária para ativação contínua; o web/API local continua separado dela.

## Pendências obrigatórias antes da ativação

- Publicador paralelo `Notificar canal Spy` desativado somente no rascunho do processador antigo, pelo editor. O aviso `Confirmar no Discord` no canal de solicitação foi preservado. Publicar coordenadamente com o canônico; não foi habilitado MCP adicional.
- Vincular a credencial definitiva da API e configurar `TMX_TASK_API_BASE`/`TMX_TASK_CONFIG_JSON` com todas as listas e seus status reais. O rascunho remoto usa exclusivamente a ponte temporária e Infraestrutura para homologação; não é configuração de produção.
- Validar a publicação inicial disparada por `taskCreated`, concorrência de eventos e os demais setores. Os testes desta revisão exercitaram atualização de card existente e repetição, não uma ativação contínua do gatilho ClickUp.
- Aplicar migração/API/web e publicar os rascunhos coordenadamente somente após autorização. Não houve push, deploy nem publicação nesta revisão.
