# Auditoria mobile TMX

## Escopo autorizado

Revisar navegação, leitura e operação em telas pequenas mantendo a identidade visual TMX.
Sem alterar cálculos, permissões, atribuição, webhooks, pixels, filas ou integrações.

## Critérios

- Referências de largura CSS: 375, 768, 1024 e 1440px (confirmar largura real no navegador).
- Alvos de toque de pelo menos 44px nos controles primários para celular.
- Campos nativos legíveis, títulos sem colidir com fechar, listas e seletores limitados à janela.
- Tabelas densas mantêm rolagem própria; não cortar dados para esconder overflow.
- Menu abre/fecha com teclado, mantém foco; rodapé não cobre conteúdo.
- Preservar animações existentes e preferência de movimento reduzido; testar claro e escuro.

## Correções

1. Shell: breadcrumb limitado, comandos com alvo maior, seletor de oferta com quebra, drawer
   com área rolável própria, destino de pular conteúdo focável e main com contenção vertical.
2. Controles compartilhados: botões e tabs com tamanho mobile, dropdown limitado à altura/largura
   disponível, espaço reservado ao fechar no cabeçalho dos diálogos.
3. Rodapé: em fluxo no celular, sem sobrepor gráficos/formulários; apresentação desktop preservada.
4. Visão geral/ofertas: indicadores em coluna no celular, ações com quebra e botões acessíveis.
5. Ads Intelligence: filtros e revisão de campanhas limitados ao container, nomes longos com quebra.
6. Tracking/Upsell: cabeçalho compacto, navegação natural rolável, sem main aninhado, cards/etapas
   com largura mínima zero, botões que acomodam nomes longos e tabelas com região focável.
7. Reembolsos: estilos de tema claro usando tokens, valores do eixo legíveis e atalhos tocáveis.
8. Conferência interativa: devolver foco ao botão do menu ao fechar o drawer; controles de conta
   com alvo de 44px também em tablets; fundo decorativo do tracking contido horizontalmente.

## Verificação

Typecheck completo do web em contêiner isolado, sem rede e sem variáveis de produção.
Regressões nativas de finanças/privacidade/datas e renderização dos controles.
Conferência visual e de dimensões no navegador, sem salvar formulários, disparar convites,
replays ou abrir links de recuperação que registrem cliques reais.

Auditoria de usabilidade responsiva, não certificação de todos os aparelhos físicos ou de cada
fluxo transacional. Fluxos com efeitos externos são preservados e não executados no smoke test.
