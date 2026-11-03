# Reembolsos por recebimento — validação local

## Causa e correção

A VendePay pode repetir `paid_at`/`createdAt` da compra no webhook de devolução. O upsert gravava essa data em `refunded_at`/`chargeback_at`, consumidos pelos resumos financeiros. A recuperação de evidências de prazo não alterava esses campos.

O upsert agora usa `webhook_receipts.received_at`, limitado à conexão do recibo. Reenvios e processamento fora de ordem preservam o primeiro recebimento. A data da compra continua separada. A apresentação mantém o horário de São Paulo.

A recuperação histórica foi corrigida para considerar somente recibos processados vinculados ao mesmo pedido, conexão e projeto, dentro da oferta autorizada. Corrige apenas datas: não altera status, valores, atribuição, nem dispara conversões. Recibos ausentes não geram datas inventadas. Adaptadores Explodely não entram nesta recuperação histórica da VendePay.

## Evidências

- Testes PostgreSQL com criação/remoção de fixtures sintéticas: aprovação, devolução, reenvio e processamento fora de ordem; um único pedido e valor preservado.
- Recuperação histórica: dry run, aplicação, idempotência e isolamento entre contas/ofertas.
- Teste de virada do dia UTC → São Paulo.
- Typecheck da API passou.
- Banco local: 3 ofertas, 18 pedidos VendePay, 6 devoluções e 24 recibos processados; nenhuma data existente precisou ser alterada.

## Limite de entrega

Somente localhost. Histórico e código em produção não foram alterados. Antes do deploy, executar dry run por oferta no histórico real e revisar a cobertura dos recibos; totais por período poderão mudar de data, sem mudar o principal das devoluções.
