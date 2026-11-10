import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assignSpyRegisteredOwners,
  parseSpySaved,
  safeSpyUrl,
  spySourceType,
  validateSpyOffer,
} from '../src/components/spy/spy-model';
import seed from './fixtures/spy-catalog';
test('Spy binds legacy default to registered Douglas Riti and preserves other assignments', () => {
  const base = parseSpySaved(JSON.stringify(seed))[0]!;
  const users = [
    { id: 'real-duas', name: 'Douglas Riti' },
    { id: 'other-user', name: 'Outro' },
  ];
  const [duas, other, missing] = assignSpyRegisteredOwners(
    [base, { ...base, owner: 'Outro' }, { ...base, owner: 'Anterior' }],
    users,
  );
  assert.equal(duas.ownerId, 'real-duas');
  assert.equal(duas.owner, 'Douglas Riti');
  assert.equal(other.ownerId, 'other-user');
  assert.equal(missing.owner, 'Anterior');
  assert.equal(assignSpyRegisteredOwners([base], [])[0], base);
  assert.equal(assignSpyRegisteredOwners([duas], users)[0], duas);
  assert.equal(
    assignSpyRegisteredOwners([duas], [{ id: 'real-duas', name: 'Duas atualizado' }])[0].owner,
    'Duas atualizado',
  );
});
test('Spy preserves the 29 source records, repeated offer names and multiple rich links', () => {
  const rows = parseSpySaved(JSON.stringify(seed));
  assert.equal(rows.length, 29);
  assert.equal(rows.filter((o) => o.name === 'Oferta repetida').length, 5);
  const simple = rows.find((o) => o.name === 'Oferta com vários links')!;
  assert.equal(simple.links.filter((l) => l.kind === 'presell').length, 3);
  assert.equal(simple.links.filter((l) => l.kind === 'vsl').length, 2);
  assert.ok(rows.filter((o) => o.links.some((l) => l.kind === 'folder')).length >= 6);
  assert.ok(rows.every((o) => o.observations.length === 0 && o.monitorStartedAt === null));
});

test('Spy supports Quiz, TSL and VSL without requiring a VSL and preserves existing assignments', () => {
  const offer = parseSpySaved(JSON.stringify(seed))[0]!;
  assert.equal(offer.owner, 'Douglas Hit');
  assert.equal(offer.funnelType, 'Não informado');
  for (const funnelType of ['Quiz', 'TSL', 'VSL'] as const)
    assert.equal(
      validateSpyOffer({
        ...offer,
        funnelType,
        links: offer.links.filter((l) => l.kind !== 'vsl'),
      }),
      null,
    );
  const saved = parseSpySaved(
    JSON.stringify([
      {
        ...offer,
        owner: 'Responsável anterior',
        funnelType: 'Quiz',
        driveNormalized: true,
        links: offer.links.filter((l) => l.kind !== 'folder'),
      },
    ]),
  )[0]!;
  assert.equal(saved.owner, 'Responsável anterior');
  assert.equal(saved.funnelType, 'Quiz');
  assert.ok(!saved.links.some((l) => l.kind === 'folder'));
  assert.ok(
    validateSpyOffer({
      ...offer,
      links: [{ kind: 'folder', label: 'Drive', url: 'https://example.test/folder' }],
    }),
  );
});
test('Spy validates persisted offers and separates domain searches from advertiser pages', () => {
  assert.equal(safeSpyUrl('javascript:alert(1)'), null);
  assert.equal(safeSpyUrl('https://user:secret@example.test'), null);
  assert.equal(
    spySourceType('https://www.facebook.com/ads/library/?q=example.com'),
    'Busca por domínio / termo',
  );
  assert.equal(
    spySourceType('https://www.facebook.com/ads/library/?view_all_page_id=123'),
    'Página anunciante',
  );
  assert.throws(() =>
    parseSpySaved(
      JSON.stringify([{ ...seed[0], links: [{ kind: 'library', url: 'javascript:alert(1)' }] }]),
    ),
  );
  assert.throws(() => parseSpySaved('{}'));
  assert.ok(validateSpyOffer({ ...parseSpySaved(JSON.stringify(seed))[0]!, name: '' }));
});
test('Spy release exposes its page and permission-scoped menu without the preview gate', () => {
  const page = readFileSync(new URL('../src/app/spy/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /notFound\(\)/);
  const nav = readFileSync(new URL('../src/components/hub/nav-config.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(nav, /localPreviewOnly: true/);
  for (const id of ['spy-offers', 'spy-monitor', 'spy-cloning', 'spy-settings'])
    assert.ok(nav.includes(id));
});
