# Gestão nativa — acompanhamento

- [x] Confirmar escopo sem importação e criar worktree isolado.
- [x] Ler dependências ClickUp de tarefas, notificações e calls.
- [x] Baseline de testes e builds internos, sem recursos de produção.
- [x] Contratos, modo nativo e migração aditiva.
- [x] Criar/listar/editar tarefas e histórico; testar idempotência e legado preservado.
- [x] Status imediato por admin e responsável; testar autorização, concorrência e central.
- [x] Outbox Discord e retorno dos botões; confirmação/replay/falha/quarentena testados localmente.
- [x] Calls e lembretes nativos, sem ClickUp.
- [x] Painel e cadastro de pessoas sem exigência de vínculo ClickUp.
- [x] Três workflows n8n locais inativos, sem segredos, com Discord simulado.
- [x] Suítes afetadas, tipos, lint e builds aprovados.
- [x] Verificação visual local e evidências de criação/edição/status/notificações/call.
- [x] Revisão final e documentação de pendências antes de publicação/ativação.

## Evidências de 01/11/2026

- API completa: 565 testes aprovados, 36 ignorados de outras integrações/ambientes; 99 arquivos aprovados, 4 ignorados.
- Suítes de tarefas/calls/central: 31 aprovados, nenhum ignorado, em PostgreSQL descartável local.
- Web: 142 aprovados, nenhum reprovado. Typechecks API/web aprovados. Biome nos arquivos alterados e builds API/web aprovados.
- HTTP integrado com provider simulado: criação de dois cards, recibos idempotentes, retorno autenticado de botão por membro, PATCH no mesmo ID e atualização da central individual.
- Chrome `http://localhost:3120/tarefas`: criação, edição com três responsáveis, progresso, histórico, leitura sem remoção, conclusão com remoção da central e call fictícia em 02/11 às 14h (São Paulo).
- Screenshot local: `/tmp/tmx-native-tasks-20261101.png` (dados sintéticos).
- Original e produção não alterados; sem commit/push, migração em produção ou workflows ativados.

## Fora da validação atual

- [ ] Importar/validar rascunhos no n8n real e testar entrega/retorno reais com autorização.
- [ ] Definir cutover dos lembretes de calls legadas, sem importá-las nem interrompê-las silenciosamente.
- [ ] Configurar canais e credenciais reais e confirmar publicador único antes da ativação.
- [ ] Publicação em produção, somente após nova autorização.
