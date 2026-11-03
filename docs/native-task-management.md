# Gestão nativa TMX — homologação isolada

## Escopo implementado

O TMX é a fonte dos novos registros. Criação, edição, atribuição, status, datas e histórico são gravados no PostgreSQL sem depender do ClickUp ou de uma resposta do Discord. O painel de gestão é exclusivo de administradores; cada responsável acompanha e altera apenas suas tarefas na central.

Nenhuma tarefa, call ou histórico do ClickUp é importado. Os registros legados não são apagados. Pessoas já vinculadas a uma conta TMX podem ser reutilizadas; o ID ClickUp não é obrigatório no modo nativo. O Discord é opcional para o cadastro da pessoa, mas necessário para mencioná-la e aceitar seus botões.

Tarefas lidas continuam na central até serem concluídas. Vendas e preferências comerciais mantêm o fluxo existente. Não foram alterados pagamentos, webhooks comerciais, UTMify, pixels ou cálculos financeiros.

## Configuração, ainda não aplicada em produção

- `TASK_MANAGEMENT_MODE=clickup` é o padrão compatível com a versão anterior. `native` seleciona exclusivamente tarefas nativas e bloqueia a ponte legada de tarefas. Calls legadas continuam separadas e não são importadas nem apagadas.
- Migração aditiva `108_native_task_management.sql`: idempotência/auditoria e outbox separado para Discord. Não contém importação nem exclusão de dados existentes.
- `TASK_AUTOMATION_SECRET`: segredo servidor-servidor, mínimo de 32 caracteres, no header `x-tmx-task-secret`. Nunca no frontend ou repositório.
- `TASK_DISCORD_CHANNELS_JSON`: mapa de IDs reais de canais **por empresa**. Exemplo de estrutura, sem IDs reais: `{"<empresa_uuid>:Spy":"123","<empresa_uuid>:Tráfego":"456","<empresa_uuid>:Funil & Desenvolvimento":"789","<empresa_uuid>:Infraestrutura":"101","<empresa_uuid>:Calls":"112","<empresa_uuid>:Spy:PJR_ENG":"131"}`. A chave `Empresa:Setor:Oferta` tem prioridade, depois `Empresa:Setor`. Registros de uma empresa nunca usam canais globais como fallback. Cards existentes preservam seu canal confirmado, e a reserva de envio confere novamente o mapeamento e os participantes. Ausência ou mudança incompatível do canal gera falha visível, não publicação em canal aleatório.
- `TMX_TASK_API_BASE` e `TMX_TASK_WEB_BASE`: variáveis do n8n. Usar HTTPS no ambiente real.

## Discord e n8n

Três exports locais estão **desativados**, sem credenciais reais:

1. `automations/n8n-native-task-worker.json`: reserva até cinco entregas a cada 15 segundos, publica ou edita o card e devolve recibo ao TMX.
2. `automations/n8n-native-task-actions.json`: recebe somente interações encaminhadas pelo gateway Discord autenticado existente. O gateway deve validar a origem e reconhecer/deferir a interação dentro do prazo do Discord antes de chamar o subworkflow.
3. `automations/n8n-native-task-create.json`: recebe uma tarefa já normalizada pelo gateway autenticado, resolve responsáveis Discord em contas TMX e cria no TMX. Não publica outro card: só o publicador da outbox faz isso.

Os placeholders de credencial precisam ser substituídos no n8n. A credencial do TMX permite somente as rotas da ponte de tarefas; a do Discord é do bot autorizado. Nenhum webhook público sem verificação foi criado.

Contrato de entrada para criação: `message.id`, `message.author.id` e `task` com `companyId`, `title`, `description`, `sector`, `offer`, `priority`, `dueAt`, `assigneeDiscordIds`. A API exige ator vinculado e autorização administrativa para a empresa (admin global ou papel empresarial autorizado). O ID da mensagem é a chave de idempotência. Os botões usam exclusivamente o prefixo `tmx:native:`; botões antigos não são reinterpretados.

### Adaptador seguro para o gateway existente

`automations/native-cutover.mjs` prepara os três exports acima e duas substituições cirúrgicas para os workflows de entrada e interações existentes. O gerador é local: **não chama n8n, Discord ou TMX e não ativa nada**. Todos os arquivos gerados têm `active: false`; preserve-os fora do Git quando contiverem IDs privados de contas/canais/credenciais.

