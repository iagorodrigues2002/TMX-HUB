import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameTimes, spyVisualFrames } from '../src/lib/spy-visual-frames';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('video frames cover opening, middle and ending rather than only thumbnail', () => {
  assert.deepEqual(frameTimes(100), [0, 10, 25, 50, 75, 95]);
  for (const duration of [0, -1, NaN, Infinity, 100000]) assert.throws(() => frameTimes(duration));
});
test('missing, carousel and private-network media are refused before download', async () => {
  for (const creativeAssets of [
    [],
    [{ kind: 'video', url: 'http://127.0.0.1/private' }],
    [{ kind: 'image', url: 'https://example.com/a.jpg' }],
  ]) {
    await assert.rejects(spyVisualFrames('/unused', { creativeAssets } as never));
  }
});
test('recovered frames are reused without another media request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spy-frame-cache-'));
  const sha = 'a'.repeat(64);
  const ad = {
    creativeAssets: [{ kind: 'video', url: 'https://video.xx.fbcdn.net/a.mp4', sha256: sha }],
  };
  const key = createHash('sha256')
    .update('frames-v1:video:' + sha)
    .digest('hex');
  const frames = [{ second: 0, image: 'data:image/jpeg;base64,YWJj' }];
  try {
    await writeFile(join(dir, key + '.json'), JSON.stringify(frames));
    assert.deepEqual(
      await spyVisualFrames(dir, ad as never, async () => {
        throw Error('Network must not be used');
      }),
      frames,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
