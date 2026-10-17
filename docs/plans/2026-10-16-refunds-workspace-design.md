# Reembolsos: organização e movimento

Direção aprovada: animações mais marcantes, organização clara e preservação dos cálculos.

## Direção visual

- Base #0a1b26, superfície #102c39, borda #243b48, texto #e4edf3.
- Ciano #67e8f9 para orientação, rosa #fb7185 para devoluções/impacto; verde para redução.
- Manter Space Grotesk e numerais tabulares do TMX. Nada de novos serviços ou fontes.
- Cabeçalho e atalhos de seção; período separado dos filtros; resumo financeiro com impacto destacado.
- Evolução, tabelas de mês/ranking, prazos e auditoria em largura total. A revisão visual descartou
  tabelas lado a lado: a quantidade de colunas exigia rolagem desnecessária mesmo no desktop.

## Movimento

Revelação das seções ao entrar na tela, barras crescendo e linha desenhada. Ações frequentes
continuam rápidas. Sem contagem animada de dinheiro, loops decorativos ou bloqueio de interação.
Preferência de movimento reduzido desativa animações. Sem dependência de biblioteca de movimento.

## Limites e validação

Somente componentes e CSS da página. Não alterar API, datas, receita, taxas, escopo de empresa,
workers, webhooks, pixels ou UTMify. O filtro histórico de recibos é outro ajuste, não incluído.
Preservar avisos de dados incompletos e privacidade. Testar renderização sem dados/com privacidade,
alvos da navegação, rolagem acessível e mídia de movimento reduzido; conferir deploy web.