- A entrada `MESSAGE_CREATE` não confia no autor, conteúdo ou empresa enviados ao webhook. Ela aceita somente o ID numérico da mensagem em um canal permitido, consulta a mensagem real com a credencial do bot e normaliza exclusivamente a resposta autenticada do Discord. Mensagens de bots/webhooks são recusadas.
- A empresa vem da configuração do canal, nunca de um campo livre do formulário. Responsáveis precisam corresponder a uma única pessoa ligada à conta TMX; nomes desconhecidos não são silenciosamente ignorados. A API ainda verifica a autorização do ator e o vínculo empresarial dos responsáveis.
- `notBefore` é o instante UTC explícito da troca, definido após interromper o produtor antigo. Mensagens anteriores ao corte e mensagens com mais de 15 minutos são recusadas: nenhum histórico do ClickUp é importado por replay.
- A entrada só adiciona uma reação de confirmação à mensagem original depois de o TMX confirmar a criação. Apenas o worker da outbox publica o card de tarefa.
- Interações validam Ed25519 sobre os **bytes brutos** de `binary.data` (`rawBody: true`), mais uma janela temporal de cinco minutos. Ausência dos bytes ou assinatura inválida falha fechada; `JSON.stringify(body)` não substitui a assinatura do corpo original.
- O gateway reconhece a interação antes da escrita na API. Somente um botão nativo válido altera a tarefa; botões legados recebem uma explicação privada sem mutação. Falhas de autorização, concorrência ou rede geram retorno privado ao autor, sem publicar outro card.

O arquivo privado de configuração contém `apiBase`, `webBase` (HTTPS), `companyId`, `intakeChannelId`, `notBefore`, `aliases` opcionais (apelido → Discord ID), e referências `tmxCredential`/`discordCredential` com `id` e `name`. **Não contém o valor de nenhum segredo.** A chave pública do Discord é preservada do export de interações auditado. Exemplo de execução, somente após conferir os arquivos de entrada:

```sh
node automations/native-cutover.mjs /caminho/privado/config.json . /caminho/privado/intake.json /caminho/privado/interactions.json /caminho/privado/exports
```

Os testes sintéticos estão em `automations/native-cutover.test.mjs`; execute `node --test automations/native-cutover.test.mjs` com ambiente mínimo e rede bloqueada, conforme `docs/quality.md`. Cobrem forja de identidade/empresa, mapeamento de responsáveis, datas, corte temporal, assinatura com espaços preservados, replay, ACK e ausência de nós ClickUp. Isso não substitui um teste real na versão efetiva do n8n.

### Confirmação, duplicação e falhas

- Revisão otimista evita sobrescrever uma edição concorrente; conflito retorna 409.
- Pedido repetido com a mesma chave retorna a resposta original; outra operação com a mesma chave retorna 409.
- Alterações sucessivas são coalescidas por tarefa/call e editam o mesmo ID Discord confirmado. O TMX mantém o status canônico mesmo se o Discord falhar.
- O envio usa nonce estável e recibo com canal, mensagem e marcador nativo. Nenhum status de entrega é confirmado apenas por execução iniciada ou HTTP genérico.
- Falhas explicitamente retentáveis têm até três tentativas. Timeout/resultado incerto ou reserva expirada entram em quarentena: **não reenviar cegamente**. É preciso conferir o recibo/card antes da recuperação operacional. Não há tela de reconciliação manual nesta versão.
- Só pode existir **um publicador** para os registros nativos. Desviar a criação no gateway antigo antes da ativação, sem tocar nas automações financeiras/comerciais.

## Calls

Agendamento, edição, cancelamento e conclusão são nativos. Lembretes privados do TMX são produzidos pelo servidor independentemente do sucesso do Discord. São individuais por participante e revisão; lembretes antigos vencem, sem enxurrada posterior. O Discord recebe a mensagem personalizada e o link da call. Reagendamento/cancelamento durante um envio reservado ou incerto exige resolver a entrega primeiro, para não enviar silenciosamente um aviso antigo.

## Prévia reproduzível, somente sintética

