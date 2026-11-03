# Validação local com cópia integral dos bancos live — 03/11/2026

## Limites e isolamento

- Base local e deploys ativos web/API conferidos em `414e2b564bcffb0c72563f36a55fa2105286b048` antes da captura. As alterações pendentes foram preservadas.
- Captura PostgreSQL consistente em transação somente leitura: 81 tabelas, 2.255.793 registros, 20.608 pedidos, 19.834 recibos VendePay e 1.532.492 eventos de tracking. Arquivo custom de 437.472.382 bytes, checksum verificado antes da restauração.
- Exportação Redis completa offline: 14.714 chaves, 12.408.476 bytes. SCAN é incremental, não é um snapshot transacional conjunto com PostgreSQL.
- Arquivos privados fora do Git, diretório `0700` e dados `0600`. Não inclui os binários externos do S3, logs de infraestrutura nem variáveis secretas do Railway.
- No Redis de execução foram restaurados somente usuários sanitizados, ofertas, índices de ofertas e métricas. Senhas e emails de login são exclusivamente locais. Filas, credenciais, sessões, convites e tokens live não foram ativados.
- API local usa `buildApp`, não `server.ts`; nenhum worker comercial é iniciado. Rede externa negada pelo sandbox, acesso loopback comprovado. Nenhum push, deploy, replay comercial, conversão ou notificação externa.
- A primeira restauração encontrou falta de espaço no disco virtual do Docker. Somente esse container/volume parcial recém-criado foi removido; a cópia original permaneceu intacta. Restauração final em diretório exclusivo do host, sem reiniciar os outros bancos ou a prévia 3120.

## Verificações do histórico

- Zero grupos duplicados por projeto, provedor, conexão e ID externo do pedido.
- Zero pedidos pagos sem `paid_at`; zero valores de pedido negativos.
- Oito pedidos sem BRL persistido são abandonados/recusados com moedas legadas inválidas; nenhum está pago.
- 45 recibos em quarentena são históricos (28/07–12/08). Não foram liberados automaticamente.

## Reembolsos: correções e evidência

1. Recuperar primeiro recebimento confirmado **antes** de filtrar as devoluções pelo período. `paid_at` e data do provedor não substituem o recebimento.
2. Reconhecer recibos legados `processable` além de `processed`, exigindo conteúdo de reembolso/chargeback, ID da transação, projeto e conexão exatos. Reenvios não alteram o primeiro recebimento.
3. Expor a reconciliação entre naturais, com clique e origem indeterminada. Não classificar histórico desconhecido como natural por conveniência.
4. Expor valores sem recebimento comprovado separadamente, sem atribuí-los artificialmente a um mês.

Na cópia, 334 das 335 pendências de recebimento foram resolvidas apenas pelo novo read-model. Das 636 devoluções existentes no escopo TMX, 635 têm recibo comprovado. A restante é de R$ 99,90, com multa estimada de R$ 146,81; não se usaram recibos de outra conexão para completar a data.

| Período do recebimento | Geral | Naturais | Com clique | Indeterminadas |
| --- | ---: | ---: | ---: | ---: |
| Outubro/2026 | 295 · R$ 50.522,39 | 188 · R$ 28.742,12 | 48 · R$ 8.751,41 | 59 · R$ 13.028,86 |
| 01–02/11/2026 | 34 · R$ 5.942,46 | 21 · R$ 3.554,37 | 12 · R$ 2.306,54 | 1 · R$ 81,55 |

Valores acima são devoluções, sem multas. Em outubro, multas configuradas/conversão em cache somam R$ 43.308,95. Não equivalem a extrato confirmado de cobrança do gateway.

Auditoria dos payloads de devolução: nenhum recibo vinculado encontrado com pedido ainda pago/sem timestamp de reversão, nem transação divergente. Um recibo em quarentena sem vínculo e dois com conexão incompatível foram preservados e excluídos da recuperação automática.

## Empresas e permissões

