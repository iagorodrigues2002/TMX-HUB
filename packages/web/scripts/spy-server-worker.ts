import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spyLibraryDirectory, tickLibraryUsers } from '../src/lib/spy-library-store';
if (process.env.TMX_SPY_SERVER !== '1' || !process.env.TMX_SPY_DIRECTORY?.startsWith('/data/'))
  throw Error('Spy exige armazenamento persistente configurado.');
const dir = spyLibraryDirectory();
await mkdir(dir, { recursive: true, mode: 0o700 });
let busy = false;
let stopping = false;
async function heartbeat() {
  const tmp = join(dir, `worker-status.${process.pid}.tmp`);
  await writeFile(tmp, JSON.stringify({ at: new Date().toISOString(), running: !stopping }), {
    mode: 0o600,
  });
  await rename(tmp, join(dir, 'worker-status.json'));
}
const tick = async () => {
  if (busy || stopping) return;
  busy = true;
  try {
    await tickLibraryUsers(dir);
  } finally {
    busy = false;
  }
};
const heart = setInterval(() => {
  void heartbeat().catch(() => process.exit(1));
}, 15000);
const timer = setInterval(() => {
  void tick().catch(() => {});
}, 30000);
await heartbeat();
void tick().catch(() => {});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    stopping = true;
    clearInterval(heart);
    clearInterval(timer);
    void heartbeat().finally(() => process.exit(0));
  });
