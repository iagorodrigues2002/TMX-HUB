# Compatibilidade Railway e telas autenticadas

> Histórico: o isolamento abaixo foi posteriormente removido a pedido do usuário.
> Estado atual em [remoção local](2026-10-18-remove-process-isolation.md).

## Decisão de publicação

**Não liberar a publicação do isolamento atual no Railway com estas evidências.**
Não houve push, deploy, comando remoto em produção ou alteração de configuração Railway.

A documentação oficial informa que containers Railway são não privilegiados e não
permitem elevação de privilégios:

- https://docs.railway.com/guides/github-actions-runners
- https://docs.railway.com/guides/bridge-railway-to-rds-with-tailscale

O harness Linux anterior concede explicitamente `SYS_ADMIN` e `NET_ADMIN`. Os 11 testes
passando nesse harness não demonstram compatibilidade com o runtime padrão Railway.
O código exige namespaces de rede/PID/IPC/UTS e montagem bubblewrap. Instalar bubblewrap
no Dockerfile não concede as permissões do kernel necessárias.

Nesta rodada, testes locais sem privilégios produziram:

| Perfil local | Resultado |
| --- | --- |
| UID 65534, capabilities zeradas, no-new-privileges, seccomp padrão | `No permissions to create a new namespace` |
| Root com capabilities padrão Docker, sem privilégios adicionais | `Creating new namespace failed: Operation not permitted` |
| `createProcessSandbox` compilado, Chromium e FFmpeg, perfil restrito | ambos retornaram `network_sandbox_unavailable` |

Conclusão: incompatibilidade reproduzida no perfil local não privilegiado e ausência
de suporte documentado para os privilégios requeridos no Railway. Isso não é uma
sondagem do kernel do serviço Railway do usuário, que não foi acessado. A confirmação
específica exige ambiente descartável autorizado ou suporte Railway. Não introduzido
fallback inseguro, desativação do sandbox ou privilégios adicionais em produção.

## Navegador autenticado local

Fixture fora do repositório, com Chromium real, build Next do checkout atual, API
real via `buildApp`, Redis e PostgreSQL vazios com migrações. Três usuários fictícios:
admin, Alpha e Beta, cada um com oferta própria e tracking configurado. Login pelo
formulário normal, sem injetar token nem ler credenciais do navegador pessoal.

A rede Docker é interna, sem saída para integrações externas. Não são iniciados
workers ou recuperação de filas. Não há `.env`, dados de clientes ou credenciais reais.
O browser de teste usa perfil descartável; não prova a disponibilidade do sandbox
de mídia da aplicação (ver teste específico acima).

Resultados da rodada final: **exit 0**.

- 25 navegações desktop: 17 páginas/variantes como admin e quatro como cada membro.
- Nove verificações mobile (390 × 844): ofertas, reembolsos e tracking por usuário,
  sem overflow horizontal do documento (390 px medidos em todos os casos).
- Login real, redirecionamento de página protegida sem sessão, sessão preservada ao
  recarregar, logout e novo bloqueio da página protegida, nos três perfis.
- Admin vê as três ofertas; Alpha e Beta veem apenas a própria. Tentativa por URL
  direta de abrir a oferta do outro membro apresenta “Oferta não encontrada”.
- Zero exceções `pageerror` e zero respostas API >= 400 nas 25 navegações permitidas.
- Visão geral, ofertas, reembolsos, Ads Intelligence, logs, administração,
  configurações, ferramentas, UTMify geral, SyzePay e áreas de tracking renderizadas.
- Screenshots capturadas; inspeção visual de reembolsos desktop/mobile,
  Upsell Intelligence e ofertas mobile.

Evidências locais: `/tmp/tmx-auth-ui.rIekiS/evidence/results.json`, screenshots e
`ui-retry.log`. Os probes de sandbox ficam no mesmo diretório. A primeira tentativa
de login recebeu CORS 500 porque a fixture usava 127.0.0.1:3100 em vez do localhost:3100
permitido em desenvolvimento. Corrigido somente o endereço da fixture e repetida a
rodada; a política de CORS da aplicação não foi alterada.

## Limites

Dados sintéticos não substituem validação de totais financeiros reais, cobrança,
entrega de webhooks ou integrações externas. Nenhum desses envios foi exercitado.
Durante a fixture, cotações externas ficaram bloqueadas e a API utilizou seu fallback.
Não afirmar aprovação integral do produto nem compatibilidade live com Railway.
O smoke não percorreu todos os botões de escrita, não povoou tabelas financeiras nem
simulou conversões externas. Captura de exceções não equivale à auditoria completa de
todos os warnings do console. O build passou; a base Browserslist antiga e o aviso de
`next start` para output standalone continuam separados de falhas de aplicação.
