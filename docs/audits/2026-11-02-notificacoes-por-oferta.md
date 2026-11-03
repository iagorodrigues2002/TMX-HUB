# Notificações por oferta — validação local

Escopo: preferência pessoal, lista de ofertas autorizadas, popup/som, central e push. Sem deploy, sem vendas ou envios reais, sem mudanças nos papéis de contas reais.

## Comportamento

- Menu da conta → Notificações por oferta para todos os usuários autenticados.
- Seleção explícita de ofertas; vazio significa nenhuma, nunca todas.
- Seleção salva no PostgreSQL por usuário (migração 111), sem alterar outros usuários.
- Depois de salvar, novas ofertas não são habilitadas automaticamente.
- Ofertas selecionadas são sempre intersectadas com as permissões atuais de empresa/oferta.
- Admin global pode selecionar ofertas globais; admin de empresa só tem as da sua empresa; colaborador somente as concedidas.
- Preferência antiga “own” preservada até a primeira gravação explícita. Não muda o acesso de admins reais.
- Ferramentas explicitamente vazias bloqueiam notificações, inclusive push. Suspensão é consultada sem cache.
- Stream revalida antes de entregar dados; mudança no menu limpa fila/som e reinicia o stream local. Central é recarregada. Avisos já entregues ao sistema operacional não podem ser recolhidos.

## Evidência

- 48 testes API: preferências, empresas, grants, membros, central, polling, stream, push. PostgreSQL isolado `tmx_tasks_test`; fixtures sintéticas.
- 20 testes web: serialização, central, stream, dedupe, áudio, service worker.
- Typecheck API e web sem erros.
- Navegador local: admin visualiza 3 ofertas sintéticas; desativar todas mostra todas desmarcadas; ativar uma mantém as outras desmarcadas.
- Login e endpoints locais; nenhuma conexão a provedor push para estes testes (envio mockado).

## Limites antes de publicar

Aplicar migração 111 juntamente com API; verificar migrações empresariais 109/110, vínculos reais das ofertas por ID e papéis de todas as contas. Somente os admins globais aprovados devem manter `user.role=admin`; papéis empresariais pertencem a `company_memberships`. Não foi feita auditoria universal de todas as rotas nem confirmação das permissões no live. Testes não provam ausência absoluta de vulnerabilidades.
