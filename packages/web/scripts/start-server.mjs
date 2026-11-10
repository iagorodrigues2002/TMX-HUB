import { spawn } from 'node:child_process';
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 3000).unref();
}
function run(file) {
  const child = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env });
  children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', () => {
    if (!stopping) stop(1);
  });
}
if (process.env.TMX_SPY_SERVER === '1') run('packages/web/scripts/spy-server-worker.mjs');
run('packages/web/server.js');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(0));
