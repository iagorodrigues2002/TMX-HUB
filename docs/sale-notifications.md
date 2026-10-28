# Avisos de venda no painel

`GET /v1/tracking/sale-notices/stream` é um stream SSE autenticado por Bearer,
consumido por `fetch` para não colocar credenciais na URL. A rota JSON anterior
permanece disponível para clientes antigos.

- Uma leitura compartilhada por instância da API, a cada segundo, identifica
  pedidos pagos. O lote é enviado aos destinatários após conferir autenticação,
  acesso à ferramenta e ofertas permitidas. Não inclui dados do comprador.
- O cursor inicial usa o relógio do servidor. Uma conexão nova não mostra vendas
  anteriores à entrada. Reconexões retomam o cursor e IDs já vistos são deduplicados.
- Há sobreposição de 60 segundos nas leituras para transações que terminem entre
  consultas. Mantém-se a base de elegibilidade existente: `occurred_at` do pedido;
  isto não é uma fila durável de mudanças de status nem uma notificação push do SO.
- A consulta é somente leitura; não altera webhooks, pedidos, conversões ou envios.
- Heartbeats revalidam acesso a cada 15 segundos. Erros encerram o stream, com
  reconexão do cliente entre 1 e 10 segundos. Conexões são renovadas em 5 minutos.
- O cliente não pausa o stream ao ocultar a aba. Suspensão do dispositivo, ausência
  de rede ou encerramento do navegador ainda impedem exibição imediata.
- Mais de uma aba do mesmo usuário compartilha deduplicação local, com Web Locks
  quando disponíveis. Preferências de som e avisos continuam individuais.

Verificar após publicação: saúde da API, resposta imediata `text/event-stream`
através do proxy Next, heartbeats sem buffering, ausência de novos 4xx/5xx,
e funcionamento das telas sem iniciar vendas/conversões de teste.
