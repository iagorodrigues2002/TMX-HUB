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

- API `c0e9d7d7817ecb9c30bae9cfb43c59ed8757c15e`, deploy Railway `dba7c7af-68fa-4d26-a009-da9a77496784`: SUCCESS; migração 119 aplicada.
- Web `e43003897cea0a20ab199a9036e9d659941edf71`, deploy `dccc0a7a-7a7e-4b6c-98c9-075b6243f6d2`: SUCCESS.
- Prévia e aplicação revisadas: 2.241 créditos examinados, 69 alterações; digest `a4989f436559ee7cf69bde2f90217ebe5022740f9eb8f60a7116357466824ca0` idêntico.
- 65 novas atribuições: outubro +21 / R$ 3.869,80; novembro +44 / R$ 9.295,16. Outras quatro vendas mantiveram o operador e receberam a data da reabertura real, sem incrementar a contagem mensal.
- Diário persistente: 69 revisões, IDs 70–138. Comparação dos pedidos completos afetados antes/depois: idênticos; nenhuma alteração financeira.
- Repetição das 69 correções em transação de validação com rollback: zero alterações adicionais.
- Exemplo do print: Upsell 3 agora creditado a Douglas, motivo `confirmed_reopen`, clique real 10/11 às 13h23min55s de Brasília.

API autenticada do live, três respostas HTTP 200, `date_basis=click`:

| Período | Antes | Depois | Valor bruto operacional depois |
|---|---:|---:|---:|
| Outubro | 521 | 542 | R$ 88.928,43 |
| Novembro até 10/11 | 329 | 373 | R$ 85.696,63 |
| 10/11 | 19 | 25 | R$ 7.459,44 |

Novembro inclui o dia 10; os períodos não devem ser somados. Valores são atribuição de vendas existentes, não nova receita. Login público HTTP 200; autenticação sem token HTTP 401 JSON, preservando o proxy privado. Não foi realizado pagamento de teste no live nem reenvio histórico a serviços externos.
