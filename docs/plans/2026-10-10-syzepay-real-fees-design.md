# Taxas reais SyzePay

Configurar a conexão SyzePay TMX com fee_source=webhook. Calcular taxas pelo fee_amount convertido e preservado em cada pedido; não deduzir porcentagem ou tarifa fixa de amostras. Valores ausentes/inválidos são sinalizados como incompletos. Não usar taxas VendePay.

Manter reserva e penalidades configuradas separadamente: o webhook recebido não identifica reserva nem encargos de devolução. Não chamar a diferença entre bruto, fee_amount e net_amount de reserva. Formulário informa origem webhook, desativa percentual/tarifa fixa nesse modo e identifica reserva como configurada, não comprovada. Sem alterar pedidos ou reenviar conversões.
