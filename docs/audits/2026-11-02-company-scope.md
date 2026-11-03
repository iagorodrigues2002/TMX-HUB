# Auditoria de escopo — Empresa, membros e financeiro

Data: 02/11/2026. Checkout: `native-task-management`, base `414e2b5` com mudanças locais.
Auditoria somente de código; sem consultas a dados reais, alterações remotas ou testes de autorização em produção.

## Conclusão

É seguro reorganizar a navegação agora. Não é seguro apresentar a reorganização como implementação de isolamento por empresa: o modelo atual ainda autoriza principalmente pelo proprietário da oferta e pelo papel global `admin`. A tela nova de membros é uma demonstração local, não uma fonte de permissões.

“Empresa” deve ser um agrupamento de operação, não um novo dashboard vazio nem um seletor que sugira filtrar toda a aplicação. Um destino deve ter apenas um lugar canônico no menu. Busca e atalhos contextuais podem apontar para esse mesmo destino.

## Estrutura mínima implementável

| Grupo | Entrada | Destino e comportamento |
|---|---|---|
| Empresa | Membros · prévia | `/preview/membros`, apenas em desenvolvimento e para os perfis que já podem acessar a demonstração. Manter “dados demonstrativos / permissões simuladas”. Não chamar `/admin?view=people` de membros da empresa. |
| Empresa | Tarefas e calls | `/tarefas`; mover a entrada existente de Admin, sem duplicá-la. Preservar requisito `admin`. A aplicação ainda lista tarefas/calls globais desse papel; informar isso até existir tenant real. |
| Empresa | Financeiro · devoluções | `/reembolsos`; mover de Ofertas, preservando `requiresTool: ofertas`. O conteúdo continua sendo Reembolsos e chargebacks, não um balanço empresarial completo. Explicar o escopo existente no próprio filtro. |
| Administração da plataforma | Usuários e acessos | `/admin?view=people`, global e exclusivo de `admin`. Distinguir claramente da proposta de membros por empresa. |
| Administração da plataforma | Convites / atividade | Manter o comportamento real; usar um único destino canônico por função. |
| Menu pessoal | Conta e segurança | `/settings`, retirando a duplicação do menu Admin. Mantém acesso pessoal, não gestão de empresa. |

O grupo Empresa pode ter botão de expansão sem navegar para uma página redundante. Não criar `/empresa` com cards que apenas repetem as mesmas entradas.

Se for necessário o rótulo curto “Financeiro”, acrescentar descrição explícita “Reembolsos e chargebacks” na navegação/página. Não anexar reservas sob o mesmo escopo sem reconciliar a seleção de ofertas. A reserva permanece onde já funciona até essa reconciliação.

## Evidências e limitações

### 1. Empresa ainda não é a fronteira de autorização

- `packages/api/src/services/offer-store.ts:19-26`: `canAccessOffer` e `canManageOffer` usam administrador global ou `offer.userId === userId`. Registros legados de compartilhamento não autorizam acesso.
- `packages/api/src/services/offer-store.ts:52-74`: empresa é `companyName` textual da oferta.
- Migrações têm `syzepay_company_connections` (`089_syzepay_company_inbox.sql`), mas a busca não encontrou uma entidade geral de empresas/membros/papéis empresariais usada pela autorização.
- `packages/web/src/app/preview/membros/page.tsx:5-9`: rota somente em desenvolvimento.
- `packages/web/src/components/admin/members-preview.tsx:523-525`: edição e “Administrador da empresa” são condições do simulador. Não promovem permissões reais.

**Não fazer nesta mudança:** transformar o papel global `admin` em administrador empresarial apenas alterando o nome; liberar colaboradores nas rotas atuais; assumir que ofertas com o mesmo texto de empresa pertencem ao mesmo tenant.

### 2. Os três conceitos financeiros não têm o mesmo escopo

