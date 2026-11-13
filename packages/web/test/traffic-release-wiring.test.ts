import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('traffic release keeps campaign management and the assistant wired together', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const campaigns = read('../src/components/traffic/real-campaigns.tsx');
  assert.match(campaigns, /<ManagedCampaignsTable\b/);
  assert.match(campaigns, /label="Status das contas"/);
  const management = read('../src/components/traffic/managed-campaigns-table.tsx');
  assert.match(management, /role="switch"/);
  assert.match(management, /Orçamento em massa/);
  const routes = read('../../api/src/routes/meta-control.ts');
  for (const register of ['registerTrafficManagement', 'registerTrafficCompanySettings', 'registerAiPreview']) {
    assert.match(routes, new RegExp(`${register}\\(app\\)`));
  }
});
