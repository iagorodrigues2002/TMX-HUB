# Permissões por aba — homologação local

- Editor empresarial reutiliza nomes, ícones e hierarquia de `NAV_ITEMS`.
- Marcação por grupo, subaba e estado parcial; opções reservadas a admin global não são delegáveis.
- Seleção explícita usa `nav:scoped` e chaves `nav:*` no array persistido de ferramentas. Não exige migração nova.
- Sem edição, concessões legadas continuam compatíveis. Seleção vazia explícita não libera áreas.
- Papéis de proprietário/admin empresarial mantêm seus poderes existentes; o seletor granular é para colaboradores.
- Menu, acesso por URL e API verificam as novas permissões. Verificações de empresa/oferta permanecem obrigatórias.
- Consultas compartilhadas de configuração não retornam listas de gateways, domínios, links, testes A/B ou vTurb de áreas não liberadas.
- Conta sintética QA member foi salva sem Upsell Intelligence: login 200, listagem de ofertas 200, resumo 200, upsell-identities 403. Não houve alteração de conta real.

## Evidências

- 41 testes API aprovados em oito arquivos (inclui isolamento empresarial e regressão de notificações).
- 25 testes web aprovados em cinco arquivos.
- Typecheck shared/API/web aprovado.
- Lint dos seis arquivos novos aprovado após organização e formatação.
- Editor salvo e reaberto no navegador em localhost:3120/empresa/membros.

## Limites

Nada publicado. Não executada a suíte completa, build de produção ou auditoria universal de todas as rotas.
As funções já exclusivas de admin global continuam exclusivas: selecionar abas não eleva papéis.
Antes de publicar, revisar o conjunto das demais alterações pendentes e testar os fluxos completos das integrações com uma conta restrita. Endpoints comerciais desconhecidos ficam bloqueados para a seleção granular, em vez de permitidos por padrão.
