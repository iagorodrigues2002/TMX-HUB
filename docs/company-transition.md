# Transição de contas legadas para empresas

A migração 109 é apenas DDL. Não deduzir empresa a partir de nome, domínio de email,
nome da oferta ou compartilhamentos antigos. O procedimento abaixo é separado do boot:
não inicia workers, não altera vendas, não envia notificações e não escreve no Redis.

## Plano revisado

Construir um JSON protegido fora do Git com todos os usuários e ofertas do inventário:

```json
{
  "globalAdmins": ["ID_IAGO", "ID_LUCAS"],
  "standaloneUsers": ["ID_VIDEO_STUDIO"],
  "onboardingUsers": ["ID_CONVIDADO_COMPLETO_SEM_EMPRESA"],
  "roleChanges": [{"userId": "ID_DOUGLAS", "from": "admin", "to": "user"}],
  "companies": [{
    "id": "UUID_DA_EMPRESA",
    "name": "TMX",
    "createdBy": "ID_IAGO",
    "legacyCallIds": ["UUID_CALL_JA_AGENDADA_E_REVISADA"],
    "offers": [{"id": "ID_OFERTA", "ownerUserId": "ID_IAGO"}],
    "members": [{
      "userId": "ID_IAGO", "role": "owner", "status": "active",
      "tools": [], "allOffers": true, "offerIds": []
    }]
  }]
}
```

O exemplo é incompleto deliberadamente, não deve ser aplicado. Acrescentar Lucas e
Douglas na TMX; conservar os IDs existentes das duas empresas de Yola, com vínculo
de proprietário em ambas. Proprietários/admins de empresa recebem ferramentas por
papel, limitadas pelo teto da conta. Colaboradores recebem ferramentas e ofertas
explícitas. Em 02/11/2026 o usuário autorizou Douglas a todos os acessos da TMX:
vínculo `admin`, ativo, `allOffers: true`, sem privilégio global. Aplicar junto à
API empresarial, nunca rebaixar a conta antes de o acesso por empresa funcionar.
Usuários somente
Video Studio permanecem standalone com teto de ferramentas existente obrigatório.
Convidados completos sem empresa exigem classificação/onboarding, não entram como
standalone irrestrito. A rotina bloqueia qualquer conta ou oferta esquecida.

## Execução controlada

1. Conferir IDs pelo inventário autorizado, sem exportar hashes de senha ou segredos.
2. Conferir roles globais: somente Iago e Lucas conforme a decisão do usuário.
   O manifesto pode declarar explicitamente o rebaixamento `admin → user` de Douglas,
   desde que já preveja vínculo empresarial ativo de owner/admin com todas as ofertas.
   Isso permite preparar o SQL sem retirar seu acesso antes da atualização da API.
   Promoções implícitas e divergências não declaradas abortam a rotina. A alteração
   do role no Redis continua separada e auditada; o auth revalida admins no Redis.
3. Configurar DATABASE_URL e REDIS_URL do mesmo ambiente via mecanismo seguro.
4. A partir de packages/api, executar `pnpm exec tsx scripts/transition-companies.ts /caminho/manifest.json`.
   Por padrão é somente leitura: nenhuma associação é gravada.
5. Em janela autorizada, publicar a API com `COMPANY_TRANSITION_WRITES_PAUSED=true`.
   Aguardar todas as réplicas nessa versão e a drenagem das antigas. O guard HTTP
   bloqueia cadastro, convites, edição/exclusão de usuários e ofertas, criação de
   empresas e alteração de seus vínculos. Retorna `503`, código
   `company_transition_writes_paused` e `Retry-After: 60`, antes do handler.
   Confirmar esse retorno com uma requisição deliberadamente inválida (sem dados
   pessoais) de cadastro e outra de edição de oferta: nenhuma deve alcançar o
   handler. Não basta desabilitar botões no frontend ou passar a flag do CLI.
   Só depois dessa confirmação, refazer o inventário e o dry-run do passo 4.
   Redis e PostgreSQL não têm transação distribuída; a pausa precisa continuar
   durante o apply e a alteração de role. Coordenar também outros operadores/CLIs:
   o guard HTTP não congela gravações feitas diretamente nos bancos.
6. Reexecutar com `--apply --account-writes-paused`. Todas as escritas SQL são feitas
   numa transação com bloqueio das tabelas. Conflitos abortam sem sobrescrever direitos.
7. Após a API empresarial estar pronta, executar a alteração de role autorizada em
   operação separada. O script não escreve no Redis: `pendingRoleChanges` deve ficar
   vazio e `accountRolesReady` deve ser verdadeiro antes de concluir o corte.
