# Validação pré-publicação — 03/11/2026

Base comparada com os serviços web/API ativos no Railway: `414e2b564bcffb0c72563f36a55fa2105286b048`.
Esta evidência precede o corte de produção; não é confirmação de deploy.

## Gates locais

- API: 750/750 testes, zero falhas e zero skips, incluindo PostgreSQL/Redis descartáveis.
- Segurança/reembolsos Node: 30/30; core: 78/78; shared: 12/12; web: 250/250.
- Adaptador nativo do Discord: 43/43, com rede bloqueada, e revisão independente.
- Typecheck shared/core/API/web e builds core/API/web aprovados. Web: 35 páginas.
- Biome global aprovado. Lints adicionais mantêm avisos de tamanho de arquivos e promessas já revisados; não foram silenciados.
- Migrações ensaiadas do zero e repetidas: 107 entradas até a migração 114, sem perda de dados.
- Cópia local autenticada conferida no navegador; dados comerciais de homologação não são enviados externamente.

## Correções encontradas no gate

- Autorização contextual impede usar permissões da empresa A para acessar ferramentas/dados restritos da empresa B; agregados também filtram o escopo permitido.
- Pausa temporária de cadastros e agenda permite executar a transição sem corrida com alterações de contas/ofertas. Login, consultas e ingestão comercial permanecem livres.
- Intake Discord consulta a mensagem original para verificar autor/conteúdo; não confia nesses campos do webhook público.
- Botões Discord validam assinatura nos bytes originais, com limite temporal, e respondem antes de atualizar o TMX.
- O publicador legado deve parar antes da ativação do publicador nativo; nenhuma tarefa ClickUp é importada.

## Inventário e corte

Inventário live somente leitura: 17 usuários e 19 ofertas, cobertos integralmente pelo manifesto privado revisado. Preservar RWS_TTK na TMX. Iago/Lucas permanecem globais; Douglas administra somente a TMX; Yola conserva suas duas empresas.

Publicação deve seguir `docs/company-transition.md`: API primeiro com pausa real, backup, migrações, manifesto, papéis, painel, corte n8n e retirada da pausa. Verificar validade do índice concorrente 114. Não trocar tokens, URLs de pagamento ou credenciais comerciais.

Ainda exigidos após o corte: saúde dos serviços, telas autenticadas, matrizes de acesso e recibos reais de tarefas/calls no n8n/Discord. Não criar vendas ou conversões de teste. Não considerar importação de rascunho como integração funcionando.
