import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSpyVisualResults, recoveredReferencesSchema } from '../src/lib/spy-visual-results';
test('saved summaries stay scoped to company, offer and completed validated results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-result-test-'));
  const company = '69706e9a-95ad-493e-b4ab-4a6de7541adc',
    offer = '995e6bfd-8c26-47fb-9614-0a02a7dd97b0';
  const record = {
    status: 'complete',
    companyId: company,
    offerId: offer,
    version: 'spy-frames-v1',
    at: '2026-11-13T15:00:00.000Z',
    ads: ['123', '456'],
    costMicros: 8000,
    costReserved: false,
    result: {
      classification: 'variation',
      reason: 'Changed text',
      similarities: [],
      differences: ['Text'],
      limitations: ['Frames only'],
    },
  };
  try {
    await writeFile(join(dir, 'a'.repeat(64) + '.json'), JSON.stringify(record));
    await writeFile(
      join(dir, 'b'.repeat(64) + '.json'),
      JSON.stringify({ ...record, companyId: '69706e9a-95ad-493e-b4ab-4a6de7541add' }),
    );
    await writeFile(
      join(dir, 'c'.repeat(64) + '.json'),
      JSON.stringify({ ...record, status: 'pending' }),
    );
    await writeFile(
      join(dir, 'd'.repeat(64) + '.json'),
      JSON.stringify({ ...record, offerId: '995e6bfd-8c26-47fb-9614-0a02a7dd97b1' }),
    );
    await writeFile(join(dir, 'e'.repeat(64) + '.json'), '{broken');
    const result = await readSpyVisualResults(dir, company, offer);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.result.classification, 'variation');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('recovered references reject invalid identifiers and invalid distance', () => {
  const reference = {
    id: '456',
    at: '2026-11-12T12:00:00.000Z',
    pageName: 'Page',
    distance: 5,
    method: 'thumbnail_similarity',
  };
  assert.equal(
    recoveredReferencesSchema.safeParse({ references: { '123': reference } }).success,
    true,
  );
  assert.equal(
    recoveredReferencesSchema.safeParse({ references: { '../foreign': reference } }).success,
    false,
  );
  assert.equal(
    recoveredReferencesSchema.safeParse({ references: { '123': { ...reference, distance: 65 } } })
      .success,
    false,
  );
});
