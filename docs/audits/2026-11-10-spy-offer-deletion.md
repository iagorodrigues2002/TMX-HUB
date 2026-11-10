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

Publicação confirmada: commit `3e5f020320de6b9c79770beb363d3a5e3c8472cd`, deployment web `66f9f912-9ea9-4d1c-9aa9-a7ab888d0a5a`, SUCCESS. API permaneceu no deployment anterior. Conferência autenticada no navegador confirmou os quatro ícones nas abas principais e na navegação móvel, ausência de “Com pendências” e ação Excluir nos cards. Confirmação de MJ aberta e cancelada; os 29 cadastros continuaram presentes. Nenhuma exclusão de oferta real foi enviada para testar.

Leituras autenticadas após o deploy confirmaram catálogo, imagens, notificações e conexão Tráfego disponíveis, com heartbeat do coletor ativo. O estado corrente das escolhas de acompanhamento foi respeitado. As provas de exclusão efetiva, conflitos e isolamento foram feitas em diretórios temporários com dados sintéticos, sem API comercial.

## Exclusão em massa

“Excluir selecionadas” reutiliza a confirmação, exibindo quantidade e lista com nomes/domínios. Uma requisição autenticada remove o lote em uma única gravação do catálogo, com revisão e permissão de edição. Seleção vazia, IDs repetidos, item inexistente ou revisão antiga são recusados antes de qualquer remoção. Acompanhamentos das ofertas excluídas param; demais ofertas e históricos permanecem intactos. A rota individual anterior continua compatível.

431 testes web aprovados, build Next/tipos e Biome do escopo aprovados. Testes HTTP com dados sintéticos cobrem lote permitido/negado e empresa alheia; teste do serviço comprova que um item inválido não resulta em exclusão parcial.
