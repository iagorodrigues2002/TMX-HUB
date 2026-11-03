# Gestão nativa de demandas — plano local

Data: 01/11/2026. Base: `414e2b564bcffb0c72563f36a55fa2105286b048`.
Autorização: construir gestão própria sem importar nada do ClickUp. Cópia isolada autorizada.

## Decisões

- TMX/PostgreSQL é a fonte canônica de tarefas novas; criação, edição e status não aguardam serviços externos.
- Nenhuma importação, exclusão ou transformação de tarefas legadas. Registros nativos são identificados explicitamente e separados na consulta.
- Preservar o caminho legado enquanto o modo nativo não for ativado. Um seletor server-side `TASK_MANAGEMENT_MODE` controla o corte; nunca compartilhar comandos nativos com o publicador antigo.
- Reutilizar pessoas e contas já cadastradas no TMX, sem exigir ID ClickUp. Usuários só podem agir sobre suas próprias tarefas; administração completa continua exclusiva de admin.
- Discord é uma projeção: outbox transacional, IDs estáveis, confirmação de entrega, retentativas limitadas e tratamento de entrega incerta. Falha de envio não desfaz o status salvo no TMX.
- Calls e seus lembretes devem funcionar sem ClickUp, mantendo horário de São Paulo, revisões e descarte de lembretes antigos.
- n8n continua apenas como executor de integrações externas. Preparar workflows locais inativos, sem credenciais embutidas. Não ativar fluxos, enviar mensagens reais ou publicar sem nova autorização.
- Não alterar vendas, webhooks comerciais, pixels, UTMify, som ou preferências comerciais.

## Entregas em fatias

1. Baseline e contrato: tipos compatíveis, modo explícito, migração aditiva e testes de isolamento.
2. Criar/listar/editar tarefas nativas: idempotência, responsáveis, prazos, prioridade, histórico, sem ID ClickUp.
3. Status imediato e central: admin/colaborador autorizados, timestamps e concorrência; leitura não conclui, conclusão retira da central.
4. Discord: fila nativa separada, lease/ack, projeção do mesmo card e retorno autenticado dos botões; nenhuma importação legada.
5. Calls nativas: agendar/reagendar/cancelar/concluir, fila e notificações por participante, sem dependência ClickUp.
6. Interface: reutilizar painel e central, remover exigências/textos ClickUp no modo nativo e apresentar claramente falhas de entrega Discord.
7. Homologação local: banco descartável, Discord simulado, testes de autorização/replay/concorrência/falha; tipos, lint, builds e navegador.

## Riscos e reversão

- Dois publicadores: contrato e fila nativos separados; corte de workflows só após homologação e aprovação.
- Perda de histórico: nenhuma operação destrutiva; legado preservado, não incorporado à nova gestão.
- Falsa sincronização: salvar e sincronizar são estados separados; sucesso externo exige recibo válido.
- Identidade e acesso: vínculo TMX validado no servidor; IDs Discord não fornecem acesso por si só.
- Reversão local: descartar/reverter somente a branch; não há publicação nem migração em produção nesta etapa.

## Verificação e limites

Usar testes da API com PostgreSQL descartável e URLs sintéticas; não iniciar `server.ts` com recursos reais. Verificar o caminho legado e o novo. Não considerar mocks como evidência de envio real ao Discord. Registrar os resultados reais em `tasks/todo.md`.