8. Rodar novamente sem apply e comparar inventário/manifesto. Repetição é idempotente.
9. Testar sessões reais: Iago/Lucas globais; Douglas todas as ofertas da TMX, sem outras empresas;
   Yola alternando suas duas empresas sem acesso à TMX; Video Studio sem dados
   comerciais. Validar também notificações/push. Depois, definir
   `COMPANY_TRANSITION_WRITES_PAUSED=false`, aguardar todas as réplicas e validar
   a criação/edição autorizada de ofertas no procedimento aprovado de homologação.
   Não criar vendas, conversões ou novos registros comerciais apenas para testar.

### O que continua disponível durante a pausa

Login, consultas, alteração de senha, preferências pessoais, notificações,
webhooks dos gateways, captura `/track`, ingestão/sincronização de métricas e
workers de vendas/conversões continuam operando. O guard não pausa Redis nem
PostgreSQL e não é um modo geral de manutenção. Seu padrão é `false`.

As mutações da agenda (`POST /calls`, `PUT /calls/:id`, cancelar/concluir) também
ficam pausadas para manter os participantes da call revisada estáveis durante sua
associação à empresa. Os recibos e claims de `/call-automation/*` e as entregas
nativas **não** são bloqueados: seus handlers leem o corpo atual sob `FOR UPDATE`,
e a transição bloqueia `managed_calls` antes de validar e adicionar `companyId`.
Assim, os recibos preservam o vínculo sem interromper confirmações de mensagens.
Isso exige a versão nova em todas as réplicas antes do apply, não apenas no web.

Se o apply falhar, manter a pausa e resolver a divergência; não rebaixar usuários
nem remover tabelas. Depois da alteração de role, não restaurar privilégio global
de Douglas como estratégia de rollback. Preferir correção progressiva com os
vínculos preservados. A execução deve registrar início/fim da pausa e o resultado
do dry-run, sem segredos, hashes de senha ou dados pessoais desnecessários.

## Limites da validação atual

Conferência remota somente leitura de 03/11/2026: 17 usuários e 19 ofertas, sem
diferenças de IDs/proprietários em relação ao manifesto revisado. O usuário
confirmou preservar RWS_TTK (`01M47HMSG5NF3HMTWY1CTWVGRM`) e vinculá-la à TMX,
apesar do rótulo legado `Lucas`. Não excluir nem omitir essa oferta. Douglas ainda
tem role global `admin`; seu rebaixamento é uma etapa explícita do corte. O schema
remoto estava na migração 107. Este inventário deve ser refeito com a pausa ativa.

Testes automatizados usam dados sintéticos e PostgreSQL local. Nenhuma migração de
contas reais foi aplicada. O caminho legado para ofertas ainda não vinculadas continua
existindo; o manifesto exige cobertura integral das ofertas atuais antes da transição.
Novas ofertas exigem empresa explícita quando há banco configurado; a API verifica
o vínculo de proprietário/admin antes de gravar a associação. A criação não serve
como atalho para convidados completos que ainda precisam criar sua empresa.
Na homologação, validar também criação, edição e exclusão sem bindings órfãos.
Não afirmar isolamento completo de produção até concluir todos os passos acima.

## Tarefas, calls e Discord

Tarefas e calls nativas carregam `companyId`. Gestores veem apenas suas empresas;
as notificações exigem participação e vínculo ativo. Suspensão não reabre fallback
legado. Calls já agendadas continuam visíveis sem importar tarefas do ClickUp.
Para manter uma call legada visível aos colaboradores migrados, declarar seu ID
em `legacyCallIds` da empresa. A rotina verifica participantes ativos/globais e
rejeita outra empresa ou modo nativo; adiciona somente `companyId`, sem alterar
revisão, horário, participantes, recibos ou publicador. Não inferir essa associação.

Para empresas, configurar canais Discord com prefixo explícito de `companyId`
(por exemplo `UUID:Calls`, `UUID:Spy` ou `UUID:Tráfego:OFERTA`). Não há fallback para
o canal global: ausência de mapa deixa a entrega pendente em vez de enviar dados a
outra empresa. Conferir esse mapa antes de ativar o worker nativo.

O bridge antigo de calls deve processar somente registros legados; o worker nativo
processa apenas registros nativos. Não ativar um segundo publicador para a mesma
entidade. A transição externa do n8n/Discord e seus recibos continuam uma etapa de
publicação separada da validação local, sem envio real durante os testes.
