# Gestão empresarial persistente — homologação local

Implementação local em 02/11/2026. Nenhuma publicação ou migração de dados reais.

## Implementado e verificado

- Migration109 aplicada exclusivamente em tmx_live_preview_20261102: empresas UUID, memberships, grants de ofertas e auditoria.
- /empresa/membros usa API persistente; /preview/membros redireciona. Salvar confirmado visualmente no navegador.
- Papéis owner/admin/member empresariais não mudam role global. Mudanças serializadas por empresa protegem último proprietário ativo.
- OfferStore consulta vínculos explícitos; nomes iguais não unem empresas. memberIds legado não autoriza.
- Login, JWT e auth/me retornam ferramentas efetivas. Cada request revalida memberships; [] nega, undefined preserva legado.
- Bloqueados payloads brutos e execução de IA para meros leitores; empresas não podem promover permissões globais.
- Conta member@native.tmx.test: somente DEMO_PJR_ENG. DEMO_SLM_DE por ID direto retorna404; administração de membros retorna403; criar empresa para elevar acesso retorna403. Suspensão retorna401 no mesmo token; restaurada ao terminar.
- Banco possui TMX · Homologação com duas ofertas vinculadas. É dado sintético, não importado do live.
- Testes finais: 193 web; 30 focados API incluindo PostgreSQL. Rodada adicional de 40 testes de autorização/refunds passou. Typecheck API e web passaram.

## Limites de segurança deliberados

- Ofertas legadas não vinculadas preservam owner/globaladmin. Nenhuma migração por nome de empresa ou usuários reais é automática.
- Criação de ofertas pela rota legada fica bloqueada para usuários empresariais não globais até haver fluxo explícito de criação com empresa. Vinculação das ofertas existentes exige proprietário e owner empresarial.
- Tarefas/calls legadas não têm empresa: gestão permanece globaladmin. Notificações de tarefas/calls e alteração de status dessas tarefas ficam bloqueadas para usuários empresariais não globais; não inferimos empresa por participante. Vendas seguem ofertas autorizadas.
- Convites novos, onboarding completo e migração de tarefas/calls precisam integração empresarial antes de liberar esses fluxos. O formulário atual vincula contas já existentes por e-mail, não envia convite.
- Admin global continua exceção explícita, inclusive na homologação. Não converter Lucas/Douglas ou qualquer usuário real automaticamente.
- Não certifica isolamento de todos os módulos legados da plataforma. Sem deploy, importação live, workers comerciais ou envios externos.
