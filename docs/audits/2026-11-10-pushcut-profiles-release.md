# Publicação dos perfis Pushcut

## Verificação antes do deploy

- Web: 432 testes, zero falhas/skips; build de produção aprovado.
- API: 862 testes únicos verificados. A suíte com PostgreSQL/Redis descartáveis teve 861 passes, zero skips e uma falha de sandbox no teste HTTP real (`listen EPERM`). O arquivo de streaming foi executado separadamente com loopback autorizado e passou seus nove testes, incluindo o teste bloqueado. Artefatos: `.runtime/tmx-db-qa-20261110-89769f84/` e `.runtime/pushcut-release-http-test.log`.
- Perfis: última execução dedicada passou seis testes PostgreSQL, incluindo permissão de Pushcut por empresa, criptografia, pausa, múltiplas ofertas, captura desabilitada, conversão sem duplicação e rejeições sem gravação parcial. `.runtime/pushcut-release-profiles-final.log`.
- Worker e payload: 12 testes com HTTP simulado, sem notificações externas. Cobrem seleção de estágio, valor oculto, dispositivos, front, opt-out legado, destinos excluídos e erro do gateway com retry.
- API e web: builds e verificação de tipos aprovados; Biome nos arquivos da alteração e diff sem erros.
- Quatro fixtures anteriores de tarefas/calls foram alinhadas com os métodos Redis `smembers`/`lrange` usados pelo centro de notificações. Nenhuma asserção foi removida; a correção é somente de testes.
- Antes da publicação, os cinco destinos Pushcut de produção estavam ativos, com 1.170 entregas concluídas nos sete dias consultados. A consulta foi somente leitura, sem copiar credenciais.

## Sequência e reversão

1. Publicar API/migração 118 antes do web. Confirmar schema, health/readiness e endpoints autenticados.
2. Publicar web e verificar o destino privado do proxy da API e o fluxo de login.
3. Preservar os cinco destinos anteriores e seus segredos. A conversão para perfil será uma ação explícita do usuário; não reenviar compras históricas.

A migração é aditiva e mantém destinos legados com política nula e valor visível por padrão. Para reverter apenas a interface, manter a API nova. Se for necessário reverter também a API, pausar primeiro os destinos com `profile_id IS NOT NULL`: o worker antigo desconhece filtros e ocultação de valores. Não apagar tabelas nem histórico para reverter.

## Limite

Não foi enviado um push real de teste ao dispositivo. Os testes do novo payload usam HTTP simulado; entregas reais anteriores foram conferidas em modo somente leitura. Não houve configuração de destinatários reais durante a validação.

## Estado da publicação

Aguardando os deployments desta entrega.
