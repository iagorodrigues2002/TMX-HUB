# Lint e isolamento de Chromium/FFmpeg — validação local

Atualização posterior: os 55 avisos de tamanho foram tratados na
[rodada de extração de módulos](2026-10-18-max-lines-refactor.md). Os números abaixo
registram a rodada anterior, antes dessa extração.

Data: 18/10/2026. Checkout original, base `0ba0192a217e87382946fd9f2c87fb0b3ad8ff2e`.
Sem commit, push, deploy, alteração remota, boot da API ou uso de credenciais de negócio.
Alterações pendentes anteriores, backup e stash da sincronização foram preservados.
Este registro complementa a [validação anterior](2026-10-18-test-failures-validation.md).

## Lint e revisão

- Corrigidos imports, formatação e erros Biome em API, core, shared e web. `tmp/` e
  `output/` são artefatos gerados, não fontes da aplicação; ficaram fora do Biome.
- Promises recebem tratamento explícito, inclusive clipboard, HMAC, importação ZIP,
  exclusão de jobs e callbacks de processos. Não se transformou erro em falso sucesso.
- Labels usam IDs únicos; regiões roláveis permanecem acessíveis por teclado; hooks
  acompanham dependências reais e os editores reiniciam ao trocar a seleção.
- `UserStore.update` preserva a distinção entre permissão ausente, nula e lista vazia;
  warning de convite usa o logger existente. Tipos substituem `any`/`Function` onde cabível.
- Preservadas exceções locais justificadas para regex de controles/acentos e foco de
  regiões roláveis. Nenhuma regra global foi desligada para esconder erro da aplicação.
- Revisão independente encontrou uma colisão de key na lista de nomes históricos de
  anúncios: IDs iguais com nomes diferentes agora usam a mesma identidade JSON adotada
  pela API. O teste cobre esse caso.
- `pnpm typecheck` compila core antes de verificar consumidores de `dist`, assim como
  `pnpm test`. Não depende de artefato antigo deixado no checkout.
- Revisão de lifecycle encontrou um MP4 que poderia ficar órfão se a limpeza falhasse
  após o download. O descarte agora é idempotente, tenta todos os recursos e mantém
  o erro primário; um download só entrega seu caminho depois da limpeza bem-sucedida.

Os 55 avisos `quality/max-lines` continuam explícitos: são dívida de divisão de arquivos,
não falhas de execução. Não foram suprimidos nem corrigidos por uma refatoração extensa
das rotas financeiras neste trabalho.

## Fronteira de rede implementada

Todos os lançamentos de Chromium e FFmpeg passam por `createProcessSandbox`:

- Linux/bubblewrap obrigatório, novos namespaces de rede, PID, IPC e UTS, mounts
  mínimos, capacidades removidas e ambiente limpo. Sem disponibilidade real do kernel,
  a operação falha com `network_sandbox_unavailable`; não existe fallback sem isolamento.
- Chromium e downloads VSL usam relay local dentro do namespace, ligado a um socket
  Unix privado. O proxy valida todos os IPs resolvidos, fixa o IP usado na conexão e
  valida cada novo destino. Endereços privados, loopback, metadata e reservados são negados.
- Proxy suporta HTTP e CONNECT. Chromium não possui bypass de localhost; QUIC e UDP
  WebRTC não-proxy são desabilitados adicionalmente. Guards de URL/service workers e
  WebSockets existentes continuam como defesa adicional, não como fronteira principal.
- FFmpeg remoto tem whitelist de protocolos e proxy explícito. Segmentos e playlists
  filhas passam pela mesma fronteira. Media/Shield usam rede `none` e `file,pipe`.
- Processos não enxergam `/app`, `.env`, home, `/etc/ssl/private` ou o diretório tmp
  inteiro da aplicação. Só inputs regulares temporários explícitos (read-only) e novos
  outputs exclusivos (read-write) são montados. Outputs existentes/symlinks são recusados.
- Pipes CDP são preservados; matar o launcher também mata seus descendentes. Wrapper
  e socket são limpos sem remover arquivos de saída válidos pertencentes ao chamador.

Sem mudança de protocolo/payload ou envio real para VendePay, SyzePay, Meta, TikTok,
Google, UTMify, email ou Pushcut. O isolamento afeta ferramentas de navegação/mídia,
não a política de entrega financeira.

## Evidências

As contagens abaixo são resultados de suítes distintas, não percentual de cobertura.

