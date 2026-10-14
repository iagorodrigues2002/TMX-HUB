# Ads Intelligence: leitura de desempenho

Pedido aprovado: reconhecer a nomenclatura oferta/anúncio/leva, aplicar leva 01 quando ausente, corrigir ROAS/ROI e tornar os dados mais visuais sem confundir cobertura parcial com resultado definitivo.

## Decisões de interface

- Preservar tipografia e superfícies TMX; filtros de empresa, oferta e ordenação no topo.
- Recolher a lista de campanhas pendentes por padrão, com quantidade e ação explícita de revisão. Erros de importação permanecem visíveis.
- ROAS acima de 1× e ROI de mídia acima de 0%: verde e ▲. Abaixo: vermelho e ▼. Equilíbrio: âmbar e =. São limites de mídia, não lucro líquido.
- Faturamento positivo usa verde informativo, sem afirmar lucro; custos usam âmbar sem classificar como ruim. CTR/hook usam ciano informativo sem benchmarks inventados. Valores ausentes ficam neutros.
- Privacidade mascara os valores financeiros, sua direção, cores e sinalizações individuais. Não revela resultado através de tooltip ou texto acessível.
- Cálculos provisórios têm rótulo “Parcial”; a razão fornecida pela API acompanha o tooltip. Não transformar custo ausente em zero.
- A coluna fixa precisa de fundo sólido, não `bg-card` translúcido. Tabelas externa e interna compartilham a largura exata das colunas, preservando scroll horizontal e alinhamento.
- Expansão das levas mantém animação e respeita redução de movimento.

Alternativas consideradas: colorir todas as métricas por supostos benchmarks (rejeitada por falta de contexto); apenas pintar ROAS/ROI (menos legível e inacessível sem direção textual). Escolhida semântica restrita com cues não dependentes de cor.

## Verificação

Testes para limiares, privacidade e métricas informativas; regressão estrutural da coluna fixa e filtros; typecheck/build web. Validação visual no navegador deve confirmar fundo opaco e alinhamento antes/depois do scroll em viewport ampla e estreita.
