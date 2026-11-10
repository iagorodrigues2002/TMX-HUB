# Publicação do Spy

Autorização: testar e publicar o Spy, incluindo execução no servidor com o Mac desligado. A autorização de uso do saldo ScrapeCreators, sem teto interno e sem recarga automática, permanece. Nenhum envio à Meta.

## Escopo

- Página, navegação e permissões das quatro subabas; catálogo compartilhado por empresa, persistência com revisão para evitar sobrescrita e validação do responsável entre membros ativos.
- Credencial criptografada, imagens e histórico no volume Railway do web, montado em `/data`; `TMX_SPY_DIRECTORY=/data/spy`. Um processo coletor por réplica web, iniciado pelo entrypoint versionado, com heartbeat e retomada de checkpoints. Manter uma réplica para este armazenamento em volume.
- Acesso validado na API por usuário e empresa em toda requisição; nenhuma credencial de infraestrutura necessária no web. Central mostra descobertas somente ao responsável e mantém leitura/histórico. Fixtures locais não são expostas na produção.
- Migração preserva datas do ciclo, saldo, reservas, responsáveis e duas notificações já existentes. Namespace de deduplicação preservado na mudança de usuário local para empresa. Não reiniciar os sete dias.
- Cadastro real e links de pesquisa ficam no volume autenticado, fora do Git e do bundle público. Fixtures de testes são sintéticas. O repositório é público.

## Alvos e recuperação

- Railway projeto `3704cd93-6011-4e5f-be52-f229b499b018`, ambiente `bbb09ce3-96ce-44d4-8a3c-d8c8f25f558b`. Sempre especificar os alvos, pois o vínculo padrão do CLI é outro projeto.
- API `a8bb8afa-b7a3-4b41-827d-d91fd3a283a4`; web `37eb63d7-2ba4-46ed-bc0f-113c275eba37`. Base Git `6778e2f2ec8f90e24b66ee620109e8d4871b1adb`.
- Volume novo `ecf78f00-70f8-41e5-ab91-66385261c751`. Estado original local preservado e cópia de migração privada em `.runtime/spy-server-data`, ignorada pelo Git. Coletor do Mac parado para evitar duplicidade.
- Publicar API antes do web, a partir de arquivo Git limpo e apenas arquivos do escopo. Preservar sincronizador Tráfego e configuração existente de API, banco e Redis.
- Em erro de acesso, perda de estado ou falha de saúde: reverter primeiro o web à base anterior, depois API ao deployment anterior `659fe568-b6c2-4927-8f08-c3263914af18` se necessário. Preservar o volume e os dados; nunca apagar chave ou histórico para reverter código. Não iniciar novamente o coletor local enquanto o remoto estiver ativo.

## Conferência

- Antes do envio: origem com 29/29 ofertas verificadas, 29 responsáveis, zero erros, duas notificações; 11.450 imagens referenciadas e 862.978.274 bytes de mídia copiados, último saldo 23.743 créditos. Preparação da migração não fez chamadas pagas.
- Gates e evidência final serão registrados após a execução; não confundir preparação com publicação concluída.

### Gates anteriores ao deploy

- Web: 426 testes na suíte completa aprovados; novo teste de isolamento de notificações entre empresas aprovado na rodada focada de 16 testes. Core: 78 aprovados; shared: 14 aprovados.
- API: 681 aprovados e 165 ignorados por ausência de fixtures de banco. O único timeout da rodada conjunta foi no primeiro teste de HMAC, por importação fria/concorrência; os seis testes desse arquivo passaram isoladamente (primeiro em 609 ms), sem alterar a implementação nem as asserções. Testes de acesso Spy incluem injeção HTTP, suspensão, empresa alheia e concessão por subaba.
- Build/tipos de API e web aprovados. Biome: 54 arquivos, zero erros/avisos. Auditoria de dependências de produção: zero altas/críticas, 14 moderadas e quatro baixas preexistentes. Scan dos 58 arquivos do release: nenhuma credencial detectada; nenhum cadastro real, `.key` ou dado de `.runtime` incluído.
- Dados remotos conferidos por SHA-256 de todos os 11.450 arquivos de mídia e do estado: idênticos à origem de migração. Credencial criptografada validada sem fazer request pago; chave/histórico com modo 600 e diretórios privados 700. Upload concluído.

Limites: mídia não fornecida pela API não é inventada. Paginação completa representa cobertura do provedor, não prova universal de todos os anúncios visíveis no site Meta. Criação OAuth de pastas Drive não integra este release; links existentes continuam funcionando.
