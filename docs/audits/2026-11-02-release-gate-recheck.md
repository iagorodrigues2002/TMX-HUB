# Rechecagem de publicação — 02/11/2026

## Decisão: não publicar o pacote completo

Pedido: validar localhost e publicar apenas se estiver correto. Revisão paralela
de permissões, API e web; nenhuma escrita remota, commit ou push realizado.

## Verificações desta rodada

- API: 657 testes aprovados, 115 arquivos, PostgreSQL descartável, rede externa bloqueada.
- Web: 199 testes aprovados, zero ignorados; typecheck e build produção aprovados (35 páginas).
- Shared: 12 testes; Core: 78 testes aprovados.
- Biome: 1051 arquivos sem erros. Typecheck e build API aprovados.
- Smoke do localhost: activity, Ads Intelligence, reembolsos, SyzePay empresas e
  conexões, calls, contrato404 e isolamento externo aprovados.
- Navegador localhost3120: visão geral, membros e reembolsos renderizaram com os
  dados sintéticos. Sem erros nos logs consultados dessas navegações. Isso não é
  validação das contas reais nem cobertura de todas as interações.
- Build web isolado em .next-build; referência gerada restaurada ao cache da prévia.

## Bloqueadores confirmados no código

1. `routes/offers/get-offers.ts:48`: POST /offers retorna403 para todo não-admin-global
   que já tem membership, inclusive proprietário e admin empresarial. Falta fluxo de
   criação com empresa explícita; `OfferStore.create` ainda só persiste no Redis.
2. `routes/task-management.ts:48` e `routes/call-management.ts:14`: gestão exige
   admin global. Douglas, ao virar admin da TMX, perde gestão de tarefas/calls.
   Não basta retirar guard: as consultas precisam ser isoladas por empresa.
3. `services/offer-store.ts:221`: exclusão remove Redis sem remover company_offers/
   grants. `routes/companies.ts:218` usa get em todos os vínculos, então vínculo órfão
   faz a listagem inteira falhar404. Cobrir exclusão/reconciliação antes do corte.
4. Manifesto real e corte ainda pendentes; role global de Douglas não pode ser
   removida antes de o novo acesso funcionar. Não aplicar109 isoladamente.
5. Mudança TASK_MANAGEMENT_MODE para native filtra calls legadas e bloqueia ponte
   antiga. Exports n8n locais estão desativados/com placeholders. Estado remoto e
   continuidade das calls/publicador único ainda precisam ser verificados.

Os testes atuais não cobrem esses ciclos completos. Resultado verde de compilação
não é liberação de produção. Avisos de dependências do relatório anterior também
não foram resolvidos nesta rodada. Não houve teste de carga ou envio comercial.
