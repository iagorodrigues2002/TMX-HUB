import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx'))('esbuild');
await build({
  entryPoints: [fileURLToPath(new URL('./spy-server-worker.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./spy-server-worker.mjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
