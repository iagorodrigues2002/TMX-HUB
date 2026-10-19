# Preparação local

Leia [AGENTS.md](../AGENTS.md), [PRODUCT.md](../PRODUCT.md) e [DESIGN.md](../DESIGN.md).
Este roteiro é manual, não comprova que serviços/testes funcionaram. Evidências ficam em
[setup.md](setup.md); comandos de verificação em [quality.md](quality.md).

## Pré-requisitos

Node >=22 e pnpm 9, com pnpm@9.12.0 declarado no package.json. Redis, PostgreSQL e
storage S3 compatível são necessários conforme o módulo; render exige Chromium/Playwright.
Para os comandos ESLint adicionados no setup, use Node 22.13+ ou 24.
Reutilize ferramentas globais. Instalações/downloads/containers usam rede/disco e respeitam
a autorização da tarefa. Na raiz, a instalação reproduzível é `pnpm install --frozen-lockfile`.
Não instalar num pacote isolado, copiar caches pessoais ou aceitar mudanças inesperadas do lockfile.

## Ambiente descartável, nunca produção

Use `.env.example` como inventário de nomes, não configuração pronta. Não copiar .env
pessoal para testes nem versionar valores. A API valida JWT_SECRET (mínimo 32 caracteres)
em todos os ambientes. Use segredos sintéticos e destinos locais para DATABASE_URL,
REDIS_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY e S3_FORCE_PATH_STYLE.
Tracking também usa TRACKING_ENCRYPTION_KEY e WEBHOOK_SECRET. Deixe credenciais de provedores
e tokens Railway ausentes; use dados fictícios e bloqueie egress na validação de setup.
Ausência de uma chave não garante que todo envio externo esteja desativado.

O compose oferece postgres, redis, minio e minio-init. Se iniciar infraestrutura estiver autorizado,
selecione somente esses serviços e isole volumes/portas. Não rodar `docker compose up` sem seleção:
há serviço api. O compose cria o banco tmx_hub_dev, mas o exemplo de DATABASE_URL aponta para
tmxhub; alinhe no ambiente descartável. Credenciais públicas de MinIO são somente locais.
O serviço api do compose mantém defaults antigos incompatíveis com a validação atual de produção;
não é um atalho validado para primeira execução.

env.ts lê process.env; não presumir que a API/runner carregue .env automaticamente. Forneça
variáveis por mecanismo local autorizado, sem imprimir segredos. O Next lê ambiente próprio:
em `packages/web/.env.local`, NEXT_PUBLIC_API_URL pode apontar para http://127.0.0.1:4000.
Confira API_PROXY_TARGET em `packages/web/next.config.mjs` e no exemplo. Defina também URLs
de tracking locais: defaults com domínio do produto não são destinos de teste. Nenhum segredo
deve entrar em NEXT_PUBLIC_*.

## Boot controlado

Leia [architecture.md](architecture.md): boot da API inicia workers e recupera filas;
`pnpm --filter @page-cloner/api start` aplica migrações. Não usar recursos compartilhados.
Revise runner/SQLs antes de migrar e obtenha autorização específica para o destino. Sem
banco/schema preparado, registre a dependência e continue checks estáticos seguros.

Após preparação e autorização, os comandos existentes são:

```bash
pnpm --filter @page-cloner/core build
pnpm --filter @page-cloner/api dev
pnpm --filter @page-cloner/web dev
```

API/web são processos separados (portas padrão 4000/3100); use terminais distintos.
Workers importam core compilado. Chromium pode ser instalado com
`pnpm --filter @page-cloner/core exec playwright install chromium`, se necessário/autorizado.
`pnpm dev` inicia todos os pacotes em paralelo e não isola efeitos.

## Verificação e retomada

Não usar boot real da API como smoke test do setup. Em UI, usar recursos fictícios e conferir
interações, console e rede; screenshot isolada não prova ausência de erro runtime.
Ao retomar, confira Git/HEAD e alterações locais sem sobrescrever. Comparações remoto/live são
datadas, não sincronização automática; fetch/consulta externa dependem do escopo autorizado.
Não fazer push/deploy/migração/hook/automação por causa deste roteiro. Consulte setup.md para
compatibilidade/pendências; arquivo de skill instalado não prova descoberta no cliente.
