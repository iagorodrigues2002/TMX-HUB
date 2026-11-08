# Sincronização de Tráfego na API

O sincronizador é parte do código, build e inicialização oficiais da API. Não depende
de cópia manual de scripts, comando temporário de deploy, Mac ou navegador aberto.
Esta integração não publica interface, menu ou rota web de Tráfego.

## Build e inicialização

- `pnpm --filter @page-cloner/api build` compila o leitor Meta versionado em
  `src/services/meta-traffic-reader.ts` para `scripts/traffic-meta-reader.mjs`.
- O artefato é gerado a cada build, não é versionado e não contém credenciais.
- O Dockerfile exige que o artefato exista e inicia `scripts/traffic-sync-server.mjs`.
- O build falha se o comando oficial ou o Dockerfile deixarem de iniciar o
  sincronizador, evitando publicar sem ele por uma mudança acidental de entrypoint.
- O comando oficial `pnpm --filter @page-cloner/api start` valida o artefato,
  executa a etapa de migrações já existente e inicia o mesmo supervisor.
- O supervisor mantém a API original e o sincronizador no mesmo serviço, com
  encerramento coordenado. Não há serviço ou tabela adicional.

## Configuração persistente

As variáveis protegidas do serviço Railway são preservadas entre implantações:

- `TMX_TRAFFIC_SYNC_ENABLED=1`: ativa a coleta.
- `TMX_TRAFFIC_META_TOKEN`: credencial do System User; nunca salvar no repositório.

As variáveis já foram configuradas no ambiente atual. Não é necessário recadastrá-las
ou mudar o comando de inicialização a cada publicação da API. Novo ambiente ou novo
serviço exige configuração inicial própria; token expirado/revogado exige renovação.

## Dados e operação

Hoje é atualizado a cada dez minutos e Ontem a cada hora. Pedidos de outros períodos
entram em fila limitada. API financeira original e Meta são consultadas somente por
leitura; resultados são limitados ao proprietário configurado no código.

O Redis usa namespace exclusivo `traffic-sync:v1:<proprietário>:` e retenção de sete
dias. Lock renovável e publicação atômica condicionada ao lock evitam sobreposição
durante troca de versão. Erros preservam o último snapshot válido.

O status mantém heartbeat, erros e timestamps por período. O campo `revision` do
snapshot identifica `server-traffic-v2-canonical`. A prévia local continua consumindo
os mesmos relatórios; nenhuma alteração de protocolo foi necessária.

## Verificação

Testes `meta-traffic-reader.test.ts`, `traffic-sync-worker.test.ts` e
`traffic-sync-build.test.ts` cobrem leitura, erro, isolamento de conta, publicação
condicionada ao lock e contrato de geração/inicialização do artefato em build limpo.
Executar testes com ambiente sintético e rede externa bloqueada. Build não é boot da API.
