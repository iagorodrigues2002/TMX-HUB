import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  addPreviewInvitation,
  createPreviewCompany,
  filterPreviewMembers,
  initialMembersPreview,
  previewOffers,
  savePreviewAccess,
} from '../src/components/admin/members-preview-model';

test('classifies only Iago and Lucas as global, reuses existing companies and isolates Studio', () => {
  const s = initialMembersPreview();
  assert.equal(s.members.length, 17);
  assert.deepEqual(
    s.members.filter((m) => m.global).map((m) => m.id),
    ['iago', 'lucas'],
  );
  assert.deepEqual(
    s.members.filter((m) => m.companyId === 'tmx').map((m) => m.id),
    ['iago', 'lucas', 'douglas'],
  );
  assert.equal(s.members.find((m) => m.id === 'yola')?.companyId, 'yola-company');
  assert.equal(s.members.filter((m) => m.pendingCompany).length, 2);
  assert.equal(s.members.filter((m) => m.access === 'studio').length, 11);
  for (const m of s.members.filter((m) => m.access === 'studio')) {
    assert.equal(m.companyId, null);
    assert.deepEqual(m.modules, ['Vídeo Studio']);
  }
});
test('onboarding creates a single personal company without touching existing bindings', () => {
  const initial = initialMembersPreview();
  const s = createPreviewCompany(initial, 'gabriel-pinto', 'Empresa QA');
  assert.equal(initial.companies.length, 2);
  assert.equal(s.companies.length, 3);
  assert.equal(s.members.find((m) => m.id === 'gabriel-pinto')?.pendingCompany, false);
  for (const id of ['iago', 'lucas', 'douglas', 'yola', 'studio-0', 'gabriel-pinto'])
    assert.throws(() => createPreviewCompany(s, id, 'Outra'));
  assert.throws(() => createPreviewCompany(s, 'enzo', ' empresa qa '));
  assert.throws(() => createPreviewCompany(s, 'enzo', ' '));
});
test('invitation paths validate company and email without granting platform access', () => {
  const s = initialMembersPreview();
  const base = {
    id: 'demo',
    name: 'Convidado QA',
    email: 'QA@example.test',
    path: 'team' as const,
    role: 'Colaborador' as const,
    companyId: 'tmx',
  };
  const next = addPreviewInvitation(s, base);
  assert.equal(next.invitations[0]?.email, 'qa@example.test');
  assert.deepEqual(next.members, s.members);
  assert.throws(() => addPreviewInvitation(next, { ...base, id: 'second' }));
  assert.throws(() => addPreviewInvitation(next, { ...base, email: 'different@example.test' }));
  assert.throws(() => addPreviewInvitation(s, { ...base, companyId: 'missing' }));
  assert.throws(() => addPreviewInvitation(s, { ...base, email: 'invalid' }));
  for (const path of ['company', 'studio'] as const)
    assert.equal(addPreviewInvitation(s, { ...base, path }).invitations[0]?.companyId, null);
  assert.throws(() => addPreviewInvitation(s, { ...base, global: true } as typeof base));
});
test('simulated collaborator edits never promote to platform admin or change other users', () => {
  const s = initialMembersPreview();
  const patch = {
    role: 'Administrador da empresa' as const,
    job: 'Operação',
    modules: ['Financeiro'],
    offers: 'selected' as const,
  };
  const n = savePreviewAccess(s, 'douglas', patch);
  const d = n.members.find((m) => m.id === 'douglas')!;
  assert.equal(d.global, false);
  assert.equal(d.companyId, 'tmx');
  assert.equal(d.offers, 'all');
  assert.deepEqual(
    n.members.filter((m) => m.id !== 'douglas'),
    s.members.filter((m) => m.id !== 'douglas'),
  );
  for (const id of ['iago', 'lucas', 'yola', 'enzo', 'studio-0'])
    assert.throws(() => savePreviewAccess(s, id, patch));
});
test('selected offers persist, deduplicate and cannot cross company boundaries', () => {
  const s = initialMembersPreview();
  const patch = {
    role: 'Colaborador' as const,
    job: 'Recuperação',
    modules: ['Upsell Intelligence'],
    offers: 'selected' as const,
    offerIds: [previewOffers[0]!.id, previewOffers[0]!.id],
  };
  const next = savePreviewAccess(s, 'douglas', patch);
  assert.deepEqual(next.members.find((m) => m.id === 'douglas')?.offerIds, [previewOffers[0]!.id]);
  assert.throws(() => savePreviewAccess(s, 'douglas', { ...patch, offerIds: ['foreign-offer'] }));
  assert.deepEqual(
    savePreviewAccess(s, 'douglas', { ...patch, offers: 'all' }).members.find(
      (m) => m.id === 'douglas',
    )?.offerIds,
    [],
  );
  assert.deepEqual(
    savePreviewAccess(s, 'douglas', { ...patch, offerIds: [] }).members.find(
      (m) => m.id === 'douglas',
    )?.offerIds,
    [],
  );
});
test('access changes validate runtime input and cannot smuggle identity or global scope', () => {
  const state = initialMembersPreview();
  const patch = {
    role: 'Colaborador' as const,
    job: 'Operação',
    modules: ['Financeiro'],
    offers: 'selected' as const,
    offerIds: [],
  };
  for (const invalid of [
    { ...patch, global: true },
    { ...patch, companyId: 'yola-company' },
    { ...patch, role: 'Dono' },
    { ...patch, modules: ['Administração global'] },
    { ...patch, modules: null },
    { ...patch, offers: 'invalid' },
    { ...patch, offerIds: 'demo-PJR_ENG' },
    { ...patch, job: 'x'.repeat(81) },
  ])
    assert.throws(
      () => savePreviewAccess(state, 'douglas', invalid as typeof patch),
      /Permissões inválidas/,
    );
  assert.deepEqual(state, initialMembersPreview());
});
test('promoting and demoting company admin keeps global identity fixed and uses explicit grants', () => {
  const s = initialMembersPreview();
  const promoted = savePreviewAccess(s, 'douglas', {
    role: 'Administrador da empresa',
    job: 'Operação',
    modules: [],
    offers: 'selected',
    offerIds: [],
  });
  const admin = promoted.members.find((m) => m.id === 'douglas')!;
  assert.equal(admin.global, false);
  assert.equal(admin.offers, 'all');
  assert.deepEqual(admin.offerIds, []);
  const demoted = savePreviewAccess(promoted, 'douglas', {
    role: 'Colaborador',
    job: 'Operação',
    modules: [],
    offers: 'selected',
    offerIds: [],
  });
  const collaborator = demoted.members.find((m) => m.id === 'douglas')!;
  assert.equal(collaborator.global, false);
  assert.deepEqual(collaborator.modules, []);
  assert.deepEqual(collaborator.offerIds, []);
  assert.equal(collaborator.offers, 'selected');
});
test('search and group filters are accent-insensitive and combine', () => {
  const s = initialMembersPreview();
  assert.equal(filterPreviewMembers(s, '', 'studio').length, 11);
  assert.equal(filterPreviewMembers(s, 'recuperacao', 'tmx')[0]?.id, 'douglas');
  assert.equal(filterPreviewMembers(s, 'Douglas', 'studio').length, 0);
});
test('legacy preview redirects to persistent company management; old fixtures stay isolated', () => {
  const route = readFileSync(
    new URL('../src/app/preview/membros/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(route, /redirect\('\/empresa\/membros'\)/);
  assert.doesNotMatch(route, /import.*MembersPreview|<MembersPreview/);
  const component = readFileSync(
    new URL('../src/components/admin/members-preview.tsx', import.meta.url),
    'utf8',
  );
  assert.match(component, /user\?\.role !== 'admin'/);
  assert.ok(
    component.indexOf("user?.role !== 'admin'") <
      component.indexOf('return <MembersPreviewContent'),
  );
  for (const file of ['members-preview.tsx', 'members-preview-model.ts']) {
    const source = readFileSync(
      new URL(`../src/components/admin/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /fetch\(|apiClient|localStorage|sessionStorage/);
  }
});
