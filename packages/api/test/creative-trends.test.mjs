import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { normalizeTrendVideos, searchCreativeTrends } from '../scripts/creative-trends.mjs';
test('trend dates stay unknown without a timestamp; unsafe ids are excluded', () => {
  const items = normalizeTrendVideos({
    videos: [
      { id: 'ABCDEFGHIJK', title: 'topic', viewCountInt: 200, publishedTime: 'yesterday' },
      { id: '../secret', title: 'bad' },
    ],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].recentConfirmed, false);
  assert.equal(items[0].publishedAt, null);
});
test('paid search is company-scoped, cached, and uncertain requests never retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'creative-trends-')),
    companyId = '00000000-0000-4000-8000-000000000001';
  try {
    await mkdir(join(root, 'ai-preview'));
    await mkdir(join(root, 'spy-library'));
    await writeFile(join(root, 'ai-preview/company.json'), JSON.stringify({ companyId }));
    const key = randomBytes(32),
      iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update('fixture-only'), cipher.final()]);
    const owner = `company:${companyId}`;
    await writeFile(join(root, 'spy-library/.key'), key);
    await writeFile(
      join(root, 'spy-library', createHash('sha256').update(owner).digest('hex') + '.json'),
      JSON.stringify({
        owner,
        provider: 'scrapecreators',
        encrypted: [iv, cipher.getAuthTag(), encrypted]
          .map((b) => b.toString('base64url'))
          .join('.'),
      }),
    );
    let calls = 0;
    const fetcher = async (url, options) => {
      calls++;
      assert.ok(url.startsWith('https://api.scrapecreators.com/v1/youtube/search?'));
      assert.equal(options.redirect, 'error');
      return Response.json({
        success: true,
        credits_charged: 1,
        videos: [
          {
            id: 'ABCDEFGHIJK',
            title: 'topic',
            viewCountInt: 123,
            publishedTime: new Date().toISOString(),
          },
        ],
      });
    };
    const input = {
      companyId,
      owner: 'test',
      niche: 'Renda extra',
      query: 'side hustle ideas',
      region: 'US',
    };
    assert.equal((await searchCreativeTrends(input, fetcher, root)).cached, false);
    assert.equal((await searchCreativeTrends(input, fetcher, root)).cached, true);
    assert.equal(calls, 1);
    await assert.rejects(() =>
      searchCreativeTrends(
        { ...input, companyId: '00000000-0000-4000-8000-000000000002' },
        fetcher,
        root,
      ),
    );
    assert.equal(calls, 1);
    const fail = async () => {
      calls++;
      throw Error('timeout');
    };
    await assert.rejects(() => searchCreativeTrends({ ...input, query: 'uncertain' }, fail, root));
    await assert.rejects(() => searchCreativeTrends({ ...input, query: 'uncertain' }, fail, root));
    assert.equal(calls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
