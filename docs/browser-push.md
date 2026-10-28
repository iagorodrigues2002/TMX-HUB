# Notificações fora do TMX

Referências: [Web Push](https://github.com/web-push-libs/web-push),
[requisitos de instalação e permissão no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Escopo e ativação

Web Push é opcional por dispositivo, no menu do perfil em **Fora do TMX**.
A permissão só é solicitada após clique. Desativar ou sair da conta desliga
o dispositivo localmente e remove sua inscrição do servidor quando há rede.
Não altera os destinos de Meta, TikTok, Google, UTMify ou Pushcut.

Os avisos externos são genéricos: **Nova venda aprovada · TMX**, sem comprador,
oferta ou valor na tela bloqueada. Dentro do TMX, permanece o popup com o som
personalizado. O service worker não cria aviso nativo se o TMX estiver em foco.

## Configuração necessária antes de publicar

1. Gerar um par VAPID por ambiente com a biblioteca `web-push` já instalada.
   Guardar a chave privada no gerenciador de segredos, nunca no repositório.
2. Configurar somente na API: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` e
   `WEB_PUSH_SUBJECT` (URL de contato; padrão `https://theminex.com`). Usar uma
   `TRACKING_ENCRYPTION_KEY` estável para criptografar inscrições armazenadas.
3. Aplicar a migration `104_browser_sale_push.sql`, somente com autorização de
   publicação. Ela acrescenta tabelas e um trigger mínimo após aprovação; não
   faz backfill nem altera pedidos ou payloads existentes. Validar primeiro em
   banco descartável. Chaves ausentes mantêm o recurso desativado.
4. Publicar API e web juntos. Cada pessoa ativa em seu dispositivo e aceita a
   permissão. No iPhone/iPad compatível, adicionar o TMX à Tela de Início primeiro.

O código não gera nem publica chaves automaticamente. Trocar o par VAPID exige
reativar as inscrições existentes. O navegador fornece seu serviço push; os
endereços aceitos são FCM, Mozilla e Apple, com HTTPS e validação de DNS/IP.

## Entrega, privacidade e limites

- Aprovações futuras criam um evento único por pedido, na mesma transação. Reenvios
  de `paid` não criam novos eventos. Um rollback não deixa aviso órfão.
- Uma fila separada tem identidade `(pedido, inscrição)`, lease de processamento
  e no máximo três tentativas. O worker não depende de usuários com o site aberto.
- Autenticação atual e acesso à oferta são conferidos antes de cada envio. A
  inscrição é criptografada; endpoints e segredos nunca aparecem em logs.
- Dispositivos expirados (404/410) são removidos. Inscrições inativas expiram em
  90 dias; eventos e seus comprovantes são removidos após 90 dias.
- Não há backfill: inscrições novas não recebem vendas anteriores à ativação.
  A entrega expira em 60 segundos para evitar alertas antigos após longos períodos
  offline. O service worker também deduplica IDs em IndexedDB por 24 horas.
- O clique abre o TMX, que continua exigindo login para exibir os detalhes.
- Aceitação pelo provedor não prova exibição pelo sistema. Permissões, economia de
  energia, navegador encerrado, falta de rede e Não Perturbe podem impedir ou atrasar
  avisos. O som e o visual externos são definidos pelo sistema operacional.

## Validação segura

Testes unitários usam inscrições e usuários fictícios, sem envios externos.
`browser-push-postgres.test.ts` exige `BROWSER_PUSH_TEST_DATABASE_URL` apontando
exclusivamente para um banco local descartável chamado `tmx_push_test`.
Não iniciar `api dev/start` com variáveis reais para testar: há workers de negócio.
Após publicação, a confirmação de permissão e um teste push explícito no dispositivo
devem ser feitos pelo usuário; não fabricar vendas para validar notificações.
