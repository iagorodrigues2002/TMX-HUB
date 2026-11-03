# Financeiro — integração somente leitura

Implementação local em 02/11/2026. Não publicada; nenhuma conta real conectada.

## Cadastro

Empresa → Financeiro → Integrações. Administrador/proprietário da empresa informa a chave, valida os perfis retornados, seleciona a conta e confirma. Chaves ficam criptografadas por AES-GCM usando `TRACKING_ENCRYPTION_KEY`; nunca retornam nas consultas. É necessário preservar essa variável ao publicar. Uma conta por provedor por empresa; a mesma identidade externa não pode ser vinculada a duas empresas.

## Dados

- Migração `113_company_finance.sql`: conexões, saldos e movimentações separados por empresa.
- Primeira consulta parte de 90 dias anteriores ao cadastro, avançando em janelas de sete dias com checkpoint persistente.
- Depois de alcançar o presente, o worker consulta a cada 15 minutos, sobrepondo dois dias para atualizações recentes. Não importa os 90 dias novamente.
- Falhas não avançam o checkpoint nem apagam dados. Lease no banco evita duas réplicas processando a mesma conta; desconectar invalida o lease e apaga a chave, mas preserva o histórico.
- Valores armazenados como `numeric`, moedas/ativos originais separados. Patrimônio da LootRush não é rotulado como saldo disponível. Não há soma de moedas distintas, cálculo automático de lucro ou criação de receita comercial.
- Saques vêm dos tipos identificados pelo provedor. Despesas exibe saídas a conciliar, não as classifica automaticamente como custo.
- Reserva e colaboradores permanecem disponíveis, agora no contexto da empresa selecionada.

## Wise

Personal API token; endpoints oficiais `2026Q4` de profiles, balances e balance-statements (COMPACT). Se o extrato responde 403, mantém saldo e informa cobertura limitada. Uma chave nova reavalia a cobertura. Não usa endpoints de pagamentos.

Documentação: https://docs.wise.com/guides/developer/auth-and-security/personal-api-token e https://docs.wise.com/api-reference/balance/balancelist

## LootRush

Bearer token. MCP apenas `getAccountHistory` (identidade da conta) e `getAccountBalance` (saldo). Histórico paginado em `history-api.lootrush.com/api/history`, resource=account, feature=account. Deduplicação por `uniqueHashId`, nunca apenas `id` (duas pernas de operação podem compartilhar id). Respostas incompletas/estimadas/repetidas e linhas sem identidade estável interrompem a importação em vez de presumir sucesso.

Documentação: https://docs.lootrush.com/api-reference/openapi.json e https://docs.lootrush.com/mcp-server

## Limites e validação antes de live

- Testes usam respostas sintéticas baseadas nos contratos oficiais. Falta confirmar respostas reais das contas após o usuário cadastrar chaves válidas; não reutilizar chaves expostas no chat.
- A homologação padrão bloqueia saída de rede. Para usar contas reais será necessário publicar após autorização ou autorizar um ambiente bancário de homologação com saída restrita. Não remover o isolamento global para contornar isso.
- O histórico importado é o extrato liquidado da conta, não inclui compras de cartão nem fila de saques pendentes. Atualizações retroativas anteriores à janela incremental precisam de conciliação específica; não afirmar cobertura integral desses casos.
- A documentação textual antiga da LootRush menciona limite de mil linhas; o OpenAPI atual diz paginação sem esse limite. Uma recusa por limite deve ser investigada antes de declarar a primeira importação concluída.
- API `server.ts` inicia o worker. A prévia HTTP isolada não inicia workers comerciais nem bancários.
- Não implementa pagamentos, transferências, criação de cartões ou acesso a PAN/CVV. Não ativa n8n nem altera webhooks comerciais.
