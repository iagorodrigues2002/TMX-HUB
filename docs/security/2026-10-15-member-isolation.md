# Auditoria de isolamento entre membros — 15/10/2026

## Requisito e escopo

Um membro acessa apenas seus próprios recursos; somente o administrador global pode acessar recursos de outros membros. Compartilhamentos legados não concedem mais exceção. Dados e relações legadas foram preservados, sem migração destrutiva.

Revisão estática de 107 declarações de rotas centrais e 117 declarações de ferramentas/integrações, com testes locais de autenticação, propriedade e sessão. Esse inventário não significa execução de cada rota em produção, pentest integral ou cobertura completa do OWASP API Top 10. Não demonstra ausência de acessos históricos indevidos.

## Achados corrigidos

- [F-201](../../TASK/items/F-201.md): compartilhamento legado de ofertas entre membros.
- [F-202](../../TASK/items/F-202.md): auditoria de operadores de terceiros visível a proprietário não administrador.
- [F-203](../../TASK/items/F-203.md): privilégio administrativo obsoleto em cache após rebaixamento.
- [F-301](../../TASK/items/F-301.md): nichos e áudios white compartilhados entre membros.
- [F-302](../../TASK/items/F-302.md): preview privado de clone sem autenticação e propriedade.
- [F-401](../../TASK/items/F-401.md): cache e estado de interface sobrevivendo à troca de membro.
- [F-402](../../TASK/items/F-402.md): históricos e presets locais sem namespace de proprietário.

Os achados estão corrigidos em código e verificados com fixtures locais. A conferência visual autenticada com troca de membros permanece pendente; não se utilizaram dados ou credenciais de outros membros em produção.

## Evidências de validação

- Testes API focados em isolamento, autenticação e auditoria: 40 casos aprovados na revisão independente.
- Typecheck da API aprovado na revisão independente.
- Build novo da API (`pnpm --filter @page-cloner/api build`): aprovado.
- Suíte web (`pnpm exec tsx --test packages/web/test/*.test.ts`): 15 casos aprovados, incluindo quatro de isolamento da sessão/preview.
- Typecheck e build web: aprovados pelo agente de interface.
- `git diff --check`: aprovado.
- Não há nova migração, alteração de variáveis, replay de webhook ou alteração financeira nesta entrega.

## Limitações e comportamento preservado

- Privilégios administrativos são revalidados no armazenamento a cada requisição; permissões comuns de membro ainda usam cache local de até 20 segundos entre processos.
- Downloads já emitidos com URL pré-assinada continuam válidos até expirar (janelas existentes de 1–24 horas). A correção não revoga capabilities previamente emitidas.
- Três falhas de testes OAuth já existentes foram registradas durante a auditoria; a suíte focada acima não deve ser apresentada como aprovação da suíte API integral.
- Links públicos do funil, captura e webhooks permanecem públicos conforme seu contrato próprio, sem expor o preview administrativo privado.
- Persistência local legada sem proprietário não é migrada automaticamente: sem prova de dono, não é exibida a um novo membro.
- Segurança é um controle contínuo: não se afirma “vazamento zero” nem inexistência de incidente histórico com base nesta auditoria.
