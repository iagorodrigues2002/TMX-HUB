import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const localPreviewEnvironment = {
  PATH: '/opt/homebrew/bin:/usr/bin:/bin',
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  DATABASE_URL:
    'postgres://tmx_tasks_test:synthetic-native-only@127.0.0.1:32768/tmx_live_preview_20261102',
  REDIS_URL: 'redis://127.0.0.1:32869',
  JWT_SECRET: 'synthetic-native-preview-only-at-least-32',
  TRACKING_ENCRYPTION_KEY: 'synthetic-preview-encryption-key-32-characters',
  WEBHOOK_SECRET: 'synthetic-preview-webhook-only-at-least-32',
  TASK_AUTOMATION_SECRET: 'synthetic-native-preview-bridge-only-12345',
  TASK_MANAGEMENT_MODE: 'native',
  TASK_DISCORD_CHANNELS_JSON: '{"Spy":"456","Calls":"789"}',
  API_PORT: '4110',
  API_HOST: '127.0.0.1',
  PUBLIC_BASE_URL: 'http://localhost:3120',
  TRACKING_PUBLIC_BASE_URL: 'http://localhost:3120',
  INVITE_ACCEPT_URL_BASE: 'http://localhost:3120/register',
  S3_ENDPOINT: 'http://127.0.0.1:32890',
  S3_BUCKET: 'tmx-local-preview',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'synthetic-preview',
  S3_SECRET_KEY: 'synthetic-preview-storage-only',
  S3_FORCE_PATH_STYLE: 'true',
};

export const localNetworkPolicy =
  '(version 1)(allow default)(deny network*)(allow network-inbound (local ip "localhost:*"))(allow network-outbound (remote ip "localhost:*"))';

function main() {
  if (process.platform !== 'darwin') throw Error('Este launcher exige sandbox-exec no macOS.');
  const mode = process.argv[2];
  const target = {
    '--api': ['--import', 'tsx', 'scripts/local-preview-api.mts'],
    '--migrate': ['scripts/migrate.mjs'],
    '--seed': ['--import', 'tsx', 'scripts/seed-complete-preview.ts'],
    '--seed-ads': ['--import', 'tsx', 'scripts/seed-local-ads.ts'],
  }[mode];
  if (!target) throw Error('Use --migrate, --seed ou --api.');
  const port = process.argv[3] ?? '4110';
  if (!['4110', '4112'].includes(port)) throw Error('Porta local inválida.');
  const child = spawn(
    '/usr/bin/sandbox-exec',
    ['-p', localNetworkPolicy, process.execPath, ...target],
    {
      cwd: resolve(root, 'packages/api'),
      env: { ...localPreviewEnvironment, API_PORT: port },
      stdio: 'inherit',
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