- `packages/api/src/routes/refunds-dashboard.ts:44-53`: uma oferta explícita deve estar acessível; sem oferta, o consolidado contém somente ofertas criadas pelo usuário atual cujo `companyName` normalizado seja literalmente `tmx`.
- `packages/api/src/routes/tracking-overview/get-reserve-projection.ts:16-24`: reservas validam os IDs solicitados contra ofertas acessíveis; sem IDs, usam ofertas do proprietário atual. Não aplicam o filtro textual `tmx` do reembolso.
- `packages/web/src/components/overview/reserve-release-projection.tsx:151-161`: o componente recebe `offerIds` e envia esse conjunto explicitamente; seu resultado não pode ser reinterpretado como “empresa selecionada”.

**Risco:** Yola, Lucas ou outro perfil podem obter um consolidado diferente mesmo escolhendo visualmente “TMX”. Mover os cards de lugar não corrige isso. Nesta etapa, preservar cálculos e comunicar “ofertas do perfil / oferta selecionada” conforme a consulta real.

### 3. Tarefas e calls não são tenant-scoped

- `packages/api/src/routes/task-management.ts:48-52`: gestão exclusiva de administrador global.
- Mesmo arquivo, `:69-85` e `:109-112`: listagens filtram modo nativo/legado, pessoa, status e busca, mas não empresa; responsáveis também são globais.
- `packages/api/src/routes/call-management.ts:37-47`: listagem exige admin e filtra status/modo, não empresa.
- `packages/web/src/components/tasks/task-management-page.tsx:8-35`: Calls é uma aba em estado local, não um endereço específico. Não adicionar um link “Calls” que abra Tarefas; primeiro suportar URL explícita ou manter uma entrada “Tarefas e calls”.

**Risco:** colocar a gestão em Empresa e remover o gate admin exporia registros globais. Reorganizar mantendo o gate é seguro; delegação por empresa é trabalho posterior de backend.

### 4. O seletor “empresa” atual é específico da SyzePay

- `packages/web/src/components/hub/offer-context-switcher.tsx:125-130`: modo empresa só em SyzePay ou pagamentos.
- Mesmo arquivo, `:150-160` e `:189-190`: escolher empresa navega para `/integracoes/syzepay?company=...`, com rótulo “SyzePay geral”. Não é contexto global.
- `packages/api/src/routes/syzepay.ts:18-19,189-205`: chave da empresa combina proprietário + nome normalizado; contas e consultas usam `owner_id`.

**Recomendação:** manter SyzePay em Integrações, com seu escopo explícito. Não reutilizar esse seletor no cabeçalho Empresa como se afetasse membros, financeiro ou tarefas.

### 5. Separar preferências pessoais de administração

- `packages/web/src/components/hub/nav-config-nav-items-admin.ts:58-64` inclui Conta e segurança no Admin, embora também exista no menu pessoal.
- Mesmo arquivo, `:4-29`: grupo Admin e “Visão geral” apontam ambos a `/admin`.
- `packages/web/src/components/admin/admin-dashboard.tsx:23-27` define Atividade em `/admin?view=activity`, mas a sidebar aponta `/logs` (`nav-config-nav-items-admin.ts:48-55`). Verificar conteúdo antes de unificar: são dois nomes iguais, não necessariamente a mesma análise.

## Backend/RBAC necessário antes da gestão empresarial real

1. Entidade de empresa com ID estável, associação usuário–empresa e papel empresarial separado do papel global.
2. Vínculos das ofertas, tarefas, calls, convites, integrações e consultas financeiras com esse ID; migração explicitamente aprovada.
3. Política central de autorização na API; filtros de banco, cache, notificações e eventos em tempo real sempre com escopo empresarial. Menu não substitui autorização.
4. Reutilizar empresas existentes de Iago/Yola; vincular Lucas e Douglas à TMX sem duplicar empresa nem usar nomes como chave de segurança.
5. Convite completo exige criar/vincular empresa; convidados de Vídeo Studio conservam espaço privado. Impedir promoção de admin empresarial a global.
6. Testar dois proprietários e dois colaboradores de empresas distintas, IDs diretos, listas, busca, exportação, notificações e cache; administrador global continua uma exceção explícita.

