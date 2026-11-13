# Assistente IA por empresa

## Contrato de acesso

- `nav:ai-assistant` libera o chat; não libera nenhuma outra área ou oferta.
- A API relê o usuário, o vínculo ativo e as ofertas autorizadas em cada chamada. A união das permissões de várias empresas na sessão não autoriza os dados de uma empresa específica.
- Campanhas, criativos, vendas, upsells e devoluções passam por filtros de área e oferta antes de chegar à OpenAI. Financeiro interno e dados pessoais de compradores não entram no contexto.
- Conversas e deduplicação usam empresa + usuário. Mudanças nas permissões invalidam o histórico visível e são conferidas novamente antes/depois da geração.
- A página completa e o chat flutuante compartilham a mesma consulta de histórico. O cache da interface também inclui usuário, empresa e revisão de permissões.

## Produção

A migração `121_company_ai.sql` cria a configuração e o histórico de otimizações por empresa. As chaves são criptografadas com uma chave derivada da empresa e de `TRACKING_ENCRYPTION_KEY`; nunca são retornadas ao navegador. Manter esse segredo estável nas próximas implantações.

O ambiente publicado lê vendas diretamente do banco e mídia dos snapshots da empresa já coletados pelo TMX. Não faz consultas extras à Meta, não usa arquivos do Mac e não depende da ponte da prévia. Ausência ou atraso de mídia é informado como cobertura incompleta, não como gasto zero.

Uma rotina a cada cinco minutos preserva alterações confirmadas disponíveis na fila de gerenciamento do TMX. Não observa mudanças feitas diretamente no gerenciador da Meta. A recuperação inicial depende dos eventos ainda retidos na fila; até mil eventos recentes são examinados por ciclo e até cem entram no contexto.

A migração 122 mantém uma memória cumulativa por empresa e oferta em `company_ai_learning`. Após maturação de quatro dias e cobertura completa, o coletor compara três dias antes/depois, sem o dia da alteração. Guarda observações por evento de forma idempotente e atualiza a evidência quando o snapshot muda. O assistente recebe padrões agregados, incluindo casos favoráveis e contrários; menos de três casos é amostra insuficiente. Isso é aprendizado operacional persistente, não treinamento dos pesos da OpenAI nem prova de causalidade. Não aprende automaticamente fatos fora das fontes integradas; orientações humanas globais continuam nas instruções administrativas. Memórias respeitam as ofertas e áreas autorizadas.

Perguntas com períodos relativos usam datas de Brasília. Reembolsos são consolidados em BRL (ou USD quando solicitado), com cotações armazenadas e indicação de falta de cotação. Médias incluem dias sem registros e separam o dia atual parcial. O contexto usa métricas compactadas e exclui dados de campanha em perguntas exclusivamente sobre devoluções. O teto artificial de 50 mil tokens foi removido; permanecem a capacidade real do modelo, o limite diário da empresa e a reserva de custo, incluindo sobretaxa oficial de contexto longo.

Redis mantém as últimas cinquenta interações por usuário/empresa por trinta dias, além dos controles atômicos de orçamento. Requests usam Responses com `store:false`, contexto limitado, reserva prévia de custo e nenhuma repetição automática após envio incerto. O limite é por empresa, em USD, com dia UTC. Não importar conversas de QA para produção.

## Validação de 12/11/2026

- 53 testes de API: contexto, permissões, revogação, configuração concorrente, criptografia, isolamento de empresas/usuários, persistência após recriação do servidor, deduplicação e orçamento.
- Nove desses testes usam PostgreSQL `tmx_ai_test` separado, schemas descartáveis e Redis temporário. Exigem `AI_TEST_DATABASE_URL` apontando explicitamente para esse banco local. Não usar banco da prévia ou produção.
- 455 testes da interface passaram com `NODE_ENV=test`; a repetição focada após os ajustes visuais passou em treze testes.
- Navegador: histórico compartilhado, maximizar, fechar/reabrir com Escape, recarregar e rolagem interna. As chamadas reais da OpenAI com o perfil restrito já foram validadas na prévia; as suítes automatizadas usam um provedor simulado.
- TypeScript da API e builds de API/web verificados. Lint dos serviços e componentes da IA sem erros; apenas o renderizador imutável de Markdown permite chaves posicionais, sem componentes interativos.

Os testes automatizados não garantem disponibilidade futura da OpenAI. A configuração e os resultados do deploy devem ser verificados separadamente após a publicação.
