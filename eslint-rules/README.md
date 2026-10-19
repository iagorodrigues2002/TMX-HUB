# Regras locais de qualidade

Origem: `soumatheusgomes/vibe-coding-toolkit`, revisão
`de66fe371a49f5a4d3b521759e5c401f390b6424`, `templates/eslint/`.
Os três módulos CJS e o self-check em `scripts/verify-quality-rules.mjs`
foram copiados dessa revisão. Licença MIT do toolkit; consultar a fonte fixada.

Biome continua sendo o lint canônico. O gate adicional mede tamanho/console
como avisos e impede import direto de postgres.js no web. Não é isolamento
de segurança nem análise completa de fluxos de dados. Typed lint é medição
separada: não se deve chamar avisos de aprovação sem dívida.