- Ensaio local da migração: 3 empresas, 19 ofertas, 17 contas e 1 call legada; segunda execução idempotente, sem alterações de role pendentes.
- 206 verificações HTTP em 17 contas aprovadas: escopos de ofertas, membros, financeiro/Pix, tarefas, calls, notificações e consolidado de reembolsos; acessos cruzados rejeitados.
- O consolidado de reembolsos não depende mais de o usuário ser o dono legado das ofertas. Resolve a empresa ativa, exige escolha quando há múltiplas e filtra as ofertas autorizadas no servidor. Ofertas de outra empresa são recusadas; o seletor não as expõe. Iago, Lucas e Douglas obtêm o mesmo consolidado da TMX no ensaio.
- Preferências de notificações testadas com zero/uma oferta e restauradas ao estado anterior na cópia.
- Fingerprint de pedidos/valores/datas e quantidade de recibos preservados após o ensaio empresarial.
- RWS_TTK ainda existe no snapshot, embora sua exclusão tenha sido relatada. O vínculo à TMX foi usado **apenas no ensaio local**, preservando metadata e pedido. O manifesto local não autoriza aplicar essa decisão em produção.

## Desempenho e correções de homologação

- Ads Intelligence: índice parcial de PageViews na migração aditiva `114`. Contraprova aquecida: mediana do handler 3.607 ms → 1.321 ms (~63%); consulta de checkouts 2.900 ms → 994 ms (~66%). Hashes das respostas e fingerprints comerciais iguais. Índice de cerca de 55 MiB nesta cópia, com custo adicional de manutenção apenas para PageViews.
- Login da nova prévia 3122 falhava por CORS. Permitida exatamente a origem `http://localhost:3122` somente em desenvolvimento/teste; recusada em produção. Preflight e login conferidos por teste e navegador. Nenhuma ampliação das origens de produção.

## Gates automáticos finais

| Gate | Resultado |
| --- | --- |
| API | 710 testes aprovados |
| Web | 223 testes aprovados |
| Core / Shared | 78 / 12 aprovados |
| Segurança e reembolsos adicionais | 30 aprovados |
| Total | **1.053 aprovados, sem falhas ou ignorados** |
| Migrações | 107 entradas até `114` em banco novo; reexecução sem reaplicar |
| Cópia live | Migrações pendentes até `114` aplicadas somente localmente; reexecução idempotente |
| Typecheck / Biome | Aprovados; Biome sem erros/avisos |
| Build de produção | Core, API e Web aprovados; 35 páginas geradas |

Restam 19 avisos ESLint não bloqueantes (tamanho de arquivos/handlers preexistentes) e aviso de Browserslist desatualizado. Não houve atualização indiscriminada de dependências nem refatoração ampla para silenciar os avisos.

## Validação da aplicação e limites

- Prévia compilada da cópia: `http://localhost:3122`, API loopback 4112; prévia 3120 anterior preservada. O artefato web foi compilado com URLs e banner locais e **não é o artefato a publicar diretamente**.
- No navegador: login, reembolsos de outubro, alternância geral/natural/com clique, valores conciliados, distribuição de prazos, membros TMX, financeiro desconectado, tarefas/call legada e resultados/atividade. Outubro mostrou 295 devoluções, média de 12,6 dias e mediana de 6,6 dias; não mais prazo artificial de zero para todos. Em resultados de 02/11, Douglas mostrou 25 upsells / R$ 5.270,64 e Lucas 24 / R$ 3.297,99. No Upsell Intelligence PJR_ENG, 1.228 compradores: trocar de 20 para 50 e avançar preservou o tamanho selecionado (51–100).
- Leitura HTTP adicional: 11 rotas gerais e 18 endpoints de tracking/upsells/Ads aprovados. PJR_ENG: 1.228 compradores e 3 etapas; SLM_DE: 392 compradores e 5 etapas; paginação 10/20 conferida. Pedidos (20.608), tentativas operacionais (24.192), créditos (1.808) e etapas (27) preservados.
- As credenciais reais de gateway, criptografia, email, bancos e automações não foram carregadas no runtime. Portanto, abrir um upsell autenticado no gateway, enviar notificações, sincronizar Wise/LootRush ou disparar pixels **não foi validado ponta a ponta** nesta homologação. Nenhuma venda/conversão real ou de teste foi enviada.
- Um reembolso permanece sem recebimento comprovado; 59 devoluções de outubro têm origem operacional indeterminada. São limites dos dados históricos, expostos na tela, não valores inventados.
- A situação de RWS_TTK ainda impede tratar o manifesto de migração de empresas como aprovado para produção. Não houve push, deploy ou mudança nos dados live.
