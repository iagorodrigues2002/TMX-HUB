# Referência do design system TMX

Monta o mesmo componente de `/preview/design-system` sem os providers de autenticação, notificações ou proxy de API da aplicação. Todos os dados são fictícios. Requer as dependências já instaladas em `packages/web`; não instalar outra cópia.

Na raiz de `native-task-management`, preparar os links locais uma vez:

```sh
ln -s ../../packages/web/node_modules mockups/design-system-reference/node_modules
ln -s ../../packages/web/public mockups/design-system-reference/public
```

Iniciar apenas este frontend, com ambiente limpo:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 node packages/web/node_modules/next/dist/bin/next dev mockups/design-system-reference --port 3140 --hostname 127.0.0.1
```

Abrir http://127.0.0.1:3140. Não iniciar a API ou workers para revisar esta página.

Build isolado, sem disputar o diretório do servidor de desenvolvimento:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_REFERENCE_DIST_DIR=.next-reference-build node packages/web/node_modules/next/dist/bin/next build mockups/design-system-reference
```
