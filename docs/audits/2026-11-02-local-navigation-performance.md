# Navegação local — 02/11/2026

## Diagnóstico

- Prévia em `next dev`; primeira solicitação de Membros: 1.059 ms no servidor, incluindo 865 ms de compilação (`.next-native-preview/trace`).
- Ferramentas: 1.198 ms, incluindo 1.001 ms de compilação.
- Solicitações RSC já aquecidas: aproximadamente 11–17 ms. Compilação sob demanda era o maior custo observado; não houve alteração de cache, permissões ou consultas para mascará-lo.

## Ajuste local

`node scripts/local-members-preview.mjs --compiled` compila e serve a prévia na porta 3120, mantendo a conferência da base live, a API local na porta 4110 e a identificação de dados sintéticos. O modo padrão continua sendo desenvolvimento. Mudanças posteriores de código exigem reconstruir/reiniciar o modo compilado.

## Evidência

- Build compilado gerado: `h7LgY1Z0YMYWIAGZxTBvK`.
- Navegação por clique na porta 3120: Ferramentas → Membros em 214 ms; repetição em 96 ms; Financeiro em 105 ms; retorno a Ferramentas em 97 ms.
- Tempos medidos até o título da página estar visível, incluindo automação; não representam término de todas as consultas nem benchmark de produção. Membros e o estado de Financeiro também foram conferidos após o carregamento.
- Console sem erros nas navegações medidas.
- 221 testes web passaram, sem testes ignorados; verificação de tipos e lint passaram.
- Saída gerada `.next-native-compiled/` excluída do Git/lint. Aviso sintético preservado mesmo com `NODE_ENV=production` local.
- Nenhum push, deploy, migração ou alteração de dados de produção.

## Limites

Não houve medição de navegação autenticada no live nem teste de carga. O Next emite um aviso sobre `next start` com `output: standalone`; o servidor local respondeu e as rotas/assets foram conferidos no navegador. A execução de produção existente não foi alterada.
