# Logs de operação do Upsell Intelligence

## Regra aprovada

Registrar usuário autenticado TMX, oferta, pedido interno do front, etapa, gateway e horário ao solicitar abertura. O registro durável antecede a entrega da URL. Isso comprova a solicitação de abertura, não o carregamento final no navegador nem um pagamento.

O clique recebe uma chave idempotente criada na interface, isolada por projeto e operador. Reenvio da mesma ação não duplica o registro e não permite trocar pedido/etapa. Nenhum dado de comprador, URL, sessão de pagamento ou segredo fica no log. Identificador imutável do operador e nome de exibição são apresentados; e-mail não é exposto.

## Compra e atribuição

As aprovações são lidas dos pedidos pagos de upsell VendePay/SyzePay já existentes, com recibo de webhook processado vinculado ao pedido e à conexão. SyzePay exige recibo com assinatura verificada, cujo processamento atual é exclusivo de `order.paid`. Para VendePay, os primeiros 20 recibos processados do pedido passam pelo normalizador existente: exige pelo menos um evento canônico `paid`, sem confundir reembolso/chargeback que ainda inclua status genérico `completed`. Payloads são usados apenas internamente para prova e nunca aparecem na resposta. Pedidos manuais sem esse comprovante são omitidos. Outros gateways não são incluídos até possuírem comprovação equivalente. Não há alteração de faturamento, replay, cobrança ou inserção de pedidos. Resultado manual “funcionou” não entra nessa leitura.

Nenhum gateway atual devolve um identificador autenticado desta tentativa. Portanto TODAS as aprovações desta primeira versão ficam com operador não determinado. Não se atribui pelo último/único clique, e-mail, telefone, visitor ID, associação heurística ao front ou proximidade temporal. O painel distingue aberturas por usuário de aprovações gerais não atribuídas. Não se deve chamar estas aprovações de receita recuperada pelo operador.

As aprovações mostradas começam na primeira abertura registrada na oferta. Listas e resumo são limitados às últimas N linhas (`summary_scope=displayed_rows`, máximo 200), separados por moeda original. Não existe soma de USD/EUR/BRL nem taxa de conversão causal inferida. Status posterior de reembolso não desfaz o fato histórico de aprovação; isto não é receita líquida.

## Segurança e navegação

ACL da oferta precede qualquer consulta. Dono/admin pode consultar os logs da oferta. Membro autorizado vê somente suas próprias aberturas, sem aprovações gerais ou resumo de outros operadores. ID do operador vem exclusivamente da sessão autenticada.

Links são reconstruídos do pedido e da etapa do mesmo projeto: VendePay usa identidade confirmada criptografada, SyzePay preserva a validação existente de sessão/página/step. O modo de visualização de etapa já comprada preserva `force=1`. Destinos precisam ser HTTPS e sem credenciais embutidas. O navegador não pode enviar uma URL arbitrária.

## Contrato

- `POST /offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/open`, `{click_id,view_only?}` → `{attempt_id,opened_at,url}`.
- `GET /offers/:id/tracking/upsell-operator-logs?limit=50` → `scope`, `attempts`, `approvals`, `summary`, `unattributed_totals`, `summary_scope`, `attribution_notice`.

Migração aditiva 098 cria apenas `tracking_upsell_operator_attempts` e seus índices. Histórico financeiro, payloads e webhooks permanecem intactos.
