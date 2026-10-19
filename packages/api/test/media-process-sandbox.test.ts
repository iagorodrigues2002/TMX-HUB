import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { prepareMediaProcess } from '@page-cloner/core';
import { Worker } from 'bullmq';
import { beforeEach, expect, it, vi } from 'vitest';
import { logger } from '../src/lib/logger.js';
import { createMediaWorker } from '../src/workers/media.worker.js';
import { runPhaseCancelFfmpeg } from '../src/workers/shield.worker.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({
  promises: {
    mkdtemp: vi.fn(async () => '/tmp/media-fixture'),
    writeFile: vi.fn(async () => {}),
    readFile: vi.fn(async () => Buffer.from('fixture-output')),
    rm: vi.fn(async () => {}),
  },
}));
vi.mock('@page-cloner/core', () => ({ prepareMediaProcess: vi.fn() }));
vi.mock('bullmq', () => ({ Worker: vi.fn(() => ({ on: vi.fn() })) }));
vi.mock('../src/env.js', () => ({ env: {} }));
vi.mock('../src/lib/redis.js', () => ({ makeRedis: vi.fn(() => ({})) }));
vi.mock('../src/queues/index.js', () => ({
  MEDIA_QUEUE_NAME: 'fixture-media',
  SHIELD_QUEUE_NAME: 'fixture-shield',
}));
vi.mock('../src/lib/logger.js', () => {
  const logger = { child: () => logger, debug: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger };
});

const close = vi.fn(async () => {});
const spawnFailure = new Error('fixture spawn failure');
let outcome: 'success' | 'exit' | 'error';

beforeEach(() => {
  vi.clearAllMocks();
  outcome = 'success';
  vi.mocked(prepareMediaProcess)
    .mockReset()
    .mockResolvedValue({
      executablePath: '/usr/bin/ffmpeg',
      env: { PATH: '/usr/bin' },
      proxyUrl: '',
      close,
    });
  vi.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter() });
    queueMicrotask(() => {
      if (outcome === 'error') child.emit('error', spawnFailure);
      else {
        if (outcome === 'exit') child.stderr.emit('data', Buffer.from('fixture encode failure'));
        child.emit('close', outcome === 'success' ? 0 : 1);
      }
    });
    return child as ReturnType<typeof spawn>;
  });
});

async function runMedia() {
  const put = vi.fn(async () => {});
  createMediaWorker({
    redisUrl: 'redis://fixture.invalid',
    jobStore: {
      get: async () => ({
        inputStorageKey: 'fixture-input',
        inputFilename: 'fixture.mp4',
        aspectRatio: 'original',
        extensionMode: 'none',
        compression: 'balanced',
      }),
      setStatus: vi.fn(async () => {}),
      outputKey: () => 'fixture-output',
    } as never,
    nicheStore: {} as never,
    storage: { get: async () => ({ body: Buffer.from('fixture-input') }), put } as never,
  });
  const processor = vi.mocked(Worker).mock.calls[0]?.[1];
  if (typeof processor !== 'function') throw new Error('Media processor was not registered.');
  await processor({ data: { jobId: 'fixture' } } as never);
  expect(put).toHaveBeenCalledOnce();
}

const runShield = () =>
  runPhaseCancelFfmpeg(
    {
      inputVideo: '/tmp/fixture-input.mp4',
      whiteAudio: '/tmp/fixture-white.mp3',
      output: '/tmp/fixture-output.mp4',
      whiteVolumeDb: -22,
      compression: 'balanced',
    },
    logger,
  );

it.each([
  {
    name: 'media',
    run: runMedia,
    inputs: ['/tmp/media-fixture/input'],
    output: '/tmp/media-fixture/output.mp4',
  },
  {
    name: 'shield',
    run: runShield,
    inputs: ['/tmp/fixture-input.mp4', '/tmp/fixture-white.mp3'],
    output: '/tmp/fixture-output.mp4',
  },
])(
  '$name uses only the prepared executable and closes it on every process outcome',
  async ({ run, inputs, output }) => {
    for (const result of ['success', 'exit', 'error'] as const) {
      vi.clearAllMocks();
      outcome = result;
      if (result === 'success') await run();
      else if (result === 'error') await expect(run()).rejects.toBe(spawnFailure);
      else await expect(run()).rejects.toThrow('fixture encode failure');

      expect(prepareMediaProcess).toHaveBeenCalledWith({
        executable: 'ffmpeg',
        mode: 'local',
        inputFiles: inputs,
        outputFiles: [output],
      });
      expect(spawn).toHaveBeenCalledOnce();
      const [executable, args] = vi.mocked(spawn).mock.calls[0]!;
      expect(executable).toBe('/usr/bin/ffmpeg');
      expect(args).toEqual(expect.arrayContaining(inputs));
      for (let i = 0; i < args!.length; i++) {
        if (args![i] === '-i')
          expect(args!.slice(i - 2, i)).toEqual(['-protocol_whitelist', 'file,pipe']);
      }
      expect(args!.at(-1)).toBe(output);
      expect(close).toHaveBeenCalledOnce();
    }
  },
);

it.each([
  { name: 'media', run: runMedia },
  { name: 'shield', run: runShield },
])('$name never starts FFmpeg when the preparation cannot be created', async ({ run }) => {
  const failure = new Error('fixture preparation unavailable');
  vi.mocked(prepareMediaProcess).mockRejectedValueOnce(failure);
  await expect(run()).rejects.toBe(failure);
  expect(spawn).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it('allows only the original input when no white audio is selected', async () => {
  await runPhaseCancelFfmpeg(
    {
      inputVideo: '/tmp/input.mp4',
      output: '/tmp/output.mp4',
      whiteVolumeDb: -22,
      compression: 'none',
    },
    logger,
  );
  expect(prepareMediaProcess).toHaveBeenCalledWith({
    executable: 'ffmpeg',
    mode: 'local',
    inputFiles: ['/tmp/input.mp4'],
    outputFiles: ['/tmp/output.mp4'],
  });
  expect(fs.rm).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
