import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseSpySaved } from '../packages/web/src/components/spy/spy-model.js';
import {
  changeLibraryState,
  publicLibraryState,
  readLibraryState,
  spyLibraryDirectory,
} from '../packages/web/src/lib/spy-library-store.js';
if (process.env.TMX_SPY_MIGRATION !== '1') throw Error('Migração exige ativação explícita.');
const company = process.argv[2];
if (!company || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(company))
  throw Error('Empresa inválida.');
const source = spyLibraryDirectory();
const target = resolve('.runtime/spy-server-data');
const files = (await readdir(source)).filter((f) => /^[a-f0-9]{64}\.json$/.test(f));
if (files.length !== 1) throw Error('Escolha explícita da origem necessária.');
const { owner } = JSON.parse(await readFile(join(source, files[0]!), 'utf8'));
const state = await readLibraryState(owner, source);
const catalog = parseSpySaved(JSON.stringify(state.catalog));
if (
  catalog.length !== 29 ||
  catalog.some((o) => !o.ownerId) ||
  Object.values(state.jobs).some((j) => j.status === 'collecting' || j.error)
)
  throw Error('Cadastro/coleta pendente.');
await mkdir(target, { mode: 0o700, recursive: true });
if ((await readdir(target)).length) throw Error('Destino deve estar vazio.');
const newOwner = `company:${company}`;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const mediaSource = join(source, 'media', hash(owner));
const mediaTarget = join(target, 'media', hash(newOwner));
await mkdir(mediaTarget, { recursive: true, mode: 0o700 });
const keys = new Set(
  Object.values(state.jobs).flatMap((j) =>
    [...j.snapshots.flatMap((v) => v.ads), ...(j.partial?.ads ?? [])].flatMap((a) =>
      [a.thumbnailKey, a.pagePictureKey].filter((k): k is string => !!k),
    ),
  ),
);
let bytes = 0;
for (const key of keys) {
  const file = join(mediaSource, key);
  bytes += (await stat(file)).size;
  await copyFile(file, join(mediaTarget, key));
  await chmod(join(mediaTarget, key), 0o600);
}
if ((await readFile(join(source, '.key'))).length !== 32) throw Error('Chave inválida.');
await copyFile(join(source, '.key'), join(target, '.key'));
await chmod(join(target, '.key'), 0o600);
const saved = await changeLibraryState(
  newOwner,
  () => ({
    ...state,
    owner: newOwner,
    discoveryNamespace: state.discoveryNamespace || owner,
    catalog,
  }),
  target,
);
console.log(
  JSON.stringify({
    target,
    coverage: publicLibraryState(saved).monitoringCoverage,
    mediaFiles: keys.size,
    mediaBytes: bytes,
    catalog: saved.catalog.length,
    notices: saved.notices.length,
    creditsRemaining: saved.creditsRemaining,
  }),
);
