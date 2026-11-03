# Navegação e movimento — entrega local

Data: 02/11/2026. Checkout: `native-task-management`, branch `codex/native-task-management`.
Base conferida com o live: `414e2b564bcffb0c72563f36a55fa2105286b048`.
Prévia: http://localhost:3120/preview/membros. API de homologação: loopback 4110, dados sintéticos.

## Entregue

- Menu Empresa com Membros (prévia), Tarefas e calls, Financeiro · devoluções e Resultados e atividade. Administração global fica explicitamente separada.
- Grupos expandem sem criar uma segunda entrada para o mesmo destino; busca deduplicada e uma folha ativa por menu visível. Conta e segurança fica no menu pessoal.
- Integrações mostram o destino correto no título, sem uma segunda lista idêntica. Upsell Intelligence não exibe uma navegação interna de um único item.
- Calls possui URL própria dentro de Tarefas; filtros de oferta/período são preservados e aliases antigos continuam aceitos.
- Entrada coordenada e mais perceptível nos painéis: até seis superfícies, transform/opacity, orçamento máximo de 700 ms. Voltar à mesma tela não reclama uma nova entrada na sessão.
- Contadores partem da leitura anterior nas atualizações. Efeitos desligados, aba oculta, privacidade e reduced-motion são respeitados pelos controladores revisados.
- Prévia de membros bloqueada também por URL direta para usuários não administradores. Nenhuma simulação altera usuários reais.

## Evidências

| Verificação | Resultado |
| --- | --- |
| Suíte completa web | 176 testes aprovados, zero falhas/cancelados/ignorados, 45 arquivos; execução com rede negada pelo sandbox do macOS |
| Typecheck web | Aprovado |
| Biome nos arquivos da auditoria | 39 arquivos; um aviso semântico no estado de carregamento foi corrigido para `output`, rechecado sem erros |
| Build Next de produção local | Aprovado; compilação e geração de 33 páginas estáticas; sem rede, credenciais ou publicação |
| `git diff --check` | Aprovado |
| Desktop | Empresa expandida/recolhida, dropdown, item ativo único por menu visível, breadcrumb e busca sem Conta e segurança duplicada |
| Mobile | Override solicitado de 390×844, largura CSS efetiva 433 px por escala do navegador; sem overflow horizontal; menu fecha ao navegar, Escape devolve foco ao acionador |
| Tema | Prévia de empresas inspecionada em claro e escuro |
| Calls | URL `?tab=calls`, recarga preservada, card sintético visível |
| Efeitos desligados | DOM confirma `data-tmx-motion=off`, painéis com opacity 1, animation none e transition 0s |
| Perfil não administrador | Gestão de tarefas bloqueada; prévia de membros por URL direta mostra acesso restrito, sem listar membros |
| Console | Nenhum erro novo na revisão final; um erro transitório de HMR das 03:53:54 UTC permaneceu no histórico, não se repetiu após recarga |

O build usou diretório separado da prévia e foi movido para `/tmp/tmx-nav-motion-build.8FB0gq/build`, sem remoção de arquivos do usuário. A referência de tipos voltou ao diretório da prévia. Alertas não bloqueantes do build: base Browserslist antiga e depreciação de `module.register()` no Node local.

## Limites e pendências explícitas

- Inventário estático de 41 páginas não significa validação visual de todas as páginas, estados e combinações de dados. Os casos visuais executados estão acima.
- **Empresa ainda é organização de navegação, não isolamento de dados por empresa.** Backend/RBAC, migração e atribuições reais continuam pendentes. Gates existentes não foram ampliados.
- Sem testes de envios comerciais, vendas, webhooks, pixels, UTMify, Discord ou dados reais nesta rodada. Nenhum push, deploy ou alteração em produção.
- Testes unitários cobrem chaves de entrada, seleção de painéis, contadores e guards. Não foi capturado trace de FPS/CPU nem emulação de reduced-motion do sistema no navegador; não há promessa de 60 FPS em todo dispositivo.
- As oportunidades específicas adicionais por tela estão separadas das correções entregues no relatório de movimento. Não foram adicionadas bibliotecas, mídia ou novos loops sobre tabelas.

## Relatórios e captura

- [Auditoria de navegação](2026-11-02-navigation.md)
- [Auditoria de movimento](2026-11-02-motion.md)
- [Escopo de empresa e limites de autorização](2026-11-02-company-scope.md)
- [Captura final](2026-11-02-empresa-desktop.jpg)
