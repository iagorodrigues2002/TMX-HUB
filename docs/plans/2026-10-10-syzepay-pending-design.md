# Classificação SyzePay por oferta

Pedido: mostrar seletores de oferta e front/upsell, com apenas pedidos não classificados na área principal.

Preservar a identidade visual existente. Agrupar pedidos pendentes pela oferta identificada no token TMX, mantendo um grupo separado quando não houver vínculo. Exibir os dois campos com rótulos visíveis. Pedidos processados saem da fila de classificação e permanecem no histórico recolhido. Não modificar pedidos, destinos ou reprocessar conversões nesta alteração de interface.

Os webhooks reais examinados não informam produto: não converter store_id, pedido ou funil em SKU. Mostrar explicitamente “Produto: não informado pela SyzePay”. A classificação permanece por pedido até obter identificadores reais do produto.
