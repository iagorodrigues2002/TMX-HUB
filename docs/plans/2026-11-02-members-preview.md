# Gestão de membros — prévia local

Escopo aprovado: prévia interativa, sem migrar contas, mudar permissões reais,
enviar convites ou publicar. Reutilizar a cópia isolada native-task-management.

Identidade: superfícies TMX (#061119 / #0b1c27), cyan (#22d3ee), texto claro
(#e4edf0), atenção âmbar (#fbbf24). Fonte e componentes existentes; sem novos
pacotes. Cabeçalho alinhado à esquerda, resumo em faixa, tabela compacta e painel
lateral de acesso. Empresas mostram vínculos; convites mostram o destino do acesso.
Sem redesenhar a navegação. Movimento apenas na troca de abas e no painel, com
prefers-reduced-motion respeitado.

Rotas/arquivos: /preview/membros (apenas development), componente isolado, fixtures
e transições puras, testes do modelo e validação no navegador.

Regras da demonstração:
- Iago e Lucas: globais e membros da TMX; Douglas: colaborador TMX.
- Yola: empresa existente (nome ilustrativo até conferir o registro real).
- Gabriel Pinto e Enzo: acesso completo, aguardando criar empresa.
- Onze usuários Studio: ambiente pessoal; nenhuma empresa obrigatória.
- Convites: criar empresa, entrar em empresa existente, ou somente Studio.
- Nenhuma promoção global via convite. Leitura/edição somente em memória.
- Vínculos reais e isolamento no backend NÃO são implementados por esta prévia.

Validação: tipos, lint dos arquivos alterados, testes unitários, navegação, busca,
edição simulada, convite sem envio, onboarding e viewport estreito.

Resultado local (02/11/2026): 149 testes web passaram, incluindo seis novos testes
do modelo/limites da prévia. Typecheck, Biome dos cinco arquivos e git diff --check
sem erros. Navegador: convite demonstrativo para TMX, criação de empresa de Gabriel,
edição de função de Douglas, reset, modo claro e viewport móvel. Gaveta reutiliza o
posicionamento do sidebar existente; sem overflow horizontal no viewport móvel.
Dados de QA em memória reiniciados. Nenhum build/deploy, convite real, migração ou
alteração de API/permissão de produção executado nesta etapa.
