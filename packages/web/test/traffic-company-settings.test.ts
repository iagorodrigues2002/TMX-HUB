import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateTrafficSettings } from '../src/components/traffic/migrate-traffic-settings';

test('migrates company asset IDs without losing internal classifications or CT/profile links', () => {
  const inventory = migrateTrafficSettings('inventory', JSON.stringify({
    bms: [{ id: 'personal:bms:123', bm: '', owner: 'Operator' }],
    accounts: [{ id: 'personal:accounts:act_456', bm: 'personal:bms:123', usage: 'Standby' }],
  }), 'company-a');
  const structure = migrateTrafficSettings('structure', JSON.stringify([
    { id: 'profile-1', ct: 'ct-1', assets: ['personal:bms:123', 'personal:accounts:act_456'] },
  ]), 'company-a');
  assert.equal(inventory.bms[0].owner, 'Operator');
  assert.equal(inventory.accounts[0].bm, inventory.bms[0].id);
  assert.deepEqual(structure[0].assets, [inventory.bms[0].id, inventory.accounts[0].id]);
  assert.equal(structure[0].ct, 'ct-1');
  assert.equal(inventory.accounts[0].usage, 'Standby');
  const classification = { campaigns: { campaign: 'offer' }, links: {} };
  assert.deepEqual(migrateTrafficSettings('classification', JSON.stringify(classification), 'company-a'), classification);
});
