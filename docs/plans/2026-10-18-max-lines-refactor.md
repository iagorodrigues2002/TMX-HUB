# Remoção dos 55 avisos de tamanho — validação local

Data: 18/10/2026. Base preservada: `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e`.
Complementa a [rodada de lint e isolamento](2026-10-18-lint-process-isolation.md).
Sem commit, push, deploy, boot da API ou uso de credenciais de negócio.

## Escopo e preservação

Os 55 avisos `quality/max-lines` foram resolvidos por extração de módulos coesos:
23 na API, 29 no web, um no core e dois no shared. O limite de 350 linhas foi
mantido, sem supressões novas ou exclusão de fontes das regras.

- API: handlers das rotas, persistência de ofertas/IA, normalização VendePay,
  importação UTMify, dados Meta e recuperação das filas separados por responsabilidade.
- Web: cliente HTTP separado por domínio, preservando a instância de autenticação;
  componentes extensos divididos em suporte, estado e renderização.
- Core/shared: detecção de mídia, interação com player, contratos e schemas separados,
  com os exports públicos preservados.
- Testes que inspecionam código-fonte passaram a ler os módulos extraídos. Suas
  verificações de layout, atribuição e avisos de configuração foram mantidas.
- Adicionados três testes de classificação de mídia e cinco de persistência de
  ofertas/IA, incluindo criptografia, escopo e acesso desabilitado.

As alterações pendentes anteriores foram preservadas. Snapshot anterior a esta rodada:
`/tmp/tmx-maxlines-preservation.I3TPcn/source-before.tar` (fontes/testes, sem `.env`).
O backup e o stash da sincronização anterior não foram modificados.

## Revisão estrutural

Comparações com as fontes anteriores verificaram:

- 173 registros de rotas/hooks e 375 templates SQL preservados;
- 215 corpos de endpoints do cliente HTTP preservados;
- 157 instruções de setup do tracking na mesma ordem, incluindo callbacks de hooks;
- 121 funções e 52 inicializadores do restante do web preservados;
- revisão independente de 345 declarações/métodos de core/shared/serviços, incluindo
  extração do startup/recovery, AES-GCM e métodos herdados do armazenamento de ofertas.

Essas comparações apoiam a revisão de refatoração; não substituem testes funcionais.

## Testes e isolamento

- API com PostgreSQL descartável: **504/504**, 86 arquivos, nenhum ignorado.
- Segurança com Redis descartável: **10/10**, nenhum ignorado.
- Core: **77/77**; shared: **12/12**.
- Web: **65/65**, incluindo os quatro testes com caminhos de fonte atualizados.
- Isolamento Linux com Chromium e FFmpeg reais: **11/11**, nenhum ignorado.
- Biome: zero erros/avisos; ESLint quality e typed aprovados também com
  `--max-warnings 0`. Nenhum limite foi aumentado.
- Tipos de todos os workspaces e self-check das regras aprovados.
- `pnpm check` completo: **exit 0**, incluindo lint, tipos, regras, testes e builds
  core/shared/API/Next. O Next gerou artefatos somente na cópia descartável.

Total combinado: **679 testes aprovados**, sem contar execuções repetidas.

O PostgreSQL de teste recebeu as 94 migrações apenas em fixture vazia. Os testes
complementares cobrem os 30 casos PostgreSQL ignorados na execução sem banco.
Containers de teste usam dados sintéticos; a checagem canônica usa cópia temporária,
sem rede, sem `.env`, sem credenciais reais e sem mounts de produção. Testes reais
de Chromium/FFmpeg usam origens sintéticas, sem acesso externo durante execução.

## Limites

Não houve E2E visual autenticado nas telas nem validação em produção. O suporte do
ambiente Railway a namespaces/bubblewrap continua sem confirmação; sem essa fronteira,
as operações de mídia/navegação falham de forma fechada, sem fallback inseguro.
Contagem de testes não equivale a cobertura integral do produto.
O build também informa que a base Browserslist está desatualizada; não foi feita
atualização de dependências fora do escopo desta correção de lint.
