# Último clique nos botões de upsell

Design aprovado: exibir usuário e horário da última abertura abaixo de cada etapa, inclusive depois da compra. Novas aberturas atualizam a projeção, mantendo o histórico append-only existente.

O GET de identidades retorna `links[].last_opening` (`operator_id`, `operator_name` nullable, `opened_at`) ou `null` quando não há registro visível. Uma única consulta lê as tentativas somente do projeto, pedidos da página (máximo 100) e etapas habilitadas. `DISTINCT ON` usa horário descendente e ID descendente para desempate. Os nomes são consultados uma vez por operador distinto, sem retornar e-mails.

Admin vê a última abertura global. Não-admin vê apenas suas próprias aberturas, após a autorização estrita da oferta. Resposta privada e sem cache. Nenhuma compra é atribuída ao último clique, nenhum pagamento é criado, nenhum histórico antigo é inventado. VendePay e SyzePay mantêm o fluxo existente de abertura, inclusive o modo visualização de comprado. Não requer migração.
