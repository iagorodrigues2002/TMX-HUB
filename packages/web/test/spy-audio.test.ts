import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spyAudio } from '../src/lib/spy-audio';
import type { LibraryAd } from '../src/lib/spy-library-reader';

test('extracts real audio once and reuses it without downloading again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmx-audio-extract-'));
  const binary = process.platform === 'darwin' ? '/opt/homebrew/bin/ffmpeg' : '/usr/bin/ffmpeg';
  try {
    const file = join(root, 'sample.mp4');
    execFileSync(
      binary,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=32x32:duration=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-shortest',
        '-c:v',
        'mpeg4',
        '-c:a',
        'aac',
        file,
      ],
      { timeout: 10000 },
    );
    const video = await readFile(file);
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response(video, { headers: { 'content-type': 'video/mp4' } });
    };
    const ad = {
      id: '123',
      creativeAssets: [{ kind: 'video', url: 'https://video.fbcdn.net/sample.mp4' }],
    } as LibraryAd;
    const audio = await spyAudio(root, ad, false, fetcher);
    assert.equal(audio?.toString('ascii', 0, 4), 'RIFF');
    assert.ok(audio!.length >= 32000);
    assert.deepEqual(await spyAudio(root, ad, true, fetcher), audio);
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('opening transcription never downloads; remote URLs and oversized videos are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tmx-audio-'));
  const ad = {
    id: '123',
    creativeAssets: [{ kind: 'video', url: 'https://video.fbcdn.net/a.mp4' }],
  } as LibraryAd;
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return new Response('x', {
      headers: { 'content-type': 'video/mp4', 'content-length': '999999999' },
    });
  };
  try {
    assert.equal(await spyAudio(root, ad, true, fetcher), null);
    assert.equal(calls, 0);
    await assert.rejects(
      spyAudio(
        root,
        { ...ad, creativeAssets: [{ kind: 'video', url: 'http://127.0.0.1/secret' }] },
        false,
        fetcher,
      ),
    );
    assert.equal(calls, 0);
    await assert.rejects(spyAudio(root, ad, false, fetcher), /32 MB/);
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
