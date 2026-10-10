# Upsell Intelligence por gateway

Uma URL por gateway em cada etapa, guardada em connection_destinations com chaves gateway:provider. Destinos específicos das contas VendePay têm prioridade e não são alterados. Campos Paysight/Explodely permitem cadastro, sem prometer recuperação de pagamento sem contrato.

SyzePay preserva checkout_session_id do webhook. A lista gera links somente quando a URL SyzePay estiver cadastrada e a compra tiver sessão. Consulta autenticada e restrita à oferta/pedido valida por GET a sessão live/completed e a URL exata em funnelSteps. Somente então devolve a URL com s e step. Nunca chamar POST upsell nem fazer cobranças automaticamente. Sessões antigas podem ser preenchidas a partir dos webhooks processados originais, sem reenviar pedidos.
