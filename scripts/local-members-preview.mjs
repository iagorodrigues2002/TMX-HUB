import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = '3704cd93-6011-4e5f-be52-f229b499b018';
const web = '37eb63d7-2ba4-46ed-bc0f-113c275eba37';

export function assertLiveBaseline(status, head) {
  if (status.id !== project || !/^[a-f0-9]{40}$/.test(head)) {
    throw new Error('Projeto ou revisão inválida. Prévia não iniciada.');
  }
  const production = status.environments.edges.find(({ node }) => node.name === 'production');
  for (const service of ['@page-cloner/web', '@page-cloner/api']) {
    const instance = production?.node.serviceInstances.edges.find(
      ({ node }) => node.serviceName === service,
    )?.node;
    const active = instance?.activeDeployments?.filter((deploy) => !deploy.deploymentStopped);
    if (active?.length !== 1 || active[0].status !== 'SUCCESS') {
      throw new Error(`${service}: deploy ativo não está estável. Confira antes de iniciar.`);
    }
    if (active[0].meta?.commitHash !== head) {
      throw new Error(
        `${service}: base local diferente do live. Atualize preservando as alterações pendentes.`,
      );
    }
  }
}

export function previewEnvironment(head, flag, compiled = false) {
  if (!['0', '1'].includes(flag)) throw new Error('Configuração visual do live não identificada.');
  return {
    NODE_ENV: compiled ? 'production' : 'development',
    NEXT_DIST_DIR: compiled ? '.next-native-compiled' : '.next-native-preview',
    API_PROXY_TARGET: 'http://127.0.0.1:4110',
    NEXT_PUBLIC_API_URL: 'http://localhost:3120',
    NEXT_PUBLIC_TMX_SIGNAL_PREVIEW: flag,
    NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND: 'synthetic',
    NEXT_PUBLIC_TMX_LOCAL_BASE: head.slice(0, 7),
  };
}

function main() {
  const run = (command, args) =>
    execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const head = run('git', ['rev-parse', 'HEAD']);
  const status = JSON.parse(
    run('railway', ['status', '-p', project, '-e', 'production', '--json']),
  );
  assertLiveBaseline(status, head);
  // Somente a flag pública é usada; credenciais e destino da API live não são copiados.
  const flag = JSON.parse(
    run('railway', ['variable', 'list', '-p', project, '-e', 'production', '-s', web, '--json']),
  ).NEXT_PUBLIC_TMX_SIGNAL_PREVIEW;
  const compiled = process.argv.includes('--compiled');
  const env = previewEnvironment(head, flag, compiled);
  const expected = JSON.parse(readFileSync(resolve(root, 'packages/web/package.json'), 'utf8'))
    .dependencies.next;
  const installed = JSON.parse(
    readFileSync(resolve(root, 'packages/web/node_modules/next/package.json'), 'utf8'),
  ).version;
  if (expected !== installed) {
    throw new Error(
      'Dependências locais desatualizadas. Execute pnpm install --frozen-lockfile na raiz.',
    );
  }
  console.log(
    `Base live conferida: ${head.slice(0, 7)} · visual ${flag} · alterações locais preservadas · dados sintéticos.`,
  );
  if (process.argv.includes('--check')) return;
  if (compiled) {
    console.log(
      'Compilando a prévia local. Após editar código, reinicie com --compiled para atualizar.',
    );
    try {
      execFileSync('pnpm', ['exec', 'next', 'build'], {
        cwd: resolve(root, 'packages/web'),
        env: { ...process.env, ...env },
        stdio: 'inherit',
        timeout: 120_000,
      });
    } catch {
      throw new Error('Falha ao compilar a prévia local. Confira os erros de build acima.');
    }
  }
  const child = spawn(
    'pnpm',
    ['exec', 'next', compiled ? 'start' : 'dev', '--port', '3120', '--hostname', '127.0.0.1'],
    {
      cwd: resolve(root, 'packages/web'),
      env: { ...process.env, ...env },
      stdio: 'inherit',
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    console.error('Falha ao iniciar pnpm/Next.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error && !('stderr' in error)
        ? error.message
        : 'Não foi possível conferir o live. Verifique conexão e login Railway. Nenhum arquivo alterado.',
    );
    process.exitCode = 1;
  }
}
