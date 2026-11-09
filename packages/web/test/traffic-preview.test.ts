import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type ImportedInventory,
  initialInventory,
  mergeImportedInventory,
  saveAssetMetadata,
  selectTrafficTab,
  trafficTabs,
} from '../src/components/traffic/traffic-model';
test('direct and default traffic views never select a tab outside the grant', () => {
  assert.equal(selectTrafficTab(null, ['contingency']), 'contingency');
  assert.equal(selectTrafficTab('settings', ['contingency']), 'contingency');
  assert.equal(selectTrafficTab('campaigns', ['campaigns', 'settings']), 'campaigns');
  assert.equal(selectTrafficTab('overview', []), null);
});

test('somente metadados internos são editáveis e a origem não é mutada', () => {
  const db = initialInventory();
  const asset = db.accounts[0]!;
  const next = saveAssetMetadata(db, 'accounts', asset.id, {
    ...asset,
    name: 'Tentativa',
    external: '999',
    bm: 'outra',
    owner: ' Novo responsável ',
    supplier: 'Fornecedor',
    status: 'Desabilitado',
    usage: 'Standby',
  } as typeof asset);
  const saved = next.accounts[0]!;
  assert.equal(saved.name, asset.name);
  assert.equal(saved.external, asset.external);
  assert.equal(saved.bm, asset.bm);
  assert.equal(saved.owner, 'Novo responsável');
  assert.equal(saved.status, 'Desabilitado');
  assert.equal(saved.metaStatus, asset.metaStatus);
  assert.equal(db.accounts[0]!.status, 'Ativo');
  assert.throws(() => saveAssetMetadata(db, 'accounts', 'missing', asset));
  assert.equal(
    saveAssetMetadata(db, 'accounts', asset.id, { ...asset, owner: ' ' }).accounts[0]!.owner,
    '',
  );
  assert.throws(() =>
    saveAssetMetadata(db, 'accounts', asset.id, { ...asset, status: 'Restrito' as never }),
  );
  assert.throws(() =>
    saveAssetMetadata(db, 'accounts', asset.id, { ...asset, usage: 'Desconhecido' as never }),
  );
});

test('reimportação atualiza identidade e mantém organização interna, sem misturar conexões', () => {
  const snapshot: ImportedInventory = {
    businesses: [{ id: '123', name: 'BM real', status: null }],
    accounts: [{ id: 'act_456', name: 'Conta real', businessId: '123', status: 'Ativo' }],
    fetchedAt: '2026-11-08T12:00:00Z',
    coverage: 'businesses_from_assigned_accounts',
  };
  const imported = mergeImportedInventory(initialInventory(), snapshot, 'connection-a');
  assert.equal(imported.accounts.length, 1);
  assert.equal(imported.bms[0]!.status, null);
  assert.equal(imported.accounts[0]!.bm, imported.bms[0]!.id);
  const edited = saveAssetMetadata(imported, 'accounts', imported.accounts[0]!.id, {
    owner: 'Iago',
    supplier: 'Fornecedor A',
    status: 'Ativo',
    usage: 'Em uso',
  });
  const update = {
    ...snapshot,
    accounts: [
      { ...snapshot.accounts[0]!, name: 'Novo nome Meta', status: 'Desabilitado' as const },
    ],
  };
  const next = mergeImportedInventory(edited, update, 'connection-a');
  assert.equal(next.accounts[0]!.name, 'Novo nome Meta');
  assert.equal(next.accounts[0]!.owner, 'Iago');
  assert.equal(next.accounts[0]!.usage, 'Em uso');
  assert.equal(next.accounts[0]!.metaStatus, 'Desabilitado');
  assert.equal(mergeImportedInventory(edited, snapshot, 'connection-b').accounts[0]!.owner, '');
  assert.deepEqual(
    trafficTabs.map(([key]) => key),
    ['overview', 'campaigns', 'windows', 'contingency', 'settings'],
  );
});
