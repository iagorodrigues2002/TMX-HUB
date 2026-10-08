# Limite de validação automática de upsell

Pedido: interromper após duas validações sem sucesso e avisar que o registro foi descartado da validação.

Cada venda pode executar no máximo duas rodadas automáticas. Cada rodada verifica os candidatos e destinos configurados, mantendo o limite de concorrência existente. Recusas definitivas encerram já na primeira rodada. Falhas temporárias permitem apenas uma nova rodada. Jobs antigos com duas ou mais tentativas não são retomados; leases ativos são respeitados.

A interface mostra alerta de descarte por venda, sem apagar a compra ou afetar seu faturamento. Identidades confirmadas permanecem intactas. Recuperação manual continua separada da fila automática.

Verificação: teste da fronteira de tentativas, testes existentes de identidade e compatibilidade, typecheck API/Web e confirmação de deploy dos dois serviços.