## Critérios de aceite desta rodada de navegação

- Empresa é uma organização de UX, com limites visíveis e sem prometer isolamento ainda não implementado.
- Nenhuma rota ganha permissões; antigas URLs continuam funcionando.
- Nenhum cálculo financeiro ou envio comercial é alterado.
- Tarefas/calls saem da duplicação no Admin; preferências pessoais ficam no menu pessoal.
- Membros empresariais permanecem explicitamente locais/simulados.
- Seleção de oferta e filtros não se perdem ao navegar.

Não foram validados dados reais, acesso de usuários reais nem fluxos comerciais. Esta auditoria não certifica multi-tenancy e não autoriza publicação.

## Revisão das alterações locais desta rodada

As evidências acima descrevem o ponto de partida. A implementação local corrigiu os seguintes problemas sem alterar consultas, cálculos ou políticas da API:

- `task-management-page.tsx` agora deriva a aba da URL (`/tarefas?tab=calls`), preserva parâmetros ao alternar e utiliza navegação sem deslocar a página. O breadcrumb aponta para Empresa. Uma nota visível explica que tarefas/calls ainda têm escopo administrativo global, não empresarial.
- O link “Abrir relatório completo” agora transmite `offer`, `from` e `to`. O alias legado `offer_id` continua aceito.
- O relatório de devoluções usa a URL como única fonte da oferta e do período. Trocar oferta pelo cabeçalho ou pelo filtro remove produto/página da seleção anterior antes de consultar; gateway, conta e período não são redefinidos.
- O seletor superior de `/reembolsos` não usa mais a oferta persistida/primeira oferta quando o relatório está no agregado. Exibe “Minhas ofertas da empresa TMX”, conforme o contrato atual da API. Oferta inválida não é substituída silenciosamente por outra.
- A revisão independente de `navigation.ts`, sidebar, busca e configuração dos grupos confirmou a manutenção de `roles`/`requiresTool`; perfis apenas Vídeo Studio continuam sem Empresa, Rastreamento, Integrações e Ofertas. Membros empresariais aparecem apenas para admin no preview sintético. Administração global mantém pessoas, convites e atividade administrativa separados de Empresa.
- O coordenador de animações inspecionado não altera sessão/permissões/dados comerciais: guarda apenas identidades de tela, limita a entrada a seis painéis, respeita efeitos desligados/redução de movimento e cancela animações ao ocultar a aba. A revisão é estática, não medição de FPS.

### Verificações executadas

Ambiente mínimo sintético, `NODE_ENV=test`, sem credenciais herdadas; processos executados com rede negada pelo sandbox do macOS. Nenhuma API comercial foi inicializada.

- 17 testes selecionados aprovados: novos casos de URL/filtros/contexto, dashboard de tarefas e visualizações financeiras.
- 20 testes aprovados na rodada independente: navegação/roles, contexto/filtros e preview de membros (incluem os seis casos novos de navegação/filtros).
- Biome: 12 arquivos de implementação/teste verificados, sem erros.
- TypeScript web: `tsc --noEmit --incremental false`, aprovado.
- A primeira tentativa pela CLI `tsx` foi bloqueada pelo socket IPC local do runner; repetição via `node --import tsx` funcionou mantendo a rede negada. Não foi necessário liberar rede.

**Limites:** testes de funções, contratos de componentes e renderização estática não substituem a validação interativa no navegador, a cargo do agente principal. Não houve teste em produção, acesso de usuários reais, mudança de backend/RBAC nem autorização para publicar. Resultados e atividade (`/logs`) continuam administrativos; a reorganização em Empresa não os transforma em dados isolados de uma empresa.
