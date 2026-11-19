# Coluna de origem das devoluções

## Base recuperada

Web live anterior: `f982ea82-4523-448a-b4ed-346d7f11497c` (16/11, Cofre: feedback e cadastro de login).
API preservada: `c2783f02-c32b-472a-967b-04d445bec513` (Cofre: ID fixo para distribuição interna).

Reconstrução da Web sobre `cdf74a1844a1ddf9aadb295b81ac9058609d072d`, seguindo os registros de publicação de 16/11: menu/push, manifesto Android e ícones, company-members, página cofre/conectar e componente company-vault. Os arquivos públicos foram comparados por SHA-256 com o live: cinco correspondências. Esta base recupera a Web; não deve ser usada para republicar a API sem incorporar separadamente seu Cofre.

## Alteração

Auditoria mostra `assisted` como Com clique, `natural` como Sem clique e origem ausente/desconhecida como Não identificado. Usa classificação operacional existente, incluindo sequências atribuídas; não representa clique de anúncio Meta. Não muda valores, atribuições ou registros.

## Validação

- PostgreSQL 16 descartável, tmpfs e porta local, somente dados sintéticos; migrations executadas explicitamente nesse banco, sem iniciar API/workers.
- Fixture receipts ganhou tracking_fee_settings, requerida pelo carregador de tarifas.
- 14 testes API aprovados sem skips; assert adicional confirma a origem de cada item retornado pela rota.
- 21 testes Web aprovados sem skips; typecheck aprovado.
- Leitura autenticada do live em 19/11: HTTP 200, 31 devoluções, 18 naturais e 13 assistidas, nenhuma origem ausente. Nenhum comprador ou segredo no recibo.
- Publicação exclusivamente do serviço Web; nenhuma migração ou alteração de dados em produção.