| Verificação | Resultado observado |
|---|---|
| Shared | 12 testes aprovados |
| Core unitário | 74 testes aprovados, incluindo proxy, wiring Chromium e falhas de cleanup |
| API com PostgreSQL real descartável | 499/499, 85 arquivos, 0 ignorados |
| Web | 65/65, incluindo clipboard, labels e identidade de anúncios |
| Segurança adicional com Redis real descartável | 10/10, 0 ignorados |
| Isolamento Linux real, usando `dist/index.js` recompilado | 11/11, 0 ignorados, inclusive HTTP/HTTPS |
| Migrações em PostgreSQL vazio da fixture | 94 entradas no ledger; nenhum banco real |
| Build | Core ESM/DTS, API e Next aprovados; 29 páginas estáticas geradas |
| Tipos | Shared, core (inclui testes), API e web aprovados |
| Self-check das regras do toolkit | 3 módulos aprovados |
| Biome raiz | 0 erros / 0 avisos |
| ESLint quality / typed | 0 erros; ambos somente os mesmos 55 avisos de tamanho |
| `pnpm check` literal em cópia limpa de artefatos | Exit 0: lint, tipos, self-check, testes e build |

Total combinado das suítes da tabela: **671 testes aprovados**. A execução canônica
sem banco tem 30 skips PostgreSQL; todos esses casos foram executados na rodada
complementar com PostgreSQL descartável (API 499/499), sem contar testes duas vezes.

Testes Linux reais exercitam namespaces/capabilities/ambiente/arquivos, egress público
e privado, CDP e encerramento de descendentes; Chromium renderiza página pública e
bloqueia subresources/redirecionamento privados e WebRTC STUN/TURN. FFmpeg remuxa
MP4/HLS/DASH públicos, nega redirect/playlist filha/BaseURL privados e processa mídia
local com rede desligada. As origens são sintéticas numa interface loopback com alias
de IP público; nenhum pedido alcança a internet durante esses testes.

Houve falhas vermelhas antes do wiring Chromium; mutantes descartáveis provaram a
regressão do DNS rebinding no proxy e do retorno do clipboard. Nenhum mutante ficou
no checkout. A revisão cruzada cobriu alterações semânticas de lint e ciclo de vida
dos processos, não somente formatação.

## Reprodução e limites operacionais

Para repetir a integração real de processos, com Docker local disponível:

```sh
bash scripts/test-process-sandbox.sh
```

Esse comando envia ao Docker somente uma lista explícita de fontes/manifests,
instala dependências públicas fixadas pelo lock em uma imagem de teste e compila
core. O build precisa de rede para os downloads; a execução dos testes não tem
rede externa. Não copia `.env`, `node_modules` do host ou credenciais, não inicia a
API e remove o contêiner/imagem temporários ao terminar. O Dockerfile dessa fixture
é separado do Dockerfile da aplicação.

O comando acima também foi executado do zero após sua criação: build aprovado,
11/11 testes de integração aprovados, zero falhas ou skips. Essa repetição não foi
somada novamente ao total de 671 testes. Contêiner e tag temporários foram removidos
pelo próprio runner; as demais fixtures desta validação também foram removidas,
sem tocar nos serviços locais preexistentes, no backup ou no stash.

Os testes de aplicação rodaram em cópia descartável, sem `.env` real ou rede externa,
com Node 24.22.0/pnpm 9.12.0. PostgreSQL 16 e Redis 7 novos, sem portas publicadas,
dados em tmpfs, nomes exclusivos, não compartilhados com serviços existentes.
As quatro URLs opt-in PostgreSQL da validação anterior foram habilitadas; sem elas,
`pnpm test` ignora os 30 casos que precisam desse banco. A suíte Redis adicional exige
seus guardrails e não pode ser apontada a uma base existente.

HTTPS usa certificado sintético gerado apenas na fixture. O contexto Chromium do teste
aceita esse certificado explicitamente; nenhuma configuração TLS da aplicação foi
relaxada. O teste prova o transporte CONNECT, não a cadeia de certificados de produção.

A fixture de processos usa Chromium 155, FFmpeg 8.1.2 e bubblewrap 0.12.0 em Linux.
Para criar namespaces aninhados no Docker local, somente esse contêiner de teste
recebe `SYS_ADMIN`/`NET_ADMIN` e perfil seccomp/AppArmor relaxado. Ele não possui rede
externa, bind mounts do host, Docker socket, dados ou segredos reais; os processos
internos ficam sem capacidades. **Não copiar essas permissões para a API em produção.**

O Dockerfile da API instala bubblewrap, mas isso sozinho não concede suporte a
namespaces. Antes de publicar, é obrigatório validar um worker/host Linux adequado
e restrito. A capacidade do Railway não foi testada nem configurada. Sem ela, as
ferramentas de Chromium/FFmpeg recusarão execução, preservando a segurança.

Não houve E2E da aplicação autenticada, validação visual completa ou chamadas reais a
provedores. O build local e as fixtures não certificam infraestrutura live nem encerram
automaticamente todos os indícios da auditoria anterior.

Referências de implementação: [bubblewrap](https://github.com/containers/bubblewrap),
[namespaces Linux](https://man7.org/linux/man-pages/man7/network_namespaces.7.html),
[proxy Chromium](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md),
[protocolos FFmpeg](https://ffmpeg.org/ffmpeg-protocols.html).
