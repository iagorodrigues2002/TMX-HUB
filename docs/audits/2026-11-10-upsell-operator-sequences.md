# Correção de sequências e reaberturas de upsell — 10/11/2026

## Diagnóstico verificado

No exemplo PJR_ENG das 13h24, o Upsell 2 e o Upsell 3 pertencem ao mesmo front e à mesma conexão VendePay. Douglas abriu a etapa 3 antes do pagamento, mas o registro estava marcado `view_only`; a regra anterior descartava esse clique. Redirecionamentos também podiam aprovar a etapa seguinte sem um novo clique específico da etapa.

O usuário confirmou que o período deve continuar usando a data do clique. Os 26 relatados eram o acumulado do dia e podem ter sido contados incorretamente. Até o horário do print, foram identificados seis vínculos faltantes que explicam 19 → 25; não será inventado um 26º vínculo.

## Escopo e garantias

- Migração 119, callbacks VendePay/SyzePay, relatório operacional e identificação visual de sequência nas notificações.
- Reabertura autenticada ou abertura de etapa anterior até cinco minutos antes de um pagamento confirmado; somente no mesmo front, projeto e gateway, após a compra do front.
- Alternativamente, predecessor pago na mesma conexão, até 120 segundos antes, com etapa inferior e operador comprovado.
- Conflito entre operadores permanece sem nova atribuição; operador já creditado não é transferido para outra pessoa.
- Nenhum clique fictício, alteração de pedido/valor financeiro, reenvio à Meta, cobrança ou notificação externa histórica.
- Recontagem histórica somente de Douglas, de outubro até 10/11. Prévia transacional com rollback; aplicação exige o digest exato da prévia revisada e mantém diário durável de antes/depois.
- Histórico de cliques disponível a partir de 15/10, 22h18 de Brasília. Não é possível reconstruir autoria anterior sem evidência.

## Validação local

- Suíte API completa em PostgreSQL/Redis descartáveis: 876 testes, 873 passaram; dois fixtures da central de notificações foram corrigidos e os três testes desse arquivo passaram no banco isolado. O teste HTTP bloqueado pelo sandbox passou em execução separada com loopback permitido (9/9).
- Após os guardas adicionais, os 16 testes específicos de PostgreSQL passaram: exemplo real, sequência, pagamento de teste, reabertura, expiração, conflitos, isolamento, meia-noite/mês, retiming, idempotência, rollback/digest, callbacks invertidos e concorrentes.
- Web: 433 testes passaram, zero ignorados. Tipos API e builds API/web passaram.
- Biome dos arquivos alterados e diff sem erros antes da publicação.

## Aplicação

Pendente de registrar o deploy e os resultados exatos da simulação/aplicação em produção. A prévia de dados acima não foi apresentada como aplicação concluída.
