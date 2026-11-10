# Pushcut por destinatário

Uma credencial por perfil pessoal, reutilizada entre ofertas que o usuário pode gerenciar. Cada perfil guarda nome do destinatário, secret criptografado, nomes das notificações, dispositivos, tipos de venda selecionados, visibilidade do valor e status. Front e cada estágio de upsell são independentes.

Os perfis pertencem ao usuário autenticado. Ler ou alterar exige acesso de gestão à oferta de entrada; cada oferta vinculada é validada no servidor. A credencial nunca volta pela API. Manter o campo vazio em uma edição conserva a credencial existente.

A tela fica em Integrações → Alertas Pushcut. Os perfis são exibidos em cartões, com ofertas selecionadas por checkbox e estágios 1–5 em destaque; outros estágios ficam em uma seção expansível. Pausar conserva as seleções. Uma oferta com captura pausada pode ter suas preferências preparadas; uma oferta sem projeto de rastreamento exige configuração prévia.

A migração 118 adiciona perfis e referências opcionais nos destinos existentes. A configuração central é projetada nos destinos por oferta dentro de uma transação, mantendo IDs e histórico das entregas. Webhooks VendePay, classificação Syzepay, reenvio de histórico e worker respeitam os tipos escolhidos. O worker reavalia as preferências antes de enviar e remove o valor do payload quando solicitado.

Configurações anteriores continuam funcionando e podem ser convertidas explicitamente em perfil, reutilizando a credencial do servidor. Nessa conversão, destinos antigos equivalentes nas ofertas selecionadas são pausados para evitar duplicação; nenhum histórico é apagado e nenhum histórico é reenviado automaticamente.

Publicação: aplicar migração 118 e atualizar API/workers antes do web. A primeira validação ocorreu na prévia local; a publicação foi autorizada após a revisão dos testes.
