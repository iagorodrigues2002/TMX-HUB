# Spy — ícones e exclusão de ofertas

Pedido: diferenciar ícones das subabas, permitir excluir ofertas e remover o filtro “Com pendências”.

- Navegação lateral e abas principais: Tags em Ofertas, Activity em Acompanhamento, Copy em Clonagem e Settings2 em Configurações; Radar preservado na seção Spy.
- Exclusão disponível no card, tabela e detalhes, para quem tem permissão de edição. Confirmação explícita, estado de carregamento e mensagem de erro sem ocultar a oferta quando a gravação falha.
- Endpoint autenticado com validação da empresa, permissão de edição, origem e revisão do catálogo. Remoção retira o cadastro da visualização e interrompe o acompanhamento; histórico e mídia coletados são preservados. Jobs excluídos ficam fora dos contadores e das consultas, sem possibilidade de retomada por requisição antiga.
- Compatível com o estado persistido anterior, sem migração de banco ou descarte de snapshots. Mudanças concorrentes retornam 409.
- Removido apenas o filtro “Com pendências”; informações específicas do cadastro continuam nos detalhes.

Validação: 430 testes web aprovados, incluindo casos de origem, permissão, revisão obsoleta, isolamento entre empresas, persistência, preservação do histórico e nenhuma nova coleta após excluir. Build Next e tipos aprovados, Biome do escopo sem erros. Testes de exclusão usam ofertas sintéticas e diretórios temporários; nenhuma oferta real foi excluída para testar.

Os 165 testes anteriormente ignorados também foram executados em bancos e Redis descartáveis: 165/165 aprovados, 206 testes totais nos arquivos selecionados, zero falhas/ignorados. As quatro correções de mocks de Redis permanecem separadas desta publicação da interface.

Base web de recuperação: deployment `464e3dab-fb60-4e6c-8f04-d80862859ac8`. Manter volume e credencial existentes. API não requer alteração para este ajuste; coletor web segue no entrypoint versionado.