A prévia usa a mesma lógica HTTP e SQL, com autenticação fictícia e sem inicializar o servidor comercial. Nunca executar `server.ts` com configurações live para essa homologação.

1. PostgreSQL descartável local em `127.0.0.1:32779`, banco e usuário `tmx_tasks_test`, senha sintética `synthetic-native-only`.
2. Em `packages/api`: `pnpm exec tsx scripts/native-task-preview.ts`.
3. Na raiz: `node scripts/local-members-preview.mjs`. Confere os deploys ativos web/API no Railway, o commit base, a versão instalada do Next e a flag visual pública antes de iniciar. Use `--check` para somente conferir, sem iniciar servidor. Não faz pull, reset, stash, push ou deploy. Se houver divergência, interrompe para revisão e atualização segura da base.
4. Abrir `http://localhost:3120/tarefas`. Contas `admin@native.tmx.test`, `member@native.tmx.test` e `other@native.tmx.test`, senha fictícia `Synthetic-preview-2026!`.

O harness recusa modo production ou `DATABASE_URL` herdada, conecta somente ao banco fixo descartável e cria um schema exclusivo. Ao encerrar normalmente, remove somente esse schema sintético. Não disponibilizar o harness na internet. Não usa dados reais nem envia mensagens externas.

A tela de membros está em `http://localhost:3120/preview/membros`. A base e a configuração visual são as do live, com as alterações locais em avaliação; **os dados não são espelhados**. A API sintética atende tarefas, calls e autenticação de homologação, não todas as consultas comerciais. Não apontar esta prévia à API live para preencher os painéis. Não desligar `NEXT_PUBLIC_TMX_SIGNAL_PREVIEW`: apesar do nome histórico, ela controla o visual publicado. A checagem ocorre a cada início, não continuamente durante a sessão.

## Validação e cutover pendente

Testes de banco devem rodar com `--no-file-parallelism`: os testes legados compartilham tabelas públicas do banco descartável. As novas suítes nativas usam schemas exclusivos.

Antes de publicar/ativar: importar e validar os exports na versão efetiva do n8n; configurar canais/credenciais reais; ligar o gateway autenticado aos subworkflows; confirmar que há apenas um publicador; testar mensagem e retorno real do botão com autorização. Os testes locais não substituem essa confirmação externa.

**Calls legadas já agendadas exigem conferência antes do cutover.** O worker legado de calls reserva somente registros `clickup`; o worker nativo reserva somente `native`. Um worker legado pode ser mantido para os agendamentos existentes, sem duplicar os novos, desde que haja exatamente uma instância de cada publicador e os recibos confirmem essa separação. A ponte legada de tarefas, diferentemente da de calls, retorna 410 em modo nativo. Em rollback os registros nativos continuam no banco, embora ocultos na visão legada; não reativar importadores/publicadores duplicados sem reconciliação.

Ordem mínima: publicar API e migrações compatíveis; conferir vínculos, canais e credenciais; parar o criador/publicador legado de tarefas; fixar `notBefore` e preparar os exports; aplicar `TASK_MANAGEMENT_MODE=native` e o mapa empresarial; substituir o intake e o gateway de interações preservando suas URLs; ativar exatamente um worker nativo. O criador e o publicador antigos podem enviar ao Discord antes de chamarem a ponte TMX, portanto **o retorno 410 sozinho não evita cards duplicados**. Só considerar concluído após verificar tarefa real autorizada, replay idempotente, retorno do botão, mesmo ID do card, lembrete de call e autorização de participantes.

Limite desta primeira versão: setor/oferta da tarefa ficam fixos após a criação para não mover cards entre canais sem reconciliação. Título, descrição, prioridade, prazo, responsáveis e status são editáveis.
# Lembrete fixo na central

Calls agendadas aparecem uma única vez no topo de Todas e na aba Calls, somente
para participantes vinculados à conta TMX atual (sem exceção para admin).
Marcar como lida altera somente a leitura individual: não remove o card.
Concluir, cancelar ou remover o participante retira o lembrete; reagendar usa
a revisão atual e renova a leitura. Lembretes temporizados e Discord continuam
separados. Validação local: 11 testes API, 143 web, tipos API/web e navegador;
produção e a call real existente não foram alteradas.
