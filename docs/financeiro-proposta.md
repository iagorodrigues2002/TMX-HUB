# Financeiro por empresa — proposta local

## Escopo e referência

Revisão somente leitura das seis abas de [MX] - Financeiro: Resumo, Crescimento, Agosto 2026, Setembro 2026, Outubro 2026 e Novembro 2026. Foram consultados todos os intervalos da grade de cada aba pelo conector, com linhas vazias finais omitidas pelo Google. Nenhuma célula foi alterada. Esta é uma análise de estrutura e valores apresentados, não uma auditoria contábil de fórmulas ou comprovantes.

A planilha reúne despesas com responsável, comprovante, observações, ID de mensagem, valor/moeda original, PTAX, classificação fixa/variável e ID externo; entradas por dia; saldos Wise/LootRush; resumo mensal e projeções. Há lançamentos a classificar, cotações distintas e indicadores de crescimento ainda com corte em 26/10 apesar de lançamentos posteriores. Não importar cegamente saldos, projeções ou classificações.

## Navegação

Empresa → Financeiro (novo destino independente, ainda não implementado).
Empresa → Reembolsos e Chargeback (rota /reembolsos preservada; nome atualizado localmente).

## Página proposta

Cabeçalho: empresa selecionada, período, conta, moeda de exibição e última sincronização por fonte.

1. Resumo: saldo disponível confirmado, entradas externas do período, despesas pagas, resultado de caixa e valores em trânsito. Reserva do gateway aparece separada, identificada como estimativa, nunca somada ao disponível bancário.
2. Contas: cartões Wise e LootRush com valores por moeda, data de leitura, cobertura da integração e estado conectado/parcial/desatualizado. Saldo indisponível não vira zero nem é inferido de transferências incompletas.
3. Movimentações: data efetiva, conta, entrada/saída/transferência interna/taxa/estorno, descrição, responsável, categoria, fixo/variável/a classificar, valor original, equivalente BRL, status, ID externo e comprovante quando disponível.
4. Saques e conciliação: origem gateway, destino financeiro, valor solicitado, tarifas, valor recebido, datas e status solicitado/em trânsito/recebido/divergente. Sem API de origem, permitir registro manual identificado. Correspondências incertas ficam pendentes para revisão, nunca confirmadas apenas pelo valor.
5. Despesas: cadastro manual, comprovantes privados, categorias e recorrência prevista separada do pagamento realizado. Vincular um lançamento manual à transação importada sem duplicá-lo.
6. Evolução: entradas versus despesas e saldo por dia; distribuição por categoria; comparação mensal equivalente. Run-rate identificado como projeção simples, não previsão garantida; não chamar resultado de caixa de lucro contábil.
7. Integrações: campos de chave Wise e LootRush, nome da conta, testar acesso, sincronizar, substituir/revogar conexão. Indicar capacidades verificadas: saldo, transferências, extrato, cartões. Nenhuma chave retornada ao navegador após salvar.

## Regras financeiras

- Faturamento de vendas e entrada bancária são conceitos distintos: um saque do gateway não é uma segunda venda.
- Transferência entre Wise e LootRush tem duas pernas vinculadas e não gera receita/despesa consolidada; tarifas são despesas separadas.
- Valores monetários em precisão decimal/unidades menores, sem ponto flutuante binário para somas financeiras.
- Preservar BRL, USD e USDC como moedas/ativos distintos. Conversão de apresentação registra taxa, fonte e data; não assumir USDC = USD sem política explícita.
- Valores liquidados reais prevalecem sobre equivalentes estimados. Não recalcular histórico silenciosamente usando a cotação atual.
- Saldo observado é um snapshot com horário, não a soma de entradas desde uma data arbitrária. Conciliação exige saldo inicial, movimentos e saldo final por moeda.
- Idempotência por empresa, conexão, tipo de recurso e ID externo. Atualizar estados pendentes/estornados, sem criar nova movimentação a cada sincronização.
- Respeitar cancelamentos, transferências falhas e transações pendentes; separar previsto de efetivado.

## Wise

Documentação: https://docs.wise.com/guides/developer/auth-and-security/personal-api-token
https://docs.wise.com/api-reference/balance-statement/balancestatementget

O token pessoal de integração é documentado para conta business. Acesso depende do perfil, região e endpoint. A documentação restringe extratos e financiamento por token pessoal fora de US, CA, AU, NZ, SG e MY; não prometer extrato completo para conta brasileira. Primeiro testar permissões somente leitura. Histórico de transferências não comprova cobertura de todas as compras de cartão, depósitos e taxas. Quando incompleto, oferecer importação de extrato CSV com prévia e deduplicação e mostrar cobertura parcial. Não implementar pagamento ou funding.

## LootRush

Documentação: https://docs.lootrush.com/ e https://docs.lootrush.com/llms.txt

Docs oficiais identificam History API para cartões e conta, Withdraw API para saques e MCP com consultas de saldo e histórico. Usar apenas consultas permitidas. Confirmar payloads, paginação, escopos e cobertura da conta ao conectar; não confundir listagem de saques cripto com todos os movimentos bancários. Não habilitar criação de saques, cartões ou revelação de PAN/CVV.

## Segurança e operação

- Empresa obrigatória no backend e em toda chave de cache, conexão, lançamento e comprovante. Admin de empresa limitado à própria empresa; permissão financeira explícita para colaboradores.
- Chaves criptografadas no servidor, redigidas em logs e erros, sem exposição em localStorage, HTML ou retorno de API; ações de conexão e classificação auditadas.
- Endpoints de provedores fixos/allowlist; timeout, retentativas limitadas com backoff e paginação; sincronização assíncrona sem bloquear navegação ou processamento comercial.
- A primeira versão é somente leitura externa. Sincronização incremental com janela de sobreposição e atualização de estados; frequência ajustada às cotas, sem promessa de tempo real.
- Falhas conservam o último saldo com aviso e horário. Não conectar nem importar dados reais automaticamente durante o desenvolvimento local.

## Validação antes de liberar

Testar isolamento entre duas empresas, revogação imediata, não exposição de chaves, deduplicação manual/API/CSV, repetição de páginas, movimentos pendentes/estornados, taxas, câmbio, transferências internas, conta sem extrato, rate limit e falhas parciais. Conferir totais por moeda contra extrato de amostra autorizado. Sem disparar vendas, conversões, pagamentos ou saques de teste.

## Estado

Apenas o nome da navegação foi alterado: oito testes de navegação passaram. Financeiro, conexões e importação ainda são proposta. Nada publicado e nenhuma operação financeira executada.
