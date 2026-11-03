# Revisão integrada do localhost

Escopo: gestão de membros/empresas, permissões, ofertas, navegação e animações discutidas nesta etapa. Não é certificação de todo o histórico comercial do TMX.

Base live reconferida pelo launcher: `414e2b5`. Prévia em http://localhost:3120/preview/membros; API isolada, dados sintéticos. Sem push, deploy, migração ou envio externo.

## Matriz de implementação

| Pedido | Situação |
| --- | --- |
| Empresa separada de administração global | Implementado no menu, preservando gates atuais |
| Classificação Iago/Lucas globais, Douglas TMX, Yola própria empresa, Studio individual | Implementado na demonstração; nenhum vínculo real alterado |
| Novos convidados completos criarem empresa | Onboarding demonstrativo testado; persistência/obrigatoriedade real ainda não implementada |
| Ferramentas disponíveis e ofertas específicas | Seleção, busca, contagem, resumo e salvar/reabrir testados na sessão; catálogo de três ofertas ilustrativas |
| Convites por destino | Demonstração testada; nenhum e-mail enviado |
| Tarefas e calls | Funcionalidade existente com API local; ainda escopo administrativo global, não tenant empresarial |
| Calls para participantes nas notificações | Contrato identificado no backend; envio Discord não exercitado nesta rodada |
| Financeiro | Reutiliza devoluções existentes; não é novo consolidado empresarial |
| Navegação e motion | Correções compartilhadas e testes de regressão; nenhum valor financeiro recalculado |

## Correções desta revisão

- Modelo de permissões usa validação estrita: rejeita campos extras de privilégio/empresa, módulos desconhecidos, IDs de ofertas inválidos e função longa.
- IDs de convites duplicados rejeitados; ofertas deduplicadas e restritas à empresa do membro.
- Erros ao salvar ficam no painel, preservando o formulário; cálculo da alteração é síncrono antes de atualizar estado.
- Corrigida especificidade CSS que removia o espaçamento dos cards de ferramentas.
- Resumo e ação de salvar fixados no rodapé rolável; contraste usa tokens reais do tema.
- Aviso explícito de que recarregar restaura a demonstração; nenhuma falsa persistência.
- Removida a repetição das animações legadas de entrada em Reembolsos quando o shell já coordena o movimento; feedback de expansão preservado.

## Validação final

- 180 testes passaram, sem falhas ou skips, com rede bloqueada.
- Typecheck e lint dos sete arquivos revisados passaram.
- Build web passou com rede bloqueada: compilação concluída e 33/33 páginas estáticas geradas.
- `git diff --check` sem erros.
- Essa evidência cobre a revisão local e seus contratos; não equivale a homologação dos serviços externos ou do futuro RBAC empresarial.

## QA de navegador executado

Selecionar todas/desmarcar ferramentas; seleção individual; busca de ofertas sem resultados e por PJR; salvar e reabrir; alternar administrador/colaborador; convite demonstrativo de colaborador; onboarding de Gabriel mantendo Iago/Lucas/Douglas/Yola; viewport mobile sem overflow horizontal (433 CSS px efetivos na escala atual); ação salvar acessível. Demonstração reiniciada por reload ao terminar, eliminando os registros QA em memória. Console final sem erros capturados.

## Correção posterior: respostas genéricas da API sintética

Após relatos do usuário em Atividades, Reembolsos, SyzePay e Ads Intelligence, foi reproduzido que rotas não implementadas retornavam HTTP 200 com `{notifications, offers, events, preferences, enabled}`. A UI interpretava esse objeto como o contrato específico de cada consulta, provocando exceções. A revisão anterior não detectou essa lacuna.

- Removido o sucesso genérico do harness: consultas excluídas agora respondem HTTP 404 com mensagem de indisponibilidade local.
- Atividades e resultados ganharam validação da resposta e estado de falha sem representar indisponibilidade como feed vazio.
- API local reiniciada reutilizando exclusivamente seu schema sintético validado; uma call e zero tarefas preservados. Nenhum schema de produção foi acessado.
- Navegação verificada no navegador: Reembolsos, SyzePay, Ads Intelligence, Ofertas, Tarefas, Ferramentas, Admin, Membros, Visão geral, Rastreamento, Cloner, VSL, Upsell Analyzer, Webhook Tester, Funnel Clone, Video Studio e três subtelas Admin. Sem exceções de renderização observadas; consultas comerciais indisponíveis não foram homologadas como funcionais.
- 186 testes web em 47 arquivos passaram com rede bloqueada; lint dos arquivos alterados e diff check passaram. Nenhuma operação de ferramenta, envio comercial ou integração externa executada nesta revisão.

## Limites operacionais

Gestão empresarial real exige entidade de empresa, memberships, autorização no backend e persistência. Não foi implementada por esta revisão visual nem está certificada. Dados comerciais, pagamentos, pixels, UTMify e execução Discord não foram testados com dados reais. Não houve medição de FPS em dispositivos físicos.

## Substituição do harness pela API completa — 02/11, 07:33

O localhost:3120 agora utiliza o `buildApp()` real em 4110, com banco `tmx_live_preview_20261102` e Redis exclusivo em 32869. Não inicia `server.ts` nem workers comerciais. O launcher passa somente variáveis sintéticas e usa sandbox-exec para bloquear saída de rede não local. O banco anterior foi preservado; a call local e os vínculos existentes foram copiados sem mudar os IDs.

- Incluída a migration 108 na lista do migrador e origem de desenvolvimento localhost:3120 no CORS (sem ampliar origens de produção).
- Fixtures idempotentes: três usuários, três ofertas, 18 pedidos, seis devoluções, 24 recebimentos, uma conexão SyzePay pausada e seis anúncios em duas levas. Não representam faturamento real.
- Confirmado no navegador: Resultados/Atividades sem exceção, Reembolsos com gráficos/tabela, SyzePay com conexão/evento e Ads com duas levas. Filtro SLM_DE esconde corretamente as levas exclusivas de PJR_ENG.
- Resumo financeiro do administrador no cenário sintético: R$ 1.248,00 / 12 vendas e R$ 416,00 / quatro devoluções; exclui a terceira oferta, de outra empresa.
- Typecheck API/web: passou. Web: 186/186. API nos seis arquivos focados: 60 testes únicos passaram, incluindo os 21 inicialmente ignorados executados depois com PostgreSQL local. Não é uma execução de toda a suíte API.
- Smoke HTTP repetível: `node scripts/verify-complete-local-preview.mjs`. Verifica seis contratos, HTTP404 para rota desconhecida e bloqueio de saída externa.
- Início da API: `node scripts/complete-local-preview.mjs --api`; seed: `--seed` e `--seed-ads`; migração: `--migrate`. Requer os containers locais existentes (Postgres32779/Redis32869). Não usar server.ts para esta homologação.

Limites que permanecem: uploads/S3 e workers de ferramentas não estão operacionais neste ambiente; download das imagens MinIO foi recusado pelos registries. Integrações externas permanecem bloqueadas. A prévia de gestão empresarial continua demonstrativa, não certifica autorização empresarial persistente. Portanto, esta correção não equivale a declarar o produto inteiro 100% homologado nem autoriza publicação.
