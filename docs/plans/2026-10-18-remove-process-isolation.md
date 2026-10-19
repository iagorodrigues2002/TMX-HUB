# Remoção local do isolamento de processos

Por solicitação do usuário, removidos bubblewrap, relay e namespaces adicionais
de Chromium/FFmpeg. Não houve push, deploy ou alteração de produção.

## Escopo

- Browser pool, download VSL, Media Worker e Shield Worker executam o binário diretamente.
- `prepareMediaProcess` conserva validação de executáveis/arquivos temporários,
  criação exclusiva de saídas, ambiente reduzido e encerramento do proxy.
- Validação de URL/DNS, proxy público com destino fixado após resolução,
  restrições de protocolo FFmpeg e limpeza de temporários permanecem.
- Dockerfile da API não instala bubblewrap. O pacote core não distribui o relay.
- Fixture reproduzível: `bash scripts/test-media-process.sh`, sem capabilities,
  sem elevação de privilégios, sem rede externa durante os testes e sem segredos.

## Limite de segurança

Essas validações **não são isolamento de sistema operacional**. Um processo
comprometido pode acessar recursos permitidos ao usuário do contêiner; o proxy
não impede toda conexão direta de um binário comprometido. O isolamento externo
do contêiner continua necessário. Compatibilidade real no Railway ainda depende
de publicação autorizada; não foi testada remotamente.

## Evidências locais

- `pnpm check`: exit 0; lint, lint quality/typed, tipos, regras, testes e builds aprovados.
- Suíte: shared 12, core 78, web 65 e API 474 aprovados (629 total);
  30 testes dependentes de banco ignorados nesta execução, sem afirmar cobertura deles.
- Reexecução final: lint e 17 testes focados aprovados após ajustes de nomenclatura.
- `bash scripts/test-media-process.sh`: exit 0, 3 integrações reais aprovadas,
  incluindo FFmpeg bloqueado pelo proxy ao tentar HTTP privado; fixture limpa ao terminar.
- Regressões inicialmente vermelhas: execução sem namespaces e proxy TCP.
- Chromium real renderizou conteúdo sintético e bloqueou HTTP privado via proxy.
- FFmpeg real processou arquivo temporário sem capabilities extras.
- Logs desta rodada: `/tmp/tmx-remove-sandbox.5iTafh/`.
- Telas autenticadas: evidência da rodada anterior no relatório Railway; nenhuma
  tela foi alterada nesta remoção e a navegação autenticada não foi repetida.
- Backup anterior à remoção: `/tmp/tmx-remove-sandbox.5iTafh/before.tar`.

Os relatórios anteriores que afirmam contenção por namespaces são históricos,
não descrevem mais o comportamento deste checkout.

## Complemento: testes com banco após a remoção

- Executada novamente a suíte inteira da API com PostgreSQL 16 e Redis 7
  descartáveis, rede interna sem saída externa, credenciais sintéticas e sem .env real.
- 86 arquivos e 504 testes da API aprovados, zero ignorados: os 30 casos
  anteriormente ignorados foram executados com sucesso.
- Mais 10 testes de segurança com Redis aprovados, zero ignorados.
- Migrações executadas exclusivamente na base descartável: 94 registros aplicados.
- Containers e rede temporários removidos automaticamente ao finalizar.
- Nenhuma correção de código ou ajuste de design necessário nesta rodada.
- Log: `/tmp/tmx-api-db-validation.cGKInl/recheck-after-isolation-removal.log`.
- `pnpm check` repetido após a validação de banco: exit 0, lint/tipos/testes/builds
  aprovados (`/tmp/tmx-api-db-validation.cGKInl/release-check.log`). Os skips
  dessa execução sem banco estão cobertos pela execução separada acima.
- Isso valida a base sintética; não certifica migração sobre dados reais ou
  funcionamento remoto no Railway. Nenhum push/deploy executado.
