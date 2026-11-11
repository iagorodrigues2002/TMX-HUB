import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  creativeCatalogRows,
  demoCreativeAds,
} from '../src/components/traffic/creative-workspace-model';
import {
  type CreativeDriveCatalog,
  driveFolderId,
  parseDriveListing,
  readCreativeDrive,
} from '../src/lib/creative-drive-reader';
import { creativeIdentity, creativeStatuses } from '../src/lib/creative-identity';

const root = 'root_folder_123456';
const offer = 'offer_folder_12345';
const batch = 'batch_folder_12345';
const listing = (name: string, entries: { id: string; name: string; folder?: boolean }[]) =>
  `<title>${name}</title><div class="flip-entries">${entries.map((e) => `<div class="flip-entry" id="entry-${e.id}"><a href="https://drive.google.com/${e.folder ? 'drive/folders/' : 'file/d/'}${e.id}${e.folder ? '' : '/view'}"><div class="flip-entry-thumb"><img src="https://lh3.googleusercontent.com/example=s190"/></div><div class="flip-entry-title">${e.name}</div></a></div>`).join('')}</div>`;
const pages: Record<string, string> = {
  [root]: listing('Root', [{ id: offer, name: '[MX] - SLM_DE', folder: true }]),
  [offer]: listing('[MX] - SLM_DE', [{ id: batch, name: 'L2', folder: true }]),
  [batch]: listing('L2', [
    { id: 'creative_file_001', name: 'SLM_DE_AD01_L2.mp4' },
    { id: 'creative_file_002', name: 'SLM_DE_AD01_L2_reedito.mp4' },
  ]),
};
const fetcher: typeof fetch = async (input) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'drive.google.com');
  assert.equal(url.pathname, '/embeddedfolderview');
  const page = pages[url.searchParams.get('id')!];
  return new Response(page ?? 'not found', { status: page ? 200 : 404 });
};
test('canonical identity joins creative/criative/reedito and normalizes offer, AD and leva', () => {
  const key = 'SLM_DE:AD1:L2';
  for (const name of [
    'SLM_DE_AD01_L2.mp4',
    'SLM_DE_AD1_LEVA_02_creative',
    'SLM_DE_L2_AD01_criative_reedito',
  ])
    assert.equal(creativeIdentity(name, 'SLM_DE')?.key, key);
  assert.equal(creativeIdentity('SLMD_AD01', 'SLMD', 'L2')?.key, key);
  assert.equal(
    creativeIdentity('PJR_ESP_RIPADO_04_LEVA_02_creative', 'PJR_ESP')?.key,
    'PJR_ESP:AD4:L2',
  );
  assert.equal(creativeIdentity('SLM_DE_AD01_L2', 'PJR_ESP'), null);
  assert.equal(creativeIdentity('SLM_DE_AD01_L2', 'SLM_DE', 'L3'), null);
  assert.equal(creativeIdentity('mystery.mp4', 'SLM_DE'), null);
  assert.equal(creativeIdentity('SLM_DE_AD01', 'SLM_DE')?.batch, null);
});
test('public Drive reader traverses offers and levas completely and imports variants once', async () => {
  const catalog = await readCreativeDrive(
    `https://drive.google.com/drive/folders/${root}`,
    fetcher,
  );
  assert.equal(catalog.foldersRead, 3);
  assert.equal(catalog.files.length, 2);
  assert.equal(catalog.files[0]!.identity?.key, 'SLM_DE:AD1:L2');
  assert.equal(catalog.files[0]!.thumbnail, 'https://lh3.googleusercontent.com/example=s190');
  assert.equal(catalog.offers[0]!.code, 'SLM_DE');
  await assert.rejects(() =>
    readCreativeDrive(`https://drive.google.com/drive/folders/${root}`, async (input) =>
      String(input).endsWith(batch) ? new Response('login', { status: 403 }) : fetcher(input),
    ),
  );
});
test('Drive parser rejects login, incomplete listings, duplicate IDs and unsafe links', () => {
  assert.throws(() => parseDriveListing('<title>Sign in</title>'));
  assert.throws(() => parseDriveListing(pages[root]! + ' nextPageToken'));
  assert.throws(() =>
    parseDriveListing(
      listing('x', [
        { id: offer, name: 'a' },
        { id: offer, name: 'b' },
      ]),
    ),
  );
  assert.throws(() =>
    parseDriveListing(
      pages[root]!.replace(
        'https://drive.google.com/drive/folders/',
        'https://evil.test/drive/folders/',
      ),
    ),
  );
  assert.throws(() =>
    parseDriveListing(
      listing(
        'big',
        Array.from({ length: 100 }, (_, i) => ({
          id: `valid_folder_id_${i}`,
          name: 'a',
          folder: true,
        })),
      ),
    ),
  );
  for (const url of [
    'http://drive.google.com/drive/folders/' + root,
    'https://user@drive.google.com/drive/folders/' + root,
    'https://drive.google.com.evil.test/drive/folders/' + root,
  ])
    assert.throws(() => driveFolderId(url));
});
test('creative rows aggregate Meta versions once, keep unknown Drive metrics and prefer clean file names', async () => {
  const catalog = await readCreativeDrive(
    `https://drive.google.com/drive/folders/${root}`,
    fetcher,
  );
  const base = {
    ...demoCreativeAds({ from: '2026-11-10', to: '2026-11-10' }, 'BRL')[0]!,
    offer: 'SLM_DE',
    batch: 'Leva 2',
    name: 'SLM_DE_AD01_L2_creative',
  };
  const second = { ...base, id: 'second', adIds: ['second'], name: 'SLM_DE_AD01_L2_reedito' };
  const rows = creativeCatalogRows([base, second, base], catalog);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.amounts.spend, base.amounts.spend! * 2);
  assert.equal(rows[0]!.adIds.length, 2);
  assert.equal(rows[0]!.principal?.id, catalog.files[0]!.id);
  assert.equal(
    creativeCatalogRows([base], catalog, {
      [rows[0]!.id]: { principalId: catalog.files[1]!.id },
    })[0]!.principal?.id,
    catalog.files[1]!.id,
  );
  assert.equal(creativeCatalogRows([], catalog)[0]!.amounts.spend, null);
  const newName = 'SLM_DE_L2_AD01_B1_H1';
  const variantCatalog = {
    ...catalog,
    files: [
      ...catalog.files,
      ...['drive_variant_raw', 'drive_variant_compressed'].map((id) => ({
        ...catalog.files[0]!,
        id,
        name: newName + '.mp4',
      })),
    ],
  };
  const [original, variant] = creativeCatalogRows([base], variantCatalog);
  assert.equal(original!.adIds.length, 1);
  assert.equal(original!.files.length, 2);
  assert.equal(variant!.id, 'SLM_DE:AD1:L2:B1_H1');
  assert.equal(variant!.adIds.length, 0);
  assert.equal(variant!.files.length, 2);
  assert.equal(variant!.principal, null);
  assert.equal(variant!.amounts.spend, null);
  variantCatalog.files.at(-1)!.name = newName + '_creative.mp4';
  const withDelivery = creativeCatalogRows([{ ...base, name: newName }], variantCatalog);
  const linked = withDelivery.find((row) => row.id === variant!.id)!;
  assert.equal(linked.adIds.length, 1);
  assert.equal(linked.principal?.id, 'drive_variant_raw');
  const manual = creativeCatalogRows([], variantCatalog, {
    [linked.id]: { principalId: 'drive_variant_compressed' },
  });
  assert.equal(
    manual.find((row) => row.id === linked.id)?.principal?.id,
    'drive_variant_compressed',
  );
  const ambiguous = {
    ...catalog,
    files: [
      ...catalog.files,
      {
        ...catalog.files[0]!,
        id: 'different_leva_123',
        identity: creativeIdentity('SLM_DE_AD01_L3', 'SLM_DE'),
        batch: 'Leva 3',
      },
    ],
  } satisfies CreativeDriveCatalog;
  const noBatch = { ...base, name: 'SLM_DE_AD01', batch: 'Sem leva' };
  assert.equal(creativeCatalogRows([noBatch], catalog).length, 1);
  const sameWithoutFile = creativeCatalogRows(
    [noBatch, { ...noBatch, id: 'another-unknown-ad', adIds: ['another-unknown-ad'] }],
    null,
  );
  assert.equal(sameWithoutFile.length, 1);
  assert.equal(sameWithoutFile[0]!.adIds.length, 2);
  const unnamed = { ...noBatch, name: 'Criativo antigo sem nomenclatura' };
  assert.equal(
    creativeCatalogRows(
      [unnamed, { ...unnamed, id: 'duplicate-legacy', adIds: ['duplicate-legacy'] }],
      null,
    ).length,
    1,
  );
  const exactLegacy = {
    ...catalog,
    files: [
      { ...catalog.files[0]!, name: unnamed.name + '.mp4', batch: 'Sem leva', identity: null },
    ],
  };
  const matchedLegacy = creativeCatalogRows([unnamed], exactLegacy);
  assert.equal(matchedLegacy.length, 1);
  assert.equal(matchedLegacy[0]!.files.length, 1);
  assert.equal(matchedLegacy[0]!.adIds.length, 1);
  assert.equal(
    creativeCatalogRows([noBatch], ambiguous).find((r) => r.adIds.length)!.files.length,
    0,
  );
  const exactFile = {
    ...ambiguous,
    files: ambiguous.files.map((file) => ({ ...file, archived: true as const })),
  };
  const historical = creativeCatalogRows(
    [noBatch, { ...base, id: 'exact', name: 'slm_de_ad01_l2.MP4', batch: 'Sem leva' }],
    exactFile,
  );
  assert.equal(historical.find((row) => row.id === 'SLM_DE:AD1:L2')?.sources[0]?.id, 'exact');
  assert.equal(historical.find((row) => row.id === 'SLM_DE:AD1:LPENDING')?.files.length, 0);
  const unclassified = { ...noBatch, offer: 'Sem oferta' };
  const checked = {
    name: unclassified.name,
    campaign: unclassified.campaign,
    offer: 'SLM_DE',
    batch: 'Sem leva',
  };
  const reviewed = (decision: typeof checked & { fileId?: string }) =>
    creativeCatalogRows([unclassified], ambiguous, {}, { [unclassified.id]: decision })
      .find((row) => row.sources.length)!;
  assert.equal(reviewed(checked).offer, 'SLM_DE');
  assert.equal(reviewed(checked).files.length, 0);
  assert.equal(reviewed({ ...checked, fileId: 'different_leva_123' }).id, 'SLM_DE:AD1:L3');
  assert.equal(reviewed({ ...checked, batch: 'Leva 2', fileId: 'different_leva_123' }).files.length, 0);
  assert.equal(reviewed({ ...checked, campaign: 'Outra campanha' }).offer, 'SEM_OFERTA');
});
test('local storage preserves status and principal across sync, isolates owners, retains last good catalog on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tmx-drive-test-'));
  process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY = directory;
  const original = globalThis.fetch;
  try {
    const store = await import('../src/lib/creative-drive-store');
    const owner = store.creativeOwner('synthetic-test');
    const key = 'SLM_DE:AD1:L2';
    globalThis.fetch = fetcher;
    await store.configureCreativeDrive(owner, `https://drive.google.com/drive/folders/${root}`);
    await store.syncCreativeDrive(owner, true);
    const archiveId = 'archive_creative_file_001';
    await writeFile(join(directory, `${owner}.archive.json`), JSON.stringify({
      rootId: root,
      files: [
        { id: archiveId, name: 'ad01-l2.mp4', offer: 'SLM_DE', leva: 2 },
        { id: 'archive_conflict_001', name: 'ad01-l3.mp4', offer: 'SLM_DE', leva: 2 },
      ],
    }));
    await store.updateCreativeMetadata(owner, key, { principalId: archiveId });
    await store.syncCreativeDrive(owner, true);
    for (const status of creativeStatuses)
      await store.updateCreativeMetadata(owner, key, { status });
    await store.updateCreativeMetadata(owner, key, { principalId: 'creative_file_002' });
    const valid = 'SLM_DE:AD2:L2';
    const rejected = 'SLM_DE:AD3:L2';
    const ordinary = 'SLM_DE:AD4:L2';
    const cleared = 'SLM_DE:AD5:L2';
    const previous = 'SLM_DE:AD6:L2';
    const beforeReclassification = await store.creativeDriveState(owner);
    await writeFile(
      join(directory, `${owner}.metadata.json`),
      JSON.stringify({ ...beforeReclassification.metadata, [previous]: { status: 'Não validado' } }),
    );
    await Promise.all([
      store.updateCreativeMetadata(owner, valid, { status: 'Validado' }),
      store.updateCreativeMetadata(owner, cleared, { status: null }),
      store.classifyCreativeMetadata(owner, () =>
        new Map([
          [valid, 'Não validado'],
          [rejected, 'Não validado'],
          [key, 'Testando'],
          [cleared, 'Testando'],
          [ordinary, 'Stand by'],
          [previous, 'Testando'],
        ]),
      ),
    ]);
    await store.classifyCreativeMetadata(owner, () =>
      new Map([[valid, 'Stand by'], [rejected, 'Validado'], [key, 'Testando'], [ordinary, 'Testando']]),
    );
    const saved = await store.creativeDriveState(owner);
    assert.deepEqual(saved.catalog?.files.filter((item) => item.archived).map((item) => item.id), [archiveId]);
    assert.equal(saved.metadata[key]?.status, 'Stand by');
    assert.equal(saved.metadata[key]?.principalId, 'creative_file_002');
    assert.equal(saved.metadata[valid]?.status, 'Validado');
    assert.equal(saved.metadata[rejected]?.status, 'Não validado');
    assert.equal(saved.metadata[ordinary]?.status, 'Testando');
    assert.equal(saved.metadata[cleared]?.status, null);
    assert.equal(saved.metadata[previous]?.status, 'Testando');
    assert.equal((await store.creativeDriveState(store.creativeOwner('other-test'))).catalog, null);
    await assert.rejects(() =>
      store.updateCreativeMetadata(owner, key, { principalId: 'wrong_file_12345' }),
    );
    globalThis.fetch = async () => new Response('denied', { status: 403 });
    await store.syncCreativeDrive(owner, true);
    const failed = await store.creativeDriveState(owner);
    assert.ok(failed.error);
    assert.deepEqual(failed.catalog, saved.catalog);
    assert.deepEqual(failed.metadata, saved.metadata);
  } finally {
    globalThis.fetch = original;
    delete process.env.TMX_CREATIVE_DRIVE_TEST_DIRECTORY;
    await rm(directory, { recursive: true, force: true });
  }
});
