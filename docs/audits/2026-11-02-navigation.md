# Auditoria de navegação do TMX

Data: 02/11/2026. Alterações locais sobre a base live preservada no checkout de gestão nativa.
Sem push, deploy, migração, alteração de permissões ou dados comerciais.

## Cobertura e achados

Foram inspecionados sidebar desktop/mobile, navegação recolhida, busca de comandos,
breadcrumbs/topbar, menu pessoal, seletor de ofertas/empresas, rotas e aliases,
catálogo de ferramentas, Ofertas, administração, tracking, tarefas/calls e devoluções.

| Achado | Tratamento |
| --- | --- |
| Ofertas e Todas as ofertas abriam a mesma URL; Admin e Visão geral também | Pais passam a expandir grupos; somente folhas navegam |
| Mais de uma página ativa em Admin e Tracking/Integrações | Resolvedor compartilhado escolhe uma folha canônica, considerando query, defaults e aliases |
| Menu aberto salvo escondia a área atual | Ao navegar, a área da rota prevalece sobre a preferência salva |
| Sidebar recolhida precisava de acesso aos filhos | Dropdown Radix com teclado, foco e links individuais |
| Palette herdava grupos/duplicatas e repetia Conta e segurança | Apenas destinos finais únicos; conta pessoal permanece como ação/menu pessoal |
| Atividade significava dois relatórios diferentes | Atividade administrativa em Admin global; Resultados e atividade em Empresa |
| Duas visões gerais de escopos diferentes | A visão de tracking passa a se chamar Resumo da oferta |
| Convites, equipe e tarefas pareciam administração da plataforma | Empresa separada da Administração global, sem modificar autorizações |
| Link de relatório de devolução usava offer_id, página aceitava offer | Encaminhado à correção de contexto de oferta da auditoria paralela |
| Calls perdia seleção ao recarregar | Encaminhado à correção de deep link da auditoria paralela |
| Navegação contextual repetia destinos e misturava pagamentos com diagnóstico | Ajuste coordenado pelo agente principal em tracking-workspace |

## Organização entregue

- Visão geral: dashboard existente.
- Ofertas: catálogo e Ads Intelligence.
- Rastreamento: Resumo da oferta, Jornada, Upsell Intelligence, Captura e Diagnóstico.
- Empresa: Membros · prévia, Tarefas e calls, Financeiro · devoluções, Resultados e atividade.
- Ferramentas: catálogo e ferramentas existentes.
- Integrações: pagamentos/webhooks e destinos existentes. Taxas permanecem no contexto
  dos gateways da oferta; diagnóstico permanece no grupo Rastreamento.
- Administração global: resumo da plataforma, Pessoas e acessos, Convites e Atividade administrativa.
- Conta e segurança: menu pessoal e comando, sem entrada duplicada administrativa.

Empresa é uma organização de navegação, não uma nova autorização. Membros aparece somente
em prévia sintética para administradores. O modelo de membros continua demonstrativo;
nenhum usuário foi promovido, vinculado ou migrado por esta alteração. Relatórios financeiros
mantêm o escopo autorizado já existente. Pessoas/convites administrativos continuam globais.

## Compatibilidade

O helper `components/hub/navigation.ts` centraliza visibilidade, identificação de destino,
deduplicação de busca e preservação da oferta nos links de tracking/devoluções. Datas já
presentes são preservadas ao navegar dentro da mesma página.

Aliases antigos permanecem: TikTok, upsells da jornada, diagnostics, payments em destinations,
creative-studio, page-diff, cloaker-urls, digi-approval e tracking-vendepay. Não foram removidas
rotas. URLs dinâmicas de ofertas/jobs mantêm a área correspondente.

Redundância útil preservada: busca rápida, logo para início, links contextuais de detalhes,
catálogo de ferramentas e relatório completo de devoluções. Upsell Intelligence e Upsell Analyzer
não foram fundidos: têm funções diferentes.

## Validação

- 8 testes unitários em `packages/web/test/navigation.test.ts`: folhas únicas, defaults,
  aliases, Admin separado de Empresa, gates de admin/usuário/Studio, prévia sintética,
  rotas dinâmicas, preservação de oferta/datas e contratos das três superfícies.
- Executados com Node/tsx, ambiente mínimo, sem carregar `.env` ou chamar API.
- Biome aplicado exclusivamente aos arquivos de navegação e teste; verificação aprovada.
- Typecheck integrado e validação visual de desktop/mobile/recolhido: responsabilidade
  da validação final coordenada pelo agente principal; não são inferidos dos testes unitários.

Limites: nenhum teste em produção, nenhuma mudança no isolamento empresarial do backend,
nenhuma alegação de que reorganizar menus substitui controles de acesso na API.
