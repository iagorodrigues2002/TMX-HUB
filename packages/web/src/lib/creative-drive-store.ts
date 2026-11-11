import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type CreativeDriveCatalog,
  driveFolderId,
  readCreativeDrive,
} from './creative-drive-reader';
import {
  type CreativeDriveState,
  applyCreativeStatuses,
  applyManualCreativeMetadata,
  withCreativeDriveArchive,
} from '@page-cloner/shared/creative-drive-state';
import type { CreativeStatus } from './creative-identity';
export type { CreativeAdReview, CreativeDriveState } from '@page-cloner/shared/creative-drive-state';
const directory =
  process.env.NODE_ENV === 'test' && process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY
    ? process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY
    : join(homedir(), '.codex/local-data/tmx/creative-drive-preview');
const interval = 10 * 60_000;
export const creativeOwner = (id: string) => createHash('sha256').update(id).digest('hex');
const file = (owner: string, part: string) => {
  if (!/^[a-f0-9]{64}$/.test(owner)) throw Error('Identidade local inválida.');
  return join(directory, `${owner}.${part}.json`);
};
async function read<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}
async function save(path: string, value: unknown) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, path);
}
async function readCreativeDriveState(owner: string): Promise<CreativeDriveState> {
  const [config, result, metadata] = await Promise.all([
    read(file(owner, 'config'), { rootUrl: '', requestedAt: 0 }),
    read(file(owner, 'catalog'), {
      catalog: null as CreativeDriveCatalog | null,
      error: '',
      checkedAt: 0,
    }),
    read<CreativeDriveState['metadata']>(file(owner, 'metadata'), {}),
  ]);
  return { ...config, ...result, metadata };
}
export async function creativeDriveState(owner: string): Promise<CreativeDriveState> {
  const state = await readCreativeDriveState(owner);
  if (!state.catalog || !state.rootUrl) return state;
  return withCreativeDriveArchive(state, await read(file(owner, 'archive'), null));
}
export async function configureCreativeDrive(owner: string, rootUrl: string) {
  const rootId = driveFolderId(rootUrl);
  await save(file(owner, 'config'), {
    rootUrl: `https://drive.google.com/drive/folders/${rootId}`,
    requestedAt: Date.now(),
  });
}
const writes = new Map<string, Promise<unknown>>();
function writeCreativeMetadata(
  owner: string,
  update: (state: CreativeDriveState) => CreativeDriveState['metadata'] | undefined,
) {
  const task = (writes.get(owner) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const metadata = update(await creativeDriveState(owner));
      if (metadata) await save(file(owner, 'metadata'), metadata);
    });
  writes.set(owner, task);
  void task
    .finally(() => {
      if (writes.get(owner) === task) writes.delete(owner);
    })
    .catch(() => {});
  return task;
}

export function updateCreativeMetadata(
  owner: string,
  key: string,
  patch: { status?: CreativeStatus | null; principalId?: string },
) {
  return writeCreativeMetadata(owner, (state) => applyManualCreativeMetadata(state, key, patch));
}

export function classifyCreativeMetadata(
  owner: string,
  classify: (state: CreativeDriveState) => ReadonlyMap<string, CreativeStatus>,
) {
  return writeCreativeMetadata(owner, (state) => applyCreativeStatuses(state.metadata, classify(state)));
}

const syncing = new Set<string>();
export async function syncCreativeDrive(owner: string, force = false) {
  if (syncing.has(owner)) return;
  syncing.add(owner);
  try {
    const state = await readCreativeDriveState(owner);
    if (
      !state.rootUrl ||
      (!force && state.checkedAt >= state.requestedAt && Date.now() - state.checkedAt < interval)
    )
      return;
    let catalog = state.catalog;
    let error = '';
    try {
      catalog = await readCreativeDrive(state.rootUrl);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Falha na leitura do Drive.';
    }
    const latest = await readCreativeDriveState(owner);
    if (latest.rootUrl !== state.rootUrl || latest.requestedAt !== state.requestedAt) return;
    await save(file(owner, 'catalog'), { catalog, error, checkedAt: Date.now() });
  } finally {
    syncing.delete(owner);
  }
}
export async function syncConfiguredCreativeDrives() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const owners = (await readdir(directory))
    .filter((f) => /^[a-f0-9]{64}\.config\.json$/.test(f))
    .map((f) => f.slice(0, 64));
  for (const owner of owners) await syncCreativeDrive(owner);
}
