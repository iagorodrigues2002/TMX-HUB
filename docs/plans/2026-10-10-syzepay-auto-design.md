# Aprendizagem conservadora da classificação SyzePay

Usar apenas exemplos classificados manualmente, isolados por conexão, oferta assinada pelo token TMX, loja, tipo do provedor e moeda. Valor deve estar a até 0,5% do exemplo (mínimo dois centavos); fora disso permanece pendente. Preço não identifica produto, portanto conflito entre etapas permanece manual. Não inferir SKU nem etapa desconhecida.

Processar assinaturas verificadas e order.paid aprovado em ciclo de 15 segundos, fora da rota HTTP. Reutilizar transação idempotente e destinos existentes. Marcar origem automática no produto interno para não treinar novamente com inferências e expandir margens por deriva. Revalidar ownership e oferta em cada classificação. Não mudar regras de Purchase front-only.
