import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMediaProcess } from '../src/fetch/media-process.js';
import { downloadManifestToFile } from '../src/vsl/download.js';

const mocks = vi.hoisted(() => ({
  proxyClose: vi.fn<() => Promise<void>>(),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: (
    _executable: string,
    _args: string[],
    _options: object,
    callback: (error: null, stdout: string, stderr: string) => void,
  ) => callback(null, '', ''),
  spawn: mocks.spawn,
}));
vi.mock('../src/fetch/egress-proxy.js', () => ({
  startPublicEgressProxy: async () => ({
    proxyUrl: 'http://127.0.0.1:45678',
    close: mocks.proxyClose,
  }),
}));
vi.mock('../src/fetch/public-network.js', () => ({
  assertPublicUrl: async () => undefined,
}));

describe('preparation resource cleanup failures', () => {
  const outputPaths = new Set<string>();
  let fixtureDirectory: string;
  let exitCode = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.proxyClose.mockResolvedValue(undefined);
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'preparation-cleanup-test-'));
    exitCode = 0;
    mocks.spawn.mockImplementation((wrapper: string, args: string[]) => {
      const output = args.at(-1)!;
      outputPaths.add(output);
      writeFileSync(output, 'synthetic media');
      const child = Object.assign(new EventEmitter(), {
        stderr: new PassThrough(),
        kill: vi.fn(() => true),
      });
      queueMicrotask(() => {
        if (exitCode !== 0) child.stderr.emit('data', Buffer.from('synthetic ffmpeg failure'));
        child.emit('close', exitCode, null);
      });
      return child;
    });
  });

  afterEach(async () => {
    for (const output of outputPaths) await rm(output, { force: true });
    await rm(fixtureDirectory, { recursive: true, force: true });
    outputPaths.clear();
  });

  async function preparation(outputFiles: string[] = []) {
    const instance = await prepareMediaProcess({
      executable: process.execPath,
      mode: 'public',
      outputFiles,
    });
    return instance;
  }

  it('propagates proxy cleanup failure without removing the executable', async () => {
    const failure = new Error('synthetic proxy cleanup failure');
    mocks.proxyClose.mockRejectedValue(failure);
    const instance = await preparation();

    await expect(instance.close()).rejects.toBe(failure);
    expect((await stat(instance.executablePath)).isFile()).toBe(true);
  });

  it('shares one cleanup promise across concurrent and repeated closes', async () => {
    const instance = await preparation();
    const first = instance.close();
    const second = instance.close();
    await Promise.all([first, second]);

    expect(second).toBe(first);
    expect(instance.close()).toBe(first);
    await instance.close();
    expect(mocks.proxyClose).toHaveBeenCalledOnce();
  });

  it('does not remove the caller-owned output when cleanup succeeds', async () => {
    const output = join(fixtureDirectory, 'output.mp4');
    const instance = await preparation([output]);
    await writeFile(output, 'synthetic media');

    await instance.close();

    expect(await readFile(output, 'utf8')).toBe('synthetic media');
    expect((await stat(instance.executablePath)).isFile()).toBe(true);
  });

  it('deletes a completed download if cleanup fails before its path reaches the caller', async () => {
    mocks.proxyClose.mockRejectedValue(new Error('synthetic proxy cleanup failure'));

    await expect(
      downloadManifestToFile('https://fixture.invalid/media.mp4', 'mp4', {
        ffmpegPath: process.execPath,
      }),
    ).rejects.toThrow();

    expect(outputPaths.size).toBe(1);
    for (const output of outputPaths)
      await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(mocks.proxyClose).toHaveBeenCalledOnce();
  });

  it('preserves the ffmpeg failure when cleanup also fails', async () => {
    exitCode = 1;
    mocks.proxyClose.mockRejectedValue(new Error('synthetic proxy cleanup failure'));

    await expect(
      downloadManifestToFile('https://fixture.invalid/media.mp4', 'mp4', {
        ffmpegPath: process.execPath,
      }),
    ).rejects.toMatchObject({
      code: 'ffmpeg_failed',
    });

    for (const output of outputPaths)
      await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(mocks.proxyClose).toHaveBeenCalledOnce();
  });

  it('returns a completed download after successful cleanup and keeps the output available', async () => {
    const result = await downloadManifestToFile('https://fixture.invalid/media.mp4', 'mp4', {
      ffmpegPath: process.execPath,
    });

    expect(result.bytes).toBe(Buffer.byteLength('synthetic media'));
    expect(await readFile(result.filePath, 'utf8')).toBe('synthetic media');
    expect(mocks.proxyClose).toHaveBeenCalledOnce();
  });
});
